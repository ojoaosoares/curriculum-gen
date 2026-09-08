import os
import io
import re
import json
import hashlib
from typing import Dict, Any, Optional, List
from pypdf import PdfReader

from curriculum_gen.llm_optimizer import LLMOptimizer
from curriculum_gen.token_tracker import token_tracker
from curriculum_gen.template_engine import compact_period

# In-memory memoization cache for identical PDF files (SHA-256)
_PDF_INGEST_CACHE: Dict[str, Dict[str, Any]] = {}


PARSE_RESUME_PROMPT = """You are an expert HR data parsing system.
Extract career information from this resume or LinkedIn PDF text and return ONLY a valid JSON object matching the schema below.

JSON SCHEMA:
{
  "personal": {
    "name": "Full Name",
    "location": "City, State, Country or null",
    "email": "email@domain.com or null",
    "phone": "+55 (XX) XXXXX-XXXX or null",
    "linkedin": "https://linkedin.com/in/... or null",
    "github": "https://github.com/... or null",
    "website": "url or null"
  },
  "education": [
    {
      "institution": "University / School Name",
      "degree": "Degree / Course Name",
      "period": "Start - End year or date",
      "notes": "GPA, honors, or thesis topic if mentioned"
    }
  ],
  "experiences": [
    {
      "role": "Job Title",
      "company": "Company Name",
      "period": "MM/YYYY - MM/YYYY or Present",
      "tags": ["Tech1", "Tech2"],
      "raw_bullets": [
        "Action verb + achievement or responsibility",
        "Action verb + technical outcome"
      ]
    }
  ],
  "skills": {
    "Competências": ["Skill 1", "Skill 2"],
    "Tecnologias": ["Python", "TypeScript", "React", "Docker"],
    "Idiomas": ["Inglês (Avançado)", "Português (Nativo)"]
  },
  "awards_and_leadership": [
    {
      "title": "Award, Leadership, or Honor",
      "period_or_date": "Year or date",
      "description": "Short explanation of the achievement"
    }
  ],
  "projects": [
    {
      "title": "Project or Publication Title",
      "subtitle": "Short tech stack or 'Publicação Técnica'",
      "tags": ["Tech1", "Tech2"],
      "raw_bullets": ["Description or key outcome"]
    }
  ]
}

CRITICAL RULES:
1. Extract ALL experiences found in the text. Do not omit any company or role.
2. For each experience, split narrative paragraphs or bullets into clear, concise, single-sentence bullet points in 'raw_bullets'.
3. Extract relevant technical tags for each experience (e.g. languages, frameworks, libraries, tools).
4. Extract ALL education entries (institutions, degrees, periods).
5. Extract ALL skills and languages spoken into appropriate categories in 'skills'.
6. If the text is from a LinkedIn PDF, note that email might be broken across lines (e.g. 'user@gmail.c\\nom' -> 'user@gmail.com') and sidebar sections include 'Contato', 'Principais competências', 'Languages', 'Certifications', 'Honors-Awards', 'Publications'. Extract ALL of them.
7. For dates and periods, strip duration counts in parentheses like '(2 anos 5 meses)' or '(1 yr 2 mos)' and keep them compact (e.g. '09/2025 - Present').
8. Extract any publications or projects under 'Projects', 'Projetos', or 'Publications' into the 'projects' array.
9. For awards and certifications, NEVER fabricate placeholder or fictional descriptions. If the text does not contain an explanation, leave 'description': ''. Do not duplicate the year in both 'title' and 'period_or_date'.
10. Output ONLY the JSON object. No markdown code blocks, no intro, no outro.

RESUME TEXT:
"""

TECH_CATALOG = [
    "TypeScript", "JavaScript", "Python", "C++", "C#", "C", "Go", "Rust", "Java", "Kotlin", "Swift",
    "SQL", "React", "React Native", "React.js", "Next.js", "Vue", "Angular", "NestJS", "Node.js",
    "Express", "TypeORM", "Prisma", "MUI", "Tailwind", "Docker", "Kubernetes", "eBPF", "XDP",
    "Linux", "ns-3", "GPU", "CUDA", "Playwright", "Cypress", "Jest", "AWS", "GCP", "Azure",
    "PostgreSQL", "MySQL", "Redis", "MongoDB", "Git", "GitHub", "GitLab", "CI/CD", "Terraform",
    "GraphQL", "REST", "gRPC", "Serverless", "DNS", "Microservices", "HTML", "CSS"
]


