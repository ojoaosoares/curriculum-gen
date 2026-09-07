import os
import re
import json
import hashlib
from typing import List, Optional
from openai import OpenAI
from curriculum_gen.models import (
    ExperienceItem,
    ProjectItem,
    AwardOrLeadershipItem,
    JobContext,
)

# In-memory deterministic cache to eliminate duplicate token consumption on re-runs
_LLM_CACHE = {}


def _condense_job_context(job_desc: str, max_chars: int = 400) -> str:
    """
    Token reduction strategy: Prunes repetitive boilerplate (HR policy, benefits, legal statements)
    from job descriptions, keeping only dense technical requirements and core skills.
    """
    if not job_desc:
        return ""
    lines = [line.strip() for line in job_desc.splitlines() if line.strip()]
    filtered = []
    stop_phrases = ["equal opportunity", "benefits include", "health insurance", "401k", "we are an employer", "clt ou pj"]
    for l in lines:
        if not any(sp in l.lower() for sp in stop_phrases):
            filtered.append(l)
    cleaned = " ".join(filtered)
    return cleaned[:max_chars]


def _clean_latex_bullet(bullet: str) -> str:
    """
    Sanitizes an individual bullet string:
    - Decodes literal unicode escapes (\\u003c, \\u00e7, etc.)
    - Converts HTML formatting (<b>, <strong>, <i>, <em>) to LaTeX (\\textbf{}, \\textit{})
    - Repairs mangled \\t+extbf or extbf without backslash
    - Ensures LaTeX % is escaped as \\%
    - Strips stray HTML or unwanted artifacts
    """
    if not bullet:
        return ""

    text = bullet.strip()

    # 1. Decode literal \\uXXXX sequences (e.g. \\u003c -> <, \\u00e7 -> ç)
    try:
        text = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), text)
    except Exception:
        pass

    # 2. Convert HTML tags to LaTeX
    text = re.sub(r"<(?:b|strong)\b[^>]*>(.*?)(?:</+<?(?:b|strong)>|</(?:b|strong)>)", r"\\textbf{\1}", text, flags=re.IGNORECASE)
    text = re.sub(r"<(?:i|em)\b[^>]*>(.*?)(?:</+<?(?:i|em)>|</(?:i|em)>)", r"\\textit{\1}", text, flags=re.IGNORECASE)
    # Strip any remaining HTML tags
    text = re.sub(r"</?[a-zA-Z][^>]*>", "", text)

    # 3. Repair mangled LaTeX commands caused by JSON tab/escape decoding
    # E.g. "\t extbf{...}" or standalone "extbf{...}" or "extbfWord"
    text = re.sub(r"(\t|(?<=\s)|^)(?:ext|\\text)(bf|it)\{([^}]+)\}", r"\\text\2{\3}", text)
    text = re.sub(r"(\t|(?<=\s)|^)ext(bf|it)([\w/-]+)", r"\\text\2{\3}", text)

    # 4. Clean up any accidental quadruple or double backslashes in commands
    text = re.sub(r"\\\\(textbf|textit|href|emph)", r"\\\1", text)

    # 5. Ensure unescaped percent signs are escaped for LaTeX
    text = re.sub(r"(?<!\\)%", r"\%", text)

    # 6. Normalize whitespace
    text = re.sub(r"[ \t]+", " ", text).strip()

    return text


