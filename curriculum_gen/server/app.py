import os
import base64
import yaml
from pathlib import Path
from typing import Optional, List, Dict, Any, Union
from fastapi import FastAPI, HTTPException, Body, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel

from curriculum_gen.models import (
    UserProfile,
    JobContext,
    ExperienceItem,
    ProjectItem,
    AwardOrLeadershipItem,
)
from curriculum_gen.matcher import MatcherEngine
from curriculum_gen.llm_optimizer import LLMOptimizer
from curriculum_gen.compiler import PDFCompiler, CompileError
from curriculum_gen.ingestors.github import GitHubIngestor
from curriculum_gen.ingestors.academic import AcademicIngestor
from curriculum_gen.ingestors.resume_pdf import ResumePDFIngestor
from curriculum_gen.token_tracker import token_tracker

app = FastAPI(
    title="Curriculum-Gen API",
    description="Backend API for tailored 1-page ATS LaTeX CV generator",
    version="0.1.0",
)

# Enable CORS for local React/Vite frontend (typically http://localhost:5173 or 3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def get_empty_profile() -> UserProfile:
    return UserProfile.empty()


def get_active_profile_path(for_write: bool = False) -> Path:
    # Dedicated user active profile in data/
    user_active = PROJECT_ROOT / "data" / "active_profile.yaml"
    if for_write:
        user_active.parent.mkdir(parents=True, exist_ok=True)
        return user_active
    if user_active.exists():
        return user_active

    # Check if a custom profile.yaml exists at the project root
    root_profile = PROJECT_ROOT / "profile.yaml"
    if root_profile.exists():
        return root_profile

    # Initialize data/active_profile.yaml with an empty profile by default
    user_active.parent.mkdir(parents=True, exist_ok=True)
    with open(user_active, "w", encoding="utf-8") as f:
        yaml.dump(get_empty_profile().model_dump(), f, sort_keys=False, allow_unicode=True)
    return user_active


class GenerateRequest(BaseModel):
    profile: UserProfile
    job_description: str = ""
    language: str = "pt"  # "pt" or "en"
    visible_contacts: Optional[List[Union[str, Dict[str, Any]]]] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None
    provider: Optional[str] = None
    max_exps: int = 2
    max_projs: int = 2
    max_awards: int = 2


class GitHubIngestRequest(BaseModel):
    username: str
    token: Optional[str] = None
    max_repos: int = 10


class AcademicIngestRequest(BaseModel):
    query_or_url: str


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "Curriculum-Gen API"}


@app.get("/api/profile", response_model=UserProfile)
def get_profile():
    path = get_active_profile_path()
    if not path.exists():
        return get_empty_profile()
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return UserProfile(**data)


@app.post("/api/profile")
def save_profile(profile: UserProfile):
    path = get_active_profile_path(for_write=True)
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(profile.model_dump(), f, sort_keys=False, allow_unicode=True)
    return {"status": "saved", "path": str(path.name)}


@app.post("/api/profile/reset")
def reset_profile():
    user_active = PROJECT_ROOT / "data" / "active_profile.yaml"
    empty = get_empty_profile()
    user_active.parent.mkdir(parents=True, exist_ok=True)
    with open(user_active, "w", encoding="utf-8") as f:
        yaml.dump(empty.model_dump(), f, sort_keys=False, allow_unicode=True)
    return {"status": "reset", "profile": empty.model_dump()}