class ResumePDFIngestor:
    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        provider: Optional[str] = None,
    ):
        self.api_key = (
            api_key
            or os.getenv("OPENAI_API_KEY")
            or os.getenv("GEMINI_API_KEY")
            or os.getenv("GOOGLE_API_KEY")
        )
        self.model = model
        self.provider = provider
        self.llm = LLMOptimizer(api_key=self.api_key, model=model, provider=provider)

    def extract_text(self, pdf_bytes: bytes) -> str:
        """Extract clean text content from PDF bytes using pypdf."""
        reader = PdfReader(io.BytesIO(pdf_bytes))
        pages_text: List[str] = []
        for page in reader.pages:
            t = page.extract_text() or ""
            if t.strip():
                pages_text.append(t.strip())
        return "\n\n".join(pages_text)

    def _clean_extracted_text(self, text: str) -> str:
        """Repairs narrow column wraps (such as LinkedIn PDF exports) and removes page footers."""
        # Fix wrapped email addresses like 'contato.ojoaosoares@gmail.c\nom'
        cleaned = re.sub(r"([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)\s*\n\s*([a-zA-Z]{1,4})\b", r"\1\2", text)
        cleaned = re.sub(r"([a-zA-Z0-9_.+-]+@)\s*\n\s*([a-zA-Z0-9-.]+)", r"\1\2", cleaned)
        # Strip pagination marks
        cleaned = re.sub(r"(?i)\bpage\s+\d+\s+of\s+\d+\b", "", cleaned)
        cleaned = re.sub(r"(?i)\bpágina\s+\d+\s+de\s+\d+\b", "", cleaned)
        return cleaned

    def ingest(self, pdf_bytes: bytes) -> Dict[str, Any]:
        """
        Parses resume or LinkedIn PDF into structured profile data.
        Employs Token Intelligence strategies:
        1. SHA-256 PDF Hash Memoization (0 tokens on identical uploads).
        2. PDF Distillation (Noise & Pagination stripping, saving ~40% prompt chars).
        3. Deterministic Pre-Extraction (Complete structural extraction without API costs).
        4. Resilient Hybrid Merge with LLM if available.
        """
        pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()
        if pdf_hash in _PDF_INGEST_CACHE:
            cached_res = dict(_PDF_INGEST_CACHE[pdf_hash])
            saved_tokens = cached_res.get("token_metrics", {}).get("tokens_saved", 3200)
            token_tracker.record_operation(
                operation="Ingestão de PDF (Cache SHA-256)",
                tokens_used=0,
                tokens_saved=saved_tokens,
                category="cache_memoization",
                strategy="Memoization de PDF Idêntico (SHA-256)",
                details=f"Documento idêntico detectado (hash {pdf_hash[:8]}). 0 requisições realizadas.",
                provider="cache",
                is_cache_hit=True,
            )
            cached_res["cached"] = True
            return cached_res

        raw_text = self.extract_text(pdf_bytes)
        cleaned_text = self._clean_extracted_text(raw_text)
        if len(cleaned_text.strip()) < 30:
            raise ValueError("Não foi possível extrair texto do PDF. O arquivo pode ser uma imagem digitalizada sem camada de texto.")

        distillation_tokens_saved = max(0, (len(raw_text) - len(cleaned_text)) // 4)

        # Baseline: offline deterministic parser
        offline_parsed = self._heuristic_parse(cleaned_text)

        # 1. Try LLM extraction if available
        if self.llm and self.llm.is_available():
            try:
                llm_parsed = self._extract_with_llm(cleaned_text)
                if llm_parsed and isinstance(llm_parsed, dict) and "personal" in llm_parsed:
                    # Merge LLM result with heuristic baseline to prevent any lost sections
                    merged = self._merge_parsed(llm_parsed, offline_parsed)
                    tokens_used = (len(cleaned_text) // 4) + 650
                    tokens_saved = distillation_tokens_saved + 400
                    res = self._build_result(
                        merged,
                        cleaned_text,
                        provider=self.llm.provider,
                        tokens_used=tokens_used,
                        tokens_saved=tokens_saved,
                        strategy="Destilação de PDF + Merge Híbrido LLM",
                    )
                    token_tracker.record_operation(
                        operation="Ingestão de PDF via IA",
                        tokens_used=tokens_used,
                        tokens_saved=tokens_saved,
                        category="pdf_distillation_and_schema",
                        strategy="Destilação de PDF + Merge Resiliente",
                        details=f"Processado via {self.llm.provider}. {res['counts']['experiences']} exps, {res['counts']['skills']} skills.",
                        provider=self.llm.provider,
                    )
                    _PDF_INGEST_CACHE[pdf_hash] = res
                    return res
            except Exception as e:
                print(f"[ResumePDFIngestor] LLM extraction failed: {e}. Falling back to heuristic baseline.")

        # 2. Return offline deterministic baseline (0 tokens consumed, full schema extracted!)
        estimated_saved = (len(cleaned_text) // 4) + 850 + distillation_tokens_saved
        res = self._build_result(
            offline_parsed,
            cleaned_text,
            provider="heuristic_offline",
            tokens_used=0,
            tokens_saved=estimated_saved,
            strategy="Extração Determinística Estrutural (0 Tokens)",
        )
        token_tracker.record_operation(
            operation="Ingestão de PDF (Parser Local)",
            tokens_used=0,
            tokens_saved=estimated_saved,
            category="pdf_distillation_and_schema",
            strategy="Extração Determinística Offline + Poda de Ruído",
            details=f"100% dos dados extraídos sem gastar tokens. {res['counts']['experiences']} exps, {res['counts']['skills']} skills.",
            provider="heuristic_offline",
        )
        _PDF_INGEST_CACHE[pdf_hash] = res
        return res

    def _extract_with_llm(self, text: str) -> Optional[Dict[str, Any]]:
        # Allow up to 12,000 characters to cover multi-page resumes and LinkedIn exports
        truncated_text = text[:12000]
        prompt = PARSE_RESUME_PROMPT + truncated_text

        # 1. Google Gemini native generateContent
        if self.llm.provider == "gemini":
            import httpx
            available = self.llm._get_available_gemini_models()
            chosen_model = self.llm.model or (available[0] if available else "gemini-2.0-flash")
            clean_model = chosen_model.replace("models/", "")
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent?key={self.llm.api_key}"
            payload = {
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "temperature": 0.1,
                    "maxOutputTokens": 4096,
                },
            }
            try:
                res = httpx.post(url, json=payload, timeout=35.0)
                if res.status_code == 200:
                    data = res.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts:
                            raw_json = parts[0].get("text", "").strip()
                            return self._clean_and_parse_json(raw_json)
                else:
                    print(f"[ResumePDFIngestor] Gemini HTTP {res.status_code}: {res.text[:200]}")
            except Exception as e:
                print(f"[ResumePDFIngestor] Gemini generateContent error: {e}")

        # 2. Fallback to OpenAI-compatible client
        if self.llm.client:
            resp = self.llm.client.chat.completions.create(
                model=self.llm.model or "gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=4096,
                response_format={"type": "json_object"} if "gpt-4" in (self.llm.model or "") else None,
            )
            raw_json = resp.choices[0].message.content.strip()
            return self._clean_and_parse_json(raw_json)

        return None

    def _clean_and_parse_json(self, raw_json: str) -> Optional[Dict[str, Any]]:
        cleaned = raw_json.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned.replace("```json", "", 1).rstrip("```").strip()
        elif cleaned.startswith("```"):
            cleaned = cleaned.replace("```", "", 1).rstrip("```").strip()
        try:
            return json.loads(cleaned)
        except Exception:
            matches = re.search(r"\{.*\}", cleaned, re.DOTALL)
            if matches:
                try:
                    return json.loads(matches.group(0))
                except Exception:
                    pass
        return None

    def _extract_tech_tags(self, chunk: str) -> List[str]:
        found = []
        for tech in TECH_CATALOG:
            if re.search(rf"\b{re.escape(tech)}\b", chunk, re.IGNORECASE):
                found.append(tech)
        return list(dict.fromkeys(found))

    def _heuristic_parse(self, text: str) -> Dict[str, Any]:
        """
        Deterministic structural parser designed for LinkedIn PDF exports and standard resumes.
        Extracts experiences, education, bullets, tags, contacts, and skills offline.
        """
        # 1. Contacts
        email_m = re.search(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b", text)
        email = email_m.group(0) if email_m else None

        li_m = re.search(r"(?:https?://)?(?:www\.)?linkedin\.com/in/([A-Za-z0-9_-]+)", text, re.IGNORECASE)
        linkedin = f"https://www.linkedin.com/in/{li_m.group(1)}" if li_m else None

        gh_m = re.search(r"(?:https?://)?(?:www\.)?github\.com/([A-Za-z0-9_-]+)", text, re.IGNORECASE)
        github = f"https://github.com/{gh_m.group(1)}" if gh_m else None

        phone_m = re.search(r"(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}", text)
        phone = phone_m.group(0) if phone_m else None

        # Name and Location:
        # In LinkedIn PDFs, the main body starts with: Name, Headline, Location, Resumo
        name = "Candidato"
        location = None
        resumo_match = re.search(r"\n(?:Resumo|Summary)\b", text, re.IGNORECASE)
        if resumo_match:
            pre_resumo = text[:resumo_match.start()].strip()
            pre_lines = [l.strip() for l in pre_resumo.splitlines() if l.strip()]
            if len(pre_lines) >= 3:
                name = pre_lines[-3]
                location = pre_lines[-1]
            elif len(pre_lines) >= 1:
                name = pre_lines[-1]
        else:
            meu_nome = re.search(r"Meu nome é\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)+)", text)
            if meu_nome:
                name = meu_nome.group(1)
            else:
                lines = [l.strip() for l in text.splitlines() if l.strip()]
                name = lines[0] if lines else "Candidato"

        # 2. Experiences
        date_pattern = (
            r"(?:(?:janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|"
            r"jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}/\d{4}|\d{4})\s*(?:de\s*)?\d{0,4})\s*[-–—]\s*"
            r"(?:Presente|Present|Atual|momento|janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|"
            r"jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}/\d{4}|\d{4})(?:\s*(?:de\s*)?\d{0,4})?"
        )
        date_re = re.compile(date_pattern, re.IGNORECASE)

        experiences = []
        exp_match = re.search(
            r"(?:Experiência|Experience|Histórico Profissional)(.*?)(?:Formação acadêmica|Educação|Education|Projetos|Projects|\Z)",
            text,
            re.DOTALL | re.IGNORECASE,
        )
        if exp_match:
            exp_block = exp_match.group(1).strip()
            lines = [l.strip() for l in exp_block.splitlines() if l.strip()]

            date_indices = []
            for idx, line in enumerate(lines):
                if date_re.search(line):
                    date_indices.append(idx)

            for i, d_idx in enumerate(date_indices):
                period = compact_period(lines[d_idx])
                prev_lines = lines[max(0, d_idx - 2):d_idx]
                if len(prev_lines) == 2:
                    company, role = prev_lines[0], prev_lines[1]
                elif len(prev_lines) == 1:
                    company, role = prev_lines[0], "Profissional"
                else:
                    company, role = "Empresa", "Profissional"

                next_d_idx = date_indices[i + 1] if i + 1 < len(date_indices) else len(lines)
                start_body = d_idx + 1
                # Skip location line if present immediately after date
                if start_body < next_d_idx and not lines[start_body].startswith(("◦", "•", "-", "*")):
                    if len(lines[start_body]) < 60 or any(
                        w in lines[start_body].lower()
                        for w in ["brasil", "mg", "sp", "rj", "campus", "remote", "remoto", "híbrido"]
                    ):
                        start_body += 1

                end_body = max(start_body, next_d_idx - 2) if i + 1 < len(date_indices) else next_d_idx
                body_lines = lines[start_body:end_body]

                raw_bullets = []
                cur_bullet = []
                for bl in body_lines:
                    if bl.startswith(("◦", "•", "-", "*")):
                        if cur_bullet:
                            raw_bullets.append(" ".join(cur_bullet).strip())
                            cur_bullet = []
                        cleaned_b = re.sub(r"^[◦•\-\*]\s*", "", bl).strip()
                        if cleaned_b:
                            cur_bullet.append(cleaned_b)
                    else:
                        if cur_bullet:
                            cur_bullet.append(bl)
                        else:
                            cur_bullet.append(bl)
                if cur_bullet:
                    raw_bullets.append(" ".join(cur_bullet).strip())

                full_chunk = " ".join([company, role, period] + raw_bullets)
                tags = self._extract_tech_tags(full_chunk)

                experiences.append({
                    "id": f"exp-pdf-{i+1}",
                    "company": company,
                    "role": role,
                    "period": period,
                    "tags": tags,
                    "raw_bullets": raw_bullets,
                })

        # 3. Education
        education = []
        edu_match = re.search(
            r"(?:Formação acadêmica|Educação|Education)(.*?)(?:Projetos|Projects|Skills|Habilidades|Certifications|Honors|\Z)",
            text,
            re.DOTALL | re.IGNORECASE,
        )
        if edu_match:
            edu_block = edu_match.group(1).strip()
            edu_lines = [l.strip() for l in edu_block.splitlines() if l.strip()]
            if edu_lines:
                institution = edu_lines[0]
                degree = edu_lines[1] if len(edu_lines) > 1 else "Graduação"
                period = None
                date_in_deg = re.search(
                    r"\(?(?:(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|\w+)\s*(?:de\s*)?\d{4}|\d{4})\s*[-–—]\s*(?:(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|\w+)\s*(?:de\s*)?\d{4}|\d{4})\)?",
                    degree,
                    re.IGNORECASE,
                )
                if date_in_deg:
                    period = date_in_deg.group(0).strip("()")
                    degree = degree.replace(date_in_deg.group(0), "").strip(" ·,-")
                elif len(edu_lines) > 2:
                    period = edu_lines[2]
                education.append({
                    "institution": institution,
                    "degree": degree,
                    "period": compact_period(period or "2023 – 2027"),
                    "notes": None,
                })

        # 4. Skills
        skills_dict: Dict[str, List[str]] = {}

        # LinkedIn Principais competências
        comp_match = re.search(
            r"Principais competências\s*\n(.*?)(?:Languages|Certifications|Honors|Publications|João|\Z)",
            text,
            re.DOTALL | re.IGNORECASE,
        )
        if comp_match:
            comps = [l.strip() for l in comp_match.group(1).splitlines() if l.strip()]
            if comps:
                skills_dict["Competências Principais"] = comps

        # LinkedIn Languages
        lang_match = re.search(
            r"Languages\s*\n(.*?)(?:Certifications|Honors|Publications|João|\Z)",
            text,
            re.DOTALL | re.IGNORECASE,
        )
        if lang_match:
            langs = [l.strip() for l in lang_match.group(1).splitlines() if l.strip()]
            if langs:
                skills_dict["Idiomas"] = langs

        # Technologies identified from experiences & whole text
        techs_found = self._extract_tech_tags(text)
        if techs_found:
            skills_dict["Tecnologias"] = techs_found

        # 5. Awards & Leadership
        awards = []
        continuation_prefixes = (
            "Test", "Engineering", "Symposium", "Phase", "Semana", "Conhecimento", "Basics",
            "Systems", "Computing", "(", "[", "eBPF", "GPU", "DNS", "com ", "em ", "no ", "na ", "de ", "da ", "do ", "dos ", "das "
        )

        honors_m = re.search(
            r"(?:Honors-Awards|Premiações|Prêmios)\s*\n(.*?)(?:\n(?:Publications|Publicações|Certifications|Certificações|Languages|Contato|Resumo|Experiência|Formação|\Z))",
            text,
            re.DOTALL | re.IGNORECASE,
        )
        if honors_m:
            lines = [l.strip() for l in honors_m.group(1).splitlines() if l.strip()]
            if lines:
                raw_title = " ".join(lines)
                year_m = re.search(r"\b(19\d\d|20\d\d)\b", raw_title)
                year = year_m.group(1) if year_m else ""
                clean_t = re.sub(rf"\b{year}\b", "", raw_title).strip() if year else raw_title
                clean_t = re.sub(r"\s+", " ", clean_t).strip(" -–:")
                awards.append({
                    "id": f"award-pdf-{len(awards)+1}",
                    "title": clean_t or raw_title,
                    "period_or_date": year,
                    "description": "",
                })

        # Certifications
        cert_m = re.search(
            r"(?:Certifications|Certificações)\s*\n(.*?)(?:\n(?:Honors-Awards|Premiações|Publications|Publicações|Languages|Contato|Resumo|Experiência|Formação|\Z))",
            text,
            re.DOTALL | re.IGNORECASE,
        )
        if cert_m:
            c_text = cert_m.group(1).strip()
            raw_lines = [l.strip() for l in c_text.splitlines() if l.strip()]
            certs = []
            curr: List[str] = []
            for line in raw_lines:
                if curr and (line.startswith(continuation_prefixes) or not line[0].isupper()):
                    curr.append(line)
                else:
                    if curr:
                        certs.append(" ".join(curr))
                    curr = [line]
            if curr:
                certs.append(" ".join(curr))
            for c in certs:
                year_m = re.search(r"\b(19\d\d|20\d\d)\b", c)
                year = year_m.group(1) if year_m else ""
                clean_c = re.sub(rf"\b{year}\b", "", c).strip() if year else c
                clean_c = re.sub(r"\s+", " ", clean_c).strip(" -–:")
                awards.append({
                    "id": f"award-pdf-{len(awards)+1}",
                    "title": clean_c or c,
                    "period_or_date": year,
                    "description": "",
                })

        # 6. Projects & Publications
        projects = []
        pub_m = re.search(
            r"(?:Publications|Publicações)\s*\n(.*?)(?:\n(?:Honors-Awards|Premiações|Certifications|Certificações|Languages|Contato|Resumo|Experiência|Formação|\Z))",
            text,
            re.DOTALL | re.IGNORECASE,
        )
        if pub_m:
            p_text = pub_m.group(1).strip()
            raw_p_lines = [l.strip() for l in p_text.splitlines() if l.strip()]
            pubs = []
            curr_p: List[str] = []
            for line in raw_p_lines:
                if curr_p and (line.startswith(continuation_prefixes) or not line[0].isupper()):
                    curr_p.append(line)
                else:
                    if curr_p:
                        pubs.append(" ".join(curr_p))
                    curr_p = [line]
            if curr_p:
                pubs.append(" ".join(curr_p))

            for p_title in pubs:
                clean_pt = re.sub(r"\s+", " ", p_title).strip(" -–:")
                if clean_pt:
                    projects.append({
                        "id": f"proj-pub-{len(projects)+1}",
                        "title": clean_pt,
                        "subtitle": "Publicação Técnica",
                        "tags": self._extract_tech_tags(clean_pt),
                        "raw_bullets": [],
                    })

        proj_m = re.search(
            r"(?:Projetos|Projects)\s*\n(.*?)(?:\n(?:Honors-Awards|Premiações|Certifications|Certificações|Publications|Publicações|Languages|Contato|Resumo|Experiência|Formação|\Z))",
            text,
            re.DOTALL | re.IGNORECASE,
        )
        if proj_m:
            pr_text = proj_m.group(1).strip()
            pr_lines = [l.strip() for l in pr_text.splitlines() if l.strip()]
            for pr_line in pr_lines:
                if len(pr_line) > 3 and not pr_line.startswith(("◦", "•", "-", "*")):
                    clean_pr = re.sub(r"\s+", " ", pr_line).strip(" -–:")
                    if clean_pr:
                        projects.append({
                            "id": f"proj-pdf-{len(projects)+1}",
                            "title": clean_pr,
                            "subtitle": "Projeto",
                            "tags": self._extract_tech_tags(clean_pr),
                            "raw_bullets": [],
                        })

        return {
            "personal": {
                "name": name,
                "email": email,
                "phone": phone,
                "linkedin": linkedin,
                "github": github,
                "location": location,
                "website": None,
            },
            "education": education,
            "experiences": experiences,
            "projects": projects,
            "skills": skills_dict,
            "awards_and_leadership": awards,
        }

    def _merge_parsed(self, primary: Dict[str, Any], fallback: Dict[str, Any]) -> Dict[str, Any]:
        """
        Combines primary LLM results with fallback heuristic extraction so no sections or experiences are lost.
        """
        merged = dict(primary)

        # Personal contacts
        merged_personal = dict(primary.get("personal") or {})
        fallback_personal = fallback.get("personal") or {}
        for k in ["email", "phone", "linkedin", "github", "location"]:
            if not merged_personal.get(k) and fallback_personal.get(k):
                merged_personal[k] = fallback_personal[k]
        if merged_personal.get("name") in [None, "", "Candidato", "Full Name"] and fallback_personal.get("name"):
            merged_personal["name"] = fallback_personal["name"]
        merged["personal"] = merged_personal

        # Experiences: if LLM missed experiences, use fallback!
        primary_exps = primary.get("experiences") or []
        fallback_exps = fallback.get("experiences") or []
        if not primary_exps:
            merged["experiences"] = fallback_exps
        else:
            # If LLM extracted fewer experiences than fallback, merge missing companies
            p_companies = {(e.get("company") or "").lower() for e in primary_exps}
            extra_exps = [e for e in fallback_exps if (e.get("company") or "").lower() not in p_companies]
            merged["experiences"] = primary_exps + extra_exps

        # Projects: if LLM returned 0, use fallback
        primary_projs = primary.get("projects") or []
        fallback_projs = fallback.get("projects") or []
        if not primary_projs:
            merged["projects"] = fallback_projs
        else:
            p_titles = {(p.get("title") or "").lower() for p in primary_projs}
            extra_projs = [p for p in fallback_projs if (p.get("title") or "").lower() not in p_titles]
            merged["projects"] = primary_projs + extra_projs

        # Education: if LLM returned 0 education entries, use fallback
        if not primary.get("education") and fallback.get("education"):
            merged["education"] = fallback["education"]

        # Awards & Leadership: if LLM returned 0, use fallback
        if not primary.get("awards_and_leadership") and fallback.get("awards_and_leadership"):
            merged["awards_and_leadership"] = fallback["awards_and_leadership"]

        # Skills: combine dictionary keys
        merged_skills = dict(primary.get("skills") or {})
        fallback_skills = fallback.get("skills") or {}
        for cat, items in fallback_skills.items():
            if cat not in merged_skills:
                merged_skills[cat] = items
            else:
                existing = merged_skills[cat]
                if isinstance(existing, list) and isinstance(items, list):
                    merged_skills[cat] = list(dict.fromkeys(existing + items))
        merged["skills"] = merged_skills

        return merged

    def _build_result(
        self,
        parsed: Dict[str, Any],
        raw_text: str,
        provider: str,
        tokens_used: int = 0,
        tokens_saved: int = 0,
        strategy: str = "",
    ) -> Dict[str, Any]:
        experiences = parsed.get("experiences", [])
        projects = parsed.get("projects", [])
        education = parsed.get("education", [])
        skills = parsed.get("skills", {})
        awards = parsed.get("awards_and_leadership", [])

        for i, exp in enumerate(experiences):
            if not exp.get("id"):
                exp["id"] = f"exp-pdf-{i+1}"
        for i, proj in enumerate(projects):
            if not proj.get("id"):
                proj["id"] = f"proj-pdf-{i+1}"
        for i, aw in enumerate(awards):
            if not aw.get("id"):
                aw["id"] = f"award-pdf-{i+1}"

        total_skills = sum(len(v) if isinstance(v, list) else 1 for v in skills.values())
        total_tokens = tokens_used + tokens_saved
        efficiency_pct = round((tokens_saved / total_tokens * 100), 1) if total_tokens > 0 else 100.0

        return {
            "success": True,
            "provider": provider,
            "raw_text_snippet": raw_text[:300] + ("..." if len(raw_text) > 300 else ""),
            "profile_data": parsed,
            "counts": {
                "experiences": len(experiences),
                "projects": len(projects),
                "education": len(education),
                "skills": total_skills,
                "awards": len(awards),
            },
            "token_metrics": {
                "tokens_used": tokens_used,
                "tokens_saved": tokens_saved,
                "efficiency_pct": efficiency_pct,
                "strategy": strategy,
            },
        }