def safe_parse_json_bullets(text: str) -> List[str]:
    """
    Robust JSON parser for LLM responses containing LaTeX syntax.
    Preprocesses LaTeX backslashes so json.loads does not decode \\textbf as tab+extbf.
    Applies _clean_latex_bullet to every parsed bullet point.
    """
    if not text:
        return []

    # Clean markdown code blocks if present
    if text.startswith("```json"):
        text = text.replace("```json", "", 1).rstrip("```").strip()
    elif text.startswith("```"):
        text = text.replace("```", "", 1).rstrip("```").strip()

    # Pre-process LaTeX escapes before json.loads:
    # Escape single backslashes in LaTeX commands so \t in \textbf isn't parsed as ASCII 9 (tab)
    # and unescaped \href, \%, \_ don't break json.loads.
    cleaned_json = re.sub(r"(?<!\\)\\(textbf|textit|href|emph|url|%|_|&|\$|#)", r"\\\\\1", text)
    cleaned_json = re.sub(r'\\([^"\\/bfnrtu])', r'\\\\\1', cleaned_json)

    raw_bullets: List[str] = []

    # 1. Try json.loads on preprocessed JSON
    try:
        data = json.loads(cleaned_json)
        if isinstance(data, dict) and "bullets" in data:
            raw_bullets = [str(b).strip() for b in data["bullets"] if str(b).strip()]
        elif isinstance(data, list):
            raw_bullets = [str(b).strip() for b in data if str(b).strip()]
    except Exception:
        pass

    # 2. Fallback: try raw text json.loads
    if not raw_bullets:
        try:
            data = json.loads(text)
            if isinstance(data, dict) and "bullets" in data:
                raw_bullets = [str(b).strip() for b in data["bullets"] if str(b).strip()]
            elif isinstance(data, list):
                raw_bullets = [str(b).strip() for b in data if str(b).strip()]
        except Exception:
            pass

    # 3. Fallback: regex extraction of strings from JSON array
    if not raw_bullets:
        matches = re.findall(r'"((?:[^"\\]|\\.)*)"', text)
        if matches:
            candidates = [m for m in matches if m != "bullets" and len(m) > 15]
            if candidates:
                raw_bullets = candidates

    # Apply _clean_latex_bullet to every extracted bullet
    cleaned_bullets = []
    for b in raw_bullets:
        cleaned = _clean_latex_bullet(b)
        if cleaned:
            cleaned_bullets.append(cleaned)

    return cleaned_bullets


SYSTEM_PROMPT = """You are an elite technical resume coach and ATS optimization specialist.
Your mission is to craft bullet points following the strict Google XYZ Formula:
"Accomplished [X], as measured by [Y], by doing [Z]"

CRITICAL RULES:
1. STRICT ROLE GROUNDING & ZERO HALLUCINATION:
   - NEVER invent fake metrics, statistics, percentages, or achievements.
   - NEVER transfer technologies, tools, or responsibilities from the Target Job Context into a role where they were not used.
   - The candidate's source bullets are the SOLE factual authority for their work at that company.
   - If a role is Web & Mobile development, all bullets MUST remain Web & Mobile development. NEVER add low-level networking, kernel bypass, or unrelated domains to a web role or vice-versa.
   - If no quantitative metric exists in the source, highlight concrete technical architecture, tooling, and operational outcomes without inventing numbers.

2. STYLE & HIGHLIGHTING (LATEX ONLY):
   - Highlight key metrics and core technologies using LaTeX \\textbf{...} syntax (e.g., \\textbf{51\\% latency reduction}, \\textbf{React.js}).
   - NEVER use HTML tags (NO <b>, NO <strong>, NO <i>, NO <em>).
   - Use strong, active past-tense verbs (Engineered, Developed, Architected, Optimized, Implemented).
   - Keep each bullet concise, impactful, and single-sentence (1-2 lines in LaTeX).

3. TARGET LANGUAGE:
   - Generate bullet points strictly in the requested language ({language}).
   - Ensure native, professional terminology.

OUTPUT FORMAT:
Return ONLY a valid JSON object with the key "bullets" containing an array of strings. Do not include markdown code blocks or additional text.
Example:
{"bullets": ["Developed a reusable component library with \\textbf{React.js} and \\textbf{TypeScript}, cutting frontend development turnaround by \\textbf{50\\%}.", "Engineered responsive mobile features using \\textbf{React Native} and managed global state via \\textbf{TanStack Query}."]}
"""