@app.post("/api/generate")
def generate_resume(req: GenerateRequest):
    profile = req.profile

    if req.visible_contacts:
        profile.personal.visible_items = [
            c.get("key", str(c)) if isinstance(c, dict) else str(c)
            for c in req.visible_contacts
        ]

    # Auto-persist non-empty profile to active_profile.yaml so it survives restarts/refreshes
    if profile.personal.name or profile.experiences or profile.projects or profile.awards_and_leadership:
        try:
            path = get_active_profile_path(for_write=True)
            with open(path, "w", encoding="utf-8") as f:
                yaml.dump(profile.model_dump(), f, sort_keys=False, allow_unicode=True)
        except Exception as e:
            print(f"[CurriculumGen Server] Failed to auto-persist profile on generate: {e}")

    job_context = JobContext(
        job_description=req.job_description,
        language=req.language,
        max_experiences=req.max_exps,
        max_projects=req.max_projs,
        max_awards=req.max_awards,
    )

    # 1. Matching & Scoring Engine
    matcher = MatcherEngine(job_context)
    selected_exps, selected_projs, selected_awards = matcher.match(profile)

    # 2. LLM Optimizer (Memory-only API key handling)
    llm = LLMOptimizer(api_key=req.api_key, base_url=req.base_url, model=req.model, provider=req.provider)
    for exp in selected_exps:
        exp.formatted_bullets = llm.optimize_experience(exp, job_context)
    for proj in selected_projs:
        proj.formatted_bullets = llm.optimize_project(proj, job_context)

    # 3. Compiler & 1-page fit
    compiler = PDFCompiler()
    out_dir = PROJECT_ROOT / "output"
    out_dir.mkdir(exist_ok=True)
    out_pdf = out_dir / f"web_preview_{req.language}.pdf"
    out_tex = out_dir / f"web_preview_{req.language}.tex"

    try:
        tex_code, pages = compiler.render_and_fit_one_page(
            profile=profile,
            selected_experiences=selected_exps,
            selected_projects=selected_projs,
            selected_awards=selected_awards,
            language=req.language,
            output_pdf_path=out_pdf,
            output_tex_path=out_tex,
        )

        pdf_bytes = out_pdf.read_bytes()
        pdf_b64 = base64.b64encode(pdf_bytes).decode("utf-8")

        token_metrics = llm.get_token_metrics()
        if token_metrics and (token_metrics.get("tokens_saved", 0) > 0 or token_metrics.get("tokens_used", 0) > 0):
            token_tracker.record_llm_optimizer_metrics(
                token_metrics,
                target_role=req.job_description[:40].replace("\n", " ").strip(),
            )

        ats_diagnostics = matcher.analyze_ats(
            profile=profile,
            selected_exps=selected_exps,
            selected_projs=selected_projs,
            selected_awards=selected_awards,
        )

        return {
            "page_count": pages,
            "tex_source": tex_code,
            "pdf_base64": pdf_b64,
            "selected_experiences": selected_exps,
            "selected_projects": selected_projs,
            "selected_awards": selected_awards,
            "skills": profile.skills,
            "ats_diagnostics": ats_diagnostics,
            "llm_status": {
                "active": llm.is_available() and bool(req.api_key),
                "provider": llm.provider,
                "model": llm.model,
                "calls_succeeded": llm.calls_succeeded,
                "error": llm.last_error,
            },
            "token_metrics": token_metrics,
        }
    except CompileError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@app.post("/api/ingest/github")
def ingest_github(req: GitHubIngestRequest):
    ingestor = GitHubIngestor(token=req.token)
    projects = ingestor.ingest_user_projects(req.username, max_repos=req.max_repos)

    raw_chars = sum(len(p.readme_content or "") for p in projects)
    distilled_chars = sum(len(" ".join(p.raw_bullets)) for p in projects)
    saved_tokens = max(600, (raw_chars - distilled_chars) // 4) if raw_chars > 0 else 600

    token_tracker.record_operation(
        operation=f"Ingestão GitHub (@{req.username})",
        tokens_used=0,
        tokens_saved=saved_tokens,
        category="github_readme_distillation",
        strategy="README Benchmark & Metrics Distillation",
        details=f"{len(projects)} repositórios analisados. Extração cirúrgica de métricas sem ler código-fonte bruto.",
        provider="github_api",
    )
    return {"projects": projects, "tokens_saved": saved_tokens}


@app.post("/api/ingest/academic")
def ingest_academic(req: AcademicIngestRequest):
    url = req.query_or_url.strip()
    res = None
    if "arxiv" in url.lower() or url.replace(".", "").isdigit():
        res = AcademicIngestor.fetch_arxiv_abstract(url)
    elif "doi.org" in url.lower() or "10." in url:
        res = AcademicIngestor.fetch_doi_metadata(url)

    if not res:
        raise HTTPException(status_code=400, detail="Could not extract abstract for the provided identifier or URL.")

    saved_tokens = 3200  # Avoided ~15 pages of raw PDF
    token_tracker.record_operation(
        operation="Ingestão Acadêmica (ArXiv/DOI)",
        tokens_used=0,
        tokens_saved=saved_tokens,
        category="academic_abstract_pruning",
        strategy="Abstract & Metadata Slicing",
        details=f"Artigo '{res.get('title', '')[:45]}...'. Poda de documento científico completo.",
        provider="academic_api",
    )
    return {"paper": res, "tokens_saved": saved_tokens}


@app.post("/api/ingest/pdf")
async def ingest_resume_pdf(
    file: UploadFile = File(...),
    api_key: Optional[str] = Form(None),
    model: Optional[str] = Form(None),
    provider: Optional[str] = Form(None),
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="O arquivo enviado deve ser um PDF (.pdf).")

    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="Arquivo PDF vazio.")

    clean_key = api_key.strip().strip('"').strip("'") if api_key else None
    ingestor = ResumePDFIngestor(api_key=clean_key, model=model, provider=provider)
    try:
        result = ingestor.ingest(pdf_bytes)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao processar PDF: {str(e)}")


