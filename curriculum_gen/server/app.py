import os
import base64
import yaml
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Body
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


def get_active_profile_path() -> Path:
    # Check local user profile first, then sample
    candidates = [
        PROJECT_ROOT / "examples" / "profile_joaosoares.yaml",
        PROJECT_ROOT / "profile.yaml",
        PROJECT_ROOT / "examples" / "profile_sample.yaml",
    ]
    for c in candidates:
        if c.exists():
            return c
    return candidates[-1]


class GenerateRequest(BaseModel):
    profile: UserProfile
    job_description: str = ""
    language: str = "pt"  # "pt" or "en"
    visible_contacts: Optional[List[str]] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None
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
        raise HTTPException(status_code=404, detail="No profile found")
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return UserProfile(**data)


@app.post("/api/profile")
def save_profile(profile: UserProfile):
    path = get_active_profile_path()
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(profile.model_dump(), f, sort_keys=False, allow_unicode=True)
    return {"status": "saved", "path": str(path.name)}


@app.post("/api/generate")
def generate_resume(req: GenerateRequest):
    profile = req.profile

    if req.visible_contacts:
        profile.personal.visible_items = req.visible_contacts

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
    llm = LLMOptimizer(api_key=req.api_key, base_url=req.base_url, model=req.model)
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

        return {
            "page_count": pages,
            "tex_source": tex_code,
            "pdf_base64": pdf_b64,
            "selected_experiences": selected_exps,
            "selected_projects": selected_projs,
            "selected_awards": selected_awards,
        }
    except CompileError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@app.post("/api/ingest/github")
def ingest_github(req: GitHubIngestRequest):
    ingestor = GitHubIngestor(token=req.token)
    projects = ingestor.ingest_user_projects(req.username, max_repos=req.max_repos)
    return {"projects": projects}


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
    return {"paper": res}