class LLMOptimizer:
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        provider: Optional[str] = None,
    ):
        self.api_key = (
            api_key
            or os.getenv("OPENAI_API_KEY")
            or os.getenv("GEMINI_API_KEY")
            or os.getenv("GOOGLE_API_KEY")
        )
        self.base_url = base_url or os.getenv("OPENAI_BASE_URL")
        self.last_error: Optional[str] = None
        self.calls_succeeded: int = 0
        self.provider: str = "offline"
        self.tokens_used: int = 0
        self.tokens_saved: int = 0
        self.cache_hits: int = 0
        self.saved_breakdown = {
            "job_distillation": 0,
            "cache_memoization": 0,
            "zero_retry_latex": 0,
        }

        if self.api_key:
            self.api_key = self.api_key.strip().strip('"').strip("'").strip()

        # 1. Determine provider
        if provider:
            self.provider = provider.lower()
        elif self.api_key:
            if (
                self.api_key.startswith("AIza")
                or self.api_key.startswith("AQ")
                or (model and "gemini" in model.lower())
                or (os.getenv("GEMINI_API_KEY") and not os.getenv("OPENAI_API_KEY"))
            ):
                self.provider = "gemini"
            elif self.api_key.startswith("gsk_") or (model and ("llama" in model.lower() or "mixtral" in model.lower())):
                self.provider = "groq"
            elif self.api_key.startswith("sk-") or (model and "gpt" in model.lower()):
                self.provider = "openai"
            else:
                if model and any(g in model.lower() for g in ["gemini", "flash", "pro"]):
                    self.provider = "gemini"
                else:
                    self.provider = "gemini"

        # 2. Configure defaults based on resolved provider
        if self.provider == "gemini":
            if not self.base_url:
                self.base_url = "https://generativelanguage.googleapis.com/v1beta/openai/"
            if not model or "gpt" in model:
                self.model = "gemini-2.0-flash"
            else:
                self.model = model

        elif self.provider == "groq":
            if not self.base_url:
                self.base_url = "https://api.groq.com/openai/v1"
            self.model = model or "llama-3.3-70b-versatile"

        elif self.provider == "openai":
            self.model = model or os.getenv("OPENAI_MODEL") or "gpt-4o-mini"
        else:
            self.model = model or "offline"

        self.client = None
        if self.api_key:
            try:
                headers = {}
                if self.provider == "gemini":
                    headers["x-goog-api-key"] = self.api_key
                self.client = OpenAI(
                    api_key=self.api_key,
                    base_url=self.base_url,
                    default_headers=headers if headers else None,
                )
            except Exception as e:
                self.last_error = f"Client init error: {str(e)}"
                self.client = None

    def is_available(self) -> bool:
        return self.client is not None

    def get_token_metrics(self) -> dict:
        total = self.tokens_used + self.tokens_saved
        efficiency = (self.tokens_saved / total * 100) if total > 0 else 0.0
        return {
            "tokens_used": self.tokens_used,
            "tokens_saved": self.tokens_saved,
            "cache_hits": self.cache_hits,
            "efficiency_pct": round(efficiency, 1),
            "breakdown": self.saved_breakdown,
        }

    def _validate_experience_fidelity(self, generated_bullets: List[str], exp: ExperienceItem) -> bool:
        """
        Validates that the LLM did not hallucinate completely alien technologies
        into a role. For example, if an experience has NO systems/kernel tags or bullets
        (e.g., a Web/Mobile role) but the LLM generated eBPF, XDP, or kernel bypass,
        this detects cross-role leakage and rejects the hallucination.
        """
        if not generated_bullets:
            return False

        systems_exclusive = {
            "ebpf", "xdp", "af_xdp", "af-xdp", "kernel bypass", "linux kernel", "cuda", "doca", "dpdk"
        }

        source_text = " ".join([exp.role, exp.company] + exp.tags + exp.raw_bullets).lower()
        has_systems_tech = any(kw in source_text for kw in systems_exclusive)

        if not has_systems_tech:
            for b in generated_bullets:
                b_lower = b.lower()
                for kw in systems_exclusive:
                    if kw in b_lower:
                        print(
                            f"[CurriculumGen Guardrail] Cross-role hallucination detected: '{kw}' "
                            f"injected into non-systems role '{exp.role}'. Falling back to safe formatting."
                        )
                        return False

        return True

    def optimize_experience(self, exp: ExperienceItem, job_context: JobContext) -> List[str]:
        """
        Generates Google XYZ bullet points for an experience entry.
        Falls back to rule-based formatter if LLM is unavailable or fails.
        """
        if not self.is_available() or not exp.raw_bullets:
            return self._heuristic_format_bullets(exp.raw_bullets, job_context.language)

        lang_name = "Brazilian Portuguese" if job_context.language.startswith("pt") else "English"
        condensed_job = _condense_job_context(job_context.job_description)
        raw_chars = len(job_context.job_description or "")
        condensed_chars = len(condensed_job)
        if raw_chars > condensed_chars:
            saved = (raw_chars - condensed_chars) // 4
            self.tokens_saved += saved
            self.saved_breakdown["job_distillation"] += saved

        prompt = f"""Target Role / Context: {job_context.target_role or 'Software Engineer'}
Target Job Key Requirements (for context/emphasis only):
{condensed_job}

CANDIDATE ACTUAL EXPERIENCE TO OPTIMIZE:
Company: {exp.company}
Role: {exp.role}
Role Tags: {', '.join(exp.tags)}
Candidate Source Bullets for this Role:
{json.dumps(exp.raw_bullets, indent=1)}

INSTRUCTIONS & CRITICAL CONSTRAINTS:
1. Grounding: Rewrite ONLY the candidate's actual responsibilities from "Candidate Source Bullets" above into impactful Google XYZ bullet points ("Accomplished [X], measured by [Y], by doing [Z]").
2. Zero Cross-Role Hallucination: NEVER transfer or invent technologies from the Target Job Description or from other jobs into this role. If this role is Web/Mobile, keep all bullets strictly about Web/Mobile. NEVER inject kernel, eBPF, or unrelated systems skills if not present in the source bullets.
3. Highlighting: Use ONLY LaTeX \\textbf{{...}} for metrics and technologies. NEVER use HTML tags like <b> or <strong>.
4. Output: Generate up to {job_context.max_bullets_per_experience} bullet points strictly in {lang_name}.
"""
        try:
            bullets = self._call_llm(prompt, exp.raw_bullets, job_context.language)
            if not self._validate_experience_fidelity(bullets, exp):
                return self._heuristic_format_bullets(exp.raw_bullets, job_context.language)
            return bullets
        except Exception as e:
            self.last_error = f"Optimization failed: {str(e)}"
            return self._heuristic_format_bullets(exp.raw_bullets, job_context.language)

    def optimize_project(self, proj: ProjectItem, job_context: JobContext) -> List[str]:
        """
        Generates Google XYZ bullet points for a project entry.
        """
        if not self.is_available() or (not proj.raw_bullets and not proj.readme_content):
            return self._heuristic_format_bullets(proj.raw_bullets, job_context.language)

        lang_name = "Brazilian Portuguese" if job_context.language.startswith("pt") else "English"
        condensed_job = _condense_job_context(job_context.job_description)
        raw_chars = len(job_context.job_description or "")
        condensed_chars = len(condensed_job)
        if raw_chars > condensed_chars:
            saved = (raw_chars - condensed_chars) // 4
            self.tokens_saved += saved
            self.saved_breakdown["job_distillation"] += saved

        readme_snippet = proj.readme_content[:400] if proj.readme_content else ""

        prompt = f"""Target Role / Context: {job_context.target_role or 'Software Engineer'}
Target Job Key Requirements (for context/emphasis only):
{condensed_job}

CANDIDATE PROJECT TO OPTIMIZE:
Title: {proj.title} ({proj.subtitle or ''})
Project Tags: {', '.join(proj.tags)}
Candidate Source Bullets for this Project:
{json.dumps(proj.raw_bullets, indent=1)}
Highlights:
{readme_snippet}

INSTRUCTIONS & CRITICAL CONSTRAINTS:
1. Grounding: Rewrite ONLY the candidate's actual project achievements into Google XYZ bullet points.
2. Zero Hallucination: Do NOT invent technologies or tasks not present in this project's source bullets or highlights.
3. Highlighting: Use ONLY LaTeX \\textbf{{...}} for metrics and technologies. NEVER use HTML tags.
4. Output: Generate up to {job_context.max_bullets_per_project} bullet points strictly in {lang_name}.
"""
        try:
            return self._call_llm(prompt, proj.raw_bullets, job_context.language)
        except Exception as e:
            self.last_error = f"Optimization failed: {str(e)}"
            return self._heuristic_format_bullets(proj.raw_bullets, job_context.language)

    def _get_available_gemini_models(self) -> List[str]:
        if not self.api_key:
            return []
        import httpx
        url = f"https://generativelanguage.googleapis.com/v1beta/models?key={self.api_key}"
        try:
            res = httpx.get(url, timeout=10.0)
            if res.status_code == 200:
                data = res.json()
                models_list = data.get("models", [])
                excluded = [
                    "tts", "image", "transcribe", "clip", "audio",
                    "robotics", "computer-use", "banana", "customtools"
                ]
                return [
                    m["name"].replace("models/", "")
                    for m in models_list
                    if "generateContent" in m.get("supportedGenerationMethods", [])
                    and not any(ex in m["name"].lower() for ex in excluded)
                ]
        except Exception as e:
            print(f"[CurriculumGen Gemini ListModels Error] {e}")
        return []

    def _call_gemini_native(self, user_prompt: str, target_lang: str) -> Optional[List[str]]:
        import httpx
        try:
            system_content = SYSTEM_PROMPT.replace("{language}", target_lang)

            # Discover active text models from Google AI Studio for this specific key
            available = self._get_available_gemini_models()
            print(f"[CurriculumGen Gemini] Modelos texto ativos detectados: {available}")

            candidates: List[str] = []
            if self.model and (not available or self.model in available):
                candidates.append(self.model)

            pref_order = [
                "gemini-2.5-flash-lite",
                "gemini-2.5-flash",
                "gemini-2.0-flash",
                "gemini-2.0-flash-exp",
                "gemini-1.5-flash",
                "gemini-flash-lite-latest",
                "gemini-flash-latest",
                "gemini-1.5-flash-8b",
                "gemini-2.0-pro-exp",
                "gemini-1.5-pro",
            ]
            for p in pref_order:
                for a in available:
                    if p == a or a.startswith(p):
                        if a not in candidates:
                            candidates.append(a)

            for a in available:
                if a not in candidates:
                    candidates.append(a)

            if not candidates:
                candidates = [self.model or "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-1.5-flash"]

            seen = set()
            models_to_try = [m for m in candidates if m and not (m in seen or seen.add(m))]
            print(f"[CurriculumGen Gemini] Modelos a testar na ordem: {models_to_try}")

            for m in models_to_try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={self.api_key}"
                payload = {
                    "contents": [
                        {
                            "role": "user",
                            "parts": [
                                {"text": f"System Instructions:\n{system_content}\n\nTask Instructions:\n{user_prompt}"}
                            ]
                        }
                    ],
                    "generationConfig": {
                        "responseMimeType": "application/json",
                        "temperature": 0.2,
                        "maxOutputTokens": 512,
                    }
                }
                try:
                    res = httpx.post(url, json=payload, timeout=30.0)
                    if res.status_code == 200:
                        data = res.json()
                        candidates_resp = data.get("candidates", [])
                        if candidates_resp:
                            parts = candidates_resp[0].get("content", {}).get("parts", [])
                            if parts:
                                text = parts[0].get("text", "").strip()
                                bullets = safe_parse_json_bullets(text)
                                if isinstance(bullets, list) and bullets:
                                    self.calls_succeeded += 1
                                    self.model = m
                                    # Track token metrics
                                    usage = data.get("usageMetadata", {})
                                    if usage and "totalTokenCount" in usage:
                                        used_here = usage.get("totalTokenCount", 0)
                                    else:
                                        used_here = (len(user_prompt) // 4) + (len(text) // 4)
                                    self.tokens_used += used_here

                                    # If unescaped LaTeX backslashes were repaired without an API retry
                                    if "\\textbf" in text or "\\%" in text or "\\e" in text:
                                        self.tokens_saved += 350
                                        self.saved_breakdown["zero_retry_latex"] += 350

                                    print(f"[CurriculumGen Gemini] Sucesso com modelo '{m}' ({len(bullets)} bullets, {used_here} tokens)")
                                    return [str(b).strip() for b in bullets if str(b).strip()]
                    else:
                        err_msg = res.json().get("error", {}).get("message", res.text)
                        print(f"[CurriculumGen Gemini] Falha com modelo '{m}' ({res.status_code}): {err_msg}")
                        self.last_error = f"Gemini native ({m}): {err_msg}"
                        if res.status_code == 400 and ("API key not valid" in err_msg or "API_KEY_INVALID" in err_msg):
                            break
                except Exception as e:
                    print(f"[CurriculumGen Gemini] Exceção na requisição para '{m}': {e}")
                    self.last_error = f"Gemini native request failed ({m}): {str(e)}"
        except Exception as e:
            print(f"[CurriculumGen Gemini Init Error] {e}")
            self.last_error = f"Gemini native init error: {str(e)}"
        return None

    def _call_llm(self, user_prompt: str, fallback_bullets: List[str], language: str) -> List[str]:
        target_lang = "Brazilian Portuguese" if language.startswith("pt") else "English"

        cache_key = hashlib.sha256(f"{user_prompt}:{language}".encode()).hexdigest()
        if cache_key in _LLM_CACHE:
            saved_from_cache = (len(user_prompt) // 4) + 120
            self.tokens_saved += saved_from_cache
            self.saved_breakdown["cache_memoization"] += saved_from_cache
            self.cache_hits += 1
            print(f"[CurriculumGen Cache] Cache hit! Poupados {saved_from_cache} tokens.")
            return _LLM_CACHE[cache_key]

        # 1. Native Google Gemini API (preferred for Google AI Studio keys)
        if self.provider == "gemini" and self.api_key:
            native_res = self._call_gemini_native(user_prompt, target_lang)
            if native_res:
                _LLM_CACHE[cache_key] = native_res
                return native_res
            # For Gemini keys, do not fall back to OpenAI SDK endpoint (v1main) which returns false 404s
            print(f"[CurriculumGen LLM Error] Gemini native falhou: {self.last_error}")
            return self._heuristic_format_bullets(fallback_bullets, language)

        # 2. OpenAI-compatible endpoint (for OpenAI, Groq or local Ollama)
        if self.client:
            models_to_try = [self.model]
            for current_model in models_to_try:
                try:
                    response = self.client.chat.completions.create(
                        model=current_model,
                        messages=[
                            {"role": "system", "content": SYSTEM_PROMPT.replace("{language}", target_lang)},
                            {"role": "user", "content": user_prompt},
                        ],
                        temperature=0.2,
                        max_tokens=512,
                        response_format={"type": "json_object"} if "gpt-4" in current_model else None,
                    )
                    content = response.choices[0].message.content.strip()
                    bullets = safe_parse_json_bullets(content)
                    if isinstance(bullets, list) and bullets:
                        self.model = current_model
                        self.calls_succeeded += 1
                        _LLM_CACHE[cache_key] = bullets
                        if hasattr(response, "usage") and response.usage:
                            used_here = response.usage.total_tokens
                        else:
                            used_here = (len(user_prompt) // 4) + (len(content) // 4)
                        self.tokens_used += used_here
                        return [str(b).strip() for b in bullets if str(b).strip()]
                except Exception as e:
                    self.last_error = f"API ({self.provider}/{current_model}): {str(e)}"
                    if "401" in str(e) or ("400" in str(e) and "invalid" in str(e).lower()):
                        break

        if self.last_error:
            print(f"[CurriculumGen LLM Error] {self.last_error}")
        return self._heuristic_format_bullets(fallback_bullets, language)

    def _heuristic_format_bullets(self, raw_bullets: List[str], language: str) -> List[str]:
        """
        Offline rule-based formatter:
        - Bolds numbers, percentages, and metrics.
        - Translates common technical sentence beginnings if target is Portuguese.
        - Preserves factual accuracy.
        """
        is_pt = language.startswith("pt")
        pt_translations = [
            (r"\bDeveloped a high-performance\b", "Desenvolveu um"),
            (r"\bDeveloped a\b", "Desenvolveu um"),
            (r"\bDeveloped UIs with\b", "Desenvolveu interfaces com"),
            (r"\bDeveloped\b", "Desenvolveu"),
            (r"\bEngineered a\b", "Projetou e implementou um"),
            (r"\bEngineered\b", "Engenhou e implementou"),
            (r"\bIncreased throughput from\b", "Aumentou a taxa de transferência de"),
            (r"\bIncreased\b", "Aumentou"),
            (r"\bAchieved a\b", "Alcançou uma"),
            (r"\bAchieved\b", "Alcançou"),
            (r"\bOptimized Render Time by\b", "Otimizou o tempo de renderização em"),
            (r"\bOptimized\b", "Otimizou"),
            (r"\bReduced\b", "Reduziu"),
            (r"\bBuilt scalable\b", "Construiu APIs escaláveis"),
            (r"\bBuilt\b", "Construiu"),
            (r"\bCovered 80% of critical flows\b", "Cobriu 80% dos fluxos críticos"),
            (r"\bAdopted\b", "Adotou"),
            (r"\bHandled\b", "Gerenciou"),
            (r"\bDelivered\b", "Entregou"),
            (r"\bAuthor of the short course\b", "Autor do minicurso"),
            (r"\bMentored\b", "Orientou"),
            (r"\bDistinguished for\b", "Distinguido por"),
            (r"\bvia kernel-level packet processing\b", "via processamento de pacotes no nível do kernel"),
            (r"\bPublished at\b", "Publicado no"),
            (r"\bcreating a reusable library that cut dev time by 50%\b", "criando biblioteca reutilizável que reduziu o tempo de desenvolvimento em 50%"),
            (r"\bcreating a reusable library that cut dev time by\b", "criando biblioteca reutilizável que reduziu o tempo de desenvolvimento em"),
            (r"\bDelivered cross-platform \(iOS/Android\) features and optimized API state with\b", "Entregou funcionalidades multiplataforma (iOS/Android) e otimizou o estado de APIs com"),
            (r"\bBuilt scalable REST APIs using\b", "Construiu APIs REST escaláveis usando"),
            (r"\bCovered 80% of critical flows via Playwright E2E and unit tests, reducing regression bugs\b", "Cobriu 80% dos fluxos críticos via Playwright E2E e testes unitários, reduzindo bugs de regressão"),
            (r"\bAdopted Spec-Driven Development \(SDD\) using Claude to draft specs and execution plans\b", "Adotou Desenvolvimento Orientado a Especificações (SDD) com Claude para especificações e planos de execução"),
            (r"\bHandled AWS deployments and log debugging to ensure high availability and quick issue resolution\b", "Gerenciou deploys na AWS e análise de logs para garantir alta disponibilidade e resolução ágil"),
            (r"\band\b", "e"),
            (r"\bwith\b", "com"),
            (r"\busing\b", "usando"),
            (r"\bby implementing\b", "através da implementação de"),
        ]

        formatted = []
        for bullet in raw_bullets:
            b = bullet.strip()
            if not b:
                continue

            # If target language is Portuguese, perform light offline translation
            if is_pt:
                for pattern, repl in pt_translations:
                    b = re.sub(pattern, repl, b, flags=re.IGNORECASE)

            # Ensure metrics like 213% or 16x are bolded if not already bolded
            def bold_metric(match):
                metric = match.group(0)
                return f"\\textbf{{{metric}}}"

            b = re.sub(r"(?<!\\textbf\{)(\b\d+[\d.,]*%|\b\d+(?:\.\d+)?\s*[\u00D7x]|\b[><]?\d+\s*ms\b)", bold_metric, b)
            cleaned = _clean_latex_bullet(b)
            if cleaned:
                formatted.append(cleaned)

        return formatted