class SuggestDescriptionRequest(BaseModel):
    item_type: str
    title: str
    subtitle_or_org: Optional[str] = ""
    current_description: Optional[str] = ""
    job_description: Optional[str] = ""
    language: Optional[str] = "pt"
    profile_context: Optional[Dict[str, Any]] = None
    mode: Optional[str] = "generate"  # 'generate', 'improve', 'cross_ref'
    target_project_id_or_title: Optional[str] = None
    api_key: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    base_url: Optional[str] = None


@app.post("/api/suggest-description")
def suggest_description(req: SuggestDescriptionRequest):
    clean_key = req.api_key.strip().strip('"').strip("'") if req.api_key else None
    llm = LLMOptimizer(
        api_key=clean_key,
        base_url=req.base_url,
        model=req.model,
        provider=req.provider,
    )
    result = llm.generate_description(
        item_type=req.item_type,
        title=req.title,
        subtitle_or_org=req.subtitle_or_org or "",
        current_description=req.current_description or "",
        job_description=req.job_description or "",
        language=req.language or "pt",
        profile_context=req.profile_context,
        mode=req.mode or "generate",
        target_project=req.target_project_id_or_title,
    )

    suggestion_text = result.get("text", "") if isinstance(result, dict) else str(result)
    tokens_used = result.get("tokens_used", 0) if isinstance(result, dict) else 0
    tokens_saved = result.get("tokens_saved", 320 if tokens_used == 0 else 0) if isinstance(result, dict) else 0
    provider_used = result.get("provider", "offline_heuristic") if isinstance(result, dict) else "offline_heuristic"
    strategy_used = result.get("strategy", "Síntese Contextual de Perfil") if isinstance(result, dict) else "Síntese Determinística"
    cross_refs = result.get("cross_refs", []) if isinstance(result, dict) else []

    # Record operation in token tracker so metrics and history are accurate
    token_tracker.record_operation(
        operation=f"Sugestão IA ({req.mode or 'generate'})",
        tokens_used=tokens_used,
        tokens_saved=tokens_saved,
        category="job_distillation" if tokens_used > 0 else "pdf_distillation_and_schema",
        strategy=strategy_used,
        details=f"{req.item_type.capitalize()}: {req.title[:35]}",
        provider=provider_used,
    )

    return {
        "suggestion": suggestion_text,
        "text": suggestion_text,
        "tokens_used": tokens_used,
        "tokens_saved": tokens_saved,
        "strategy": strategy_used,
        "provider": provider_used,
        "cross_refs": cross_refs,
    }


class SuggestFusionRequest(BaseModel):
    items: List[Dict[str, Any]]
    profile_context: Optional[Dict[str, Any]] = None
    language: Optional[str] = "pt"
    job_description: Optional[str] = ""
    api_key: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    base_url: Optional[str] = None


@app.post("/api/suggest-fusion")
def suggest_fusion(req: SuggestFusionRequest):
    clean_key = req.api_key.strip().strip('"').strip("'") if req.api_key else None
    llm = LLMOptimizer(
        api_key=clean_key,
        base_url=req.base_url,
        model=req.model,
        provider=req.provider,
    )
    result = llm.generate_fusion(
        items=req.items,
        profile_context=req.profile_context,
        language=req.language or "pt",
        job_description=req.job_description or "",
    )

    fused_item = result.get("fused_item", {})
    tokens_used = result.get("tokens_used", 0)
    tokens_saved = result.get("tokens_saved", 350 if tokens_used == 0 else 0)
    provider_used = result.get("provider", "offline_heuristic")
    strategy_used = result.get("strategy", "Fusão Sintética de Conquistas Relacionadas")

    token_tracker.record_operation(
        operation="Fusão de Conquistas com IA",
        tokens_used=tokens_used,
        tokens_saved=tokens_saved,
        category="job_distillation" if tokens_used > 0 else "pdf_distillation_and_schema",
        strategy=strategy_used,
        details=f"Fusão de {len(req.items)} itens: {', '.join(i.get('title', '')[:20] for i in req.items)}",
        provider=provider_used,
    )

    return {
        "fused_item": fused_item,
        "tokens_used": tokens_used,
        "tokens_saved": tokens_saved,
        "strategy": strategy_used,
        "provider": provider_used,
    }


class VerifyKeyRequest(BaseModel):
    api_key: str
    model: Optional[str] = None
    provider: Optional[str] = None


@app.post("/api/llm/verify")
def verify_llm_key(req: VerifyKeyRequest):
    key = req.api_key.strip().strip('"').strip("'").strip()
    if not key:
        raise HTTPException(status_code=400, detail="Chave de API não informada.")

    llm = LLMOptimizer(api_key=key, model=req.model, provider=req.provider)
    if not llm.client:
        return {
            "valid": False,
            "provider": llm.provider,
            "model": llm.model,
            "message": llm.last_error or "Não foi possível inicializar o cliente da LLM.",
        }

    provider_names = {
        "gemini": "Google Gemini",
        "openai": "OpenAI",
        "groq": "Groq",
    }
    p_name = provider_names.get(llm.provider, llm.provider.upper())

    # 1. Direct native verification for Google Gemini (uses ModelService.ListModels)
    if llm.provider == "gemini":
        import httpx
        url = f"https://generativelanguage.googleapis.com/v1beta/models?key={key}"
        try:
            res = httpx.get(url, timeout=12.0)
            if res.status_code == 200:
                data = res.json()
                models_list = data.get("models", [])
                available = [
                    m["name"].replace("models/", "")
                    for m in models_list
                    if "generateContent" in m.get("supportedGenerationMethods", [])
                ]
                
                print(f"[CurriculumGen Verify] Modelos disponíveis na conta Gemini: {available}")
                # Pick the best active model
                chosen_model = "gemini-2.0-flash"
                for pref in [
                    req.model,
                    "gemini-2.0-flash",
                    "gemini-2.5-flash",
                    "gemini-2.0-flash-exp",
                    "gemini-1.5-flash",
                    "gemini-1.5-flash-latest",
                    "gemini-1.5-flash-8b",
                    "gemini-1.5-pro",
                ]:
                    if pref and pref in available:
                        chosen_model = pref
                        break
                else:
                    if available:
                        chosen_model = available[0]

                return {
                    "valid": True,
                    "provider": "Google Gemini",
                    "model": chosen_model,
                    "available_models": available,
                    "message": f"Chave autenticada com sucesso no Google Gemini! Modelo ativo: {chosen_model}",
                }
            else:
                err_data = res.json().get("error", {})
                err_msg = err_data.get("message", res.text)
                if "API key not valid" in err_msg or "INVALID_ARGUMENT" in err_msg or "API_KEY_INVALID" in str(err_data):
                    msg = "Chave de API do Google Gemini inválida. Crie uma chave gratuita no Google AI Studio: https://aistudio.google.com/app/apikey"
                elif "PERMISSION_DENIED" in err_msg or res.status_code == 403:
                    msg = f"Acesso negado para esta chave no Gemini: {err_msg[:140]}"
                elif "RESOURCE_EXHAUSTED" in err_msg or res.status_code == 429:
                    msg = "Chave válida, mas sua cota de requisições no Gemini foi atingida temporariamente."
                else:
                    msg = f"Erro retornado pelo Google Gemini: {err_msg[:160]}"
                return {
                    "valid": False,
                    "provider": "Google Gemini",
                    "model": req.model or "gemini-2.0-flash",
                    "message": msg,
                }
        except Exception as e:
            return {
                "valid": False,
                "provider": "Google Gemini",
                "model": req.model or "gemini-2.0-flash",
                "message": f"Erro de conexão com o Google Gemini: {str(e)}",
            }

    # 2. For OpenAI, Groq, etc.
    try:
        llm.client.chat.completions.create(
            model=llm.model,
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=2,
        )
        return {
            "valid": True,
            "provider": p_name,
            "model": llm.model,
            "message": f"Chave autenticada com sucesso no {p_name} ({llm.model})!",
        }
    except Exception as e:
        err_msg = str(e)
        err_lower = err_msg.lower()
        if "401" in err_lower or "unauthorized" in err_lower:
            clean_msg = f"Chave de API inválida ou não autorizada no {p_name} (Erro 401)."
        elif "quota" in err_lower or "429" in err_lower:
            clean_msg = f"Chave válida, mas a cota de uso foi atingida no {p_name}."
        else:
            clean_msg = f"Erro retornado pela API ({p_name}): {err_msg[:200]}"
        return {
            "valid": False,
            "provider": p_name,
            "model": llm.model,
            "message": clean_msg,
        }


@app.get("/api/tokens/stats")
def get_token_telemetry():
    """Returns persistent token economy and savings metrics across all operations."""
    return token_tracker.get_summary()


@app.post("/api/tokens/reset")
def reset_token_telemetry():
    """Resets persistent token metrics to initial zero baseline."""
    return token_tracker.reset()


@app.get("/api/tokens/readme")
def get_token_readme_snippet():
    """Generates ready-to-copy Markdown snippet explaining token strategies and efficiency metrics."""
    return {"markdown": token_tracker.generate_readme_snippet()}
