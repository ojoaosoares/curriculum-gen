import sys
import os
import yaml
from pathlib import Path
from typing import Optional, List
import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich import print as rprint
from dotenv import load_dotenv

from curriculum_gen.models import (
    UserProfile,
    JobContext,
    ContactInfo,
    EducationItem,
    ExperienceItem,
    ProjectItem,
    AwardOrLeadershipItem,
)
from curriculum_gen.matcher import MatcherEngine
from curriculum_gen.llm_optimizer import LLMOptimizer
from curriculum_gen.compiler import PDFCompiler
from curriculum_gen.ingestors.github import GitHubIngestor
from curriculum_gen.ingestors.academic import AcademicIngestor

# Load environment variables (.env)
load_dotenv()

app = typer.Typer(
    name="curriculum-gen",
    help="AI-powered 1-page ATS-optimized CV/Resume generator with Google XYZ formula, GitHub/paper ingestion, and smart job matching.",
    add_completion=False,
)
console = Console()


def load_profile_from_file(profile_path: Path) -> UserProfile:
    if not profile_path.exists():
        console.print(f"[bold red]Error:[/bold red] Profile file '{profile_path}' does not exist.")
        raise typer.Exit(code=1)

    raw_text = profile_path.read_text(encoding="utf-8")
    data = yaml.safe_load(raw_text)
    try:
        return UserProfile(**data)
    except Exception as e:
        console.print(f"[bold red]Error parsing profile schema:[/bold red] {e}")
        raise typer.Exit(code=1)


@app.command("init")
def init_profile(
    output: Path = typer.Option(
        Path("profile.yaml"),
        "--output",
        "-o",
        help="Path where the template profile should be created.",
    ),
):
    """
    Generate a starter profile.yaml with comments and examples.
    """
    template_path = Path(__file__).parent.parent / "examples" / "profile_template.yaml"
    if template_path.exists():
        content = template_path.read_text(encoding="utf-8")
    else:
        # Fallback simple schema
        content = """# Profile Template for Curriculum-Gen
personal:
  name: "Your Full Name"
  location: "City - State"
  email: "your.email@domain.com"
  phone: "+55 (11) 99999-9999"
  linkedin: "https://www.linkedin.com/in/yourhandle/"
  github: "https://github.com/yourhandle"
  lattes: "1035800800676947"
  visible_items:
    - location
    - email
    - phone
    - linkedin
    - github
    - lattes

last_updated: "Last updated in September 2026"
primary_color_rgb: "0, 79, 144"

education:
  - institution: "Your University"
    degree: "B.S. in Computer Science"
    period: "2023 – 2027 (Expected)"

experiences: []
projects: []
awards_and_leadership: []
skills:
  "Programming Languages": "Python, C++, Go, TypeScript"
  "Technologies": "Docker, Kubernetes, React, Redis"
"""
    output.write_text(content, encoding="utf-8")
    console.print(f"[bold green]✓[/bold green] Created template profile at [cyan]{output}[/cyan]")


@app.command("ingest-github")
def ingest_github(
    username: str = typer.Argument(..., help="GitHub username to fetch repositories from"),
    token: Optional[str] = typer.Option(None, "--token", "-t", help="GitHub Personal Access Token"),
    max_repos: int = typer.Option(10, "--max-repos", "-m", help="Maximum repositories to inspect"),
    append_to: Optional[Path] = typer.Option(
        None, "--append-to", "-a", help="Optional profile.yaml to append projects to"
    ),
):
    """
    Fetch public repositories and parse READMEs from a GitHub profile.
    """
    console.print(f"[bold blue]→[/bold blue] Querying GitHub for [cyan]{username}[/cyan]...")
    ingestor = GitHubIngestor(token=token)
    projects = ingestor.ingest_user_projects(username, max_repos=max_repos)

    table = Table(title=f"Discovered GitHub Projects for {username}")
    table.add_column("Repository", style="cyan", no_wrap=True)
    table.add_column("Tech / Subtitle", style="green")
    table.add_column("Highlights / Metrics", style="yellow")

    for p in projects:
        metrics_str = ", ".join(p.metrics) if p.metrics else f"{len(p.raw_bullets)} bullets"
        table.add_row(p.title, p.subtitle or "-", metrics_str)

    console.print(table)

    if append_to and append_to.exists():
        profile = load_profile_from_file(append_to)
        existing_titles = {pr.title.lower() for pr in profile.projects}
        added = 0
        for p in projects:
            if p.title.lower() not in existing_titles:
                profile.projects.append(p)
                added += 1
        with open(append_to, "w", encoding="utf-8") as f:
            yaml.dump(profile.model_dump(), f, sort_keys=False, allow_unicode=True)
        console.print(f"[bold green]✓[/bold green] Appended {added} new projects into [cyan]{append_to}[/cyan]")


@app.command("compile")
def compile_tex(
    tex_path: Path = typer.Argument(..., help="Path to .tex file"),
    output_pdf: Optional[Path] = typer.Option(None, "--output", "-o", help="Path to output .pdf"),
):
    """
    Compile a LaTeX file to PDF and verify page count.
    """
    if not tex_path.exists():
        console.print(f"[bold red]Error:[/bold red] '{tex_path}' not found.")
        raise typer.Exit(code=1)

    out_pdf = output_pdf or tex_path.with_suffix(".pdf")
    compiler = PDFCompiler()
    try:
        pages, _ = compiler.compile_tex_to_pdf(tex_path.read_text(encoding="utf-8"), out_pdf)
        color = "green" if pages == 1 else "yellow"
        console.print(f"[bold {color}]✓ Generated {out_pdf} ({pages} page{'s' if pages > 1 else ''})[/bold {color}]")
    except Exception as e:
        console.print(f"[bold red]Compilation error:[/bold red] {e}")
        raise typer.Exit(code=1)


@app.command("generate")
def generate(
    profile_path: Path = typer.Option(
        Path("profile.yaml"), "--profile", "-p", help="Path to YAML profile file"
    ),
    job_file: Optional[Path] = typer.Option(
        None, "--job", "-j", help="Path to job description file (use '-' or omit for stdin)"
    ),
    language: str = typer.Option(
        "en", "--lang", "-l", help="Language for generated CV: 'en' or 'pt'"
    ),
    output_pdf: Path = typer.Option(
        Path("output/resume.pdf"), "--output-pdf", "-o", help="Output PDF file"
    ),
    output_tex: Path = typer.Option(
        Path("output/resume.tex"), "--output-tex", "-t", help="Output LaTeX file"
    ),
    github_user: Optional[str] = typer.Option(
        None, "--github", "-g", help="Fetch and enrich projects from GitHub username"
    ),
    visible_contacts: Optional[str] = typer.Option(
        None,
        "--contacts",
        "-c",
        help="Comma-separated contact items to display near name (e.g. 'location,email,phone,linkedin,github,lattes')",
    ),
    api_key: Optional[str] = typer.Option(
        None, "--api-key", help="Generic LLM API key (or set OPENAI_API_KEY / GEMINI_API_KEY)"
    ),
    base_url: Optional[str] = typer.Option(
        None, "--base-url", help="Generic LLM base URL (e.g. for Ollama/vLLM/OpenRouter)"
    ),
    model: Optional[str] = typer.Option(
        None, "--model", help="LLM model to use (default: gpt-4o-mini or gemini-2.5-flash)"
    ),
    max_exps: int = typer.Option(2, "--max-exp", help="Maximum experiences on 1 page"),
    max_projs: int = typer.Option(2, "--max-proj", help="Maximum projects on 1 page"),
    max_awards: int = typer.Option(2, "--max-awards", help="Maximum awards/leadership entries"),
):
    """
    Generate a tailored 1-page CV matching the target job description.
    """
    console.print(
        Panel.fit(
            "[bold cyan]Curriculum-Gen[/bold cyan] [white]| Tailored 1-Page ATS Resume Engine[/white]\n"
            f"[dim]Language: {language.upper()} • Target Output: 1 Single Page[/dim]",
            border_style="blue",
        )
    )

    # 1. Load Profile
    profile = load_profile_from_file(profile_path)
    if visible_contacts:
        profile.personal.visible_items = [item.strip() for item in visible_contacts.split(",") if item.strip()]

    # 2. Ingest GitHub if requested
    if github_user:
        console.print(f"[bold blue]→[/bold blue] Ingesting projects from GitHub: [cyan]{github_user}[/cyan]...")
        gh_ingestor = GitHubIngestor()
        gh_projects = gh_ingestor.ingest_user_projects(github_user, max_repos=8)
        existing_titles = {p.title.lower() for p in profile.projects}
        for gp in gh_projects:
            if gp.title.lower() not in existing_titles:
                profile.projects.append(gp)
        console.print(f"  Added {len(gh_projects)} projects from GitHub.")

    # 3. Read Job Context (from file, argument, or stdin)
    job_text = ""
    if job_file and str(job_file) != "-":
        if job_file.exists():
            job_text = job_file.read_text(encoding="utf-8")
        else:
            console.print(f"[yellow]Warning: Job file '{job_file}' not found. Generating general CV.[/yellow]")
    elif not sys.stdin.isatty():
        # Read from pipe/stdin
        job_text = sys.stdin.read()

    job_context = JobContext(
        job_description=job_text,
        language=language,
        max_experiences=max_exps,
        max_projects=max_projs,
        max_awards=max_awards,
    )

    # 4. Run Search & Matching Engine
    console.print("[bold blue]→[/bold blue] Running Search & Matching Engine (Relevance, Recency, Diversity, Impact)...")
    matcher = MatcherEngine(job_context=job_context)
    selected_exps, selected_projs, selected_awards = matcher.match(profile)

    # Log matches in a clean table
    match_table = Table(title="Selected Entries for 1-Page Budget")
    match_table.add_column("Section", style="magenta")
    match_table.add_column("Title / Role", style="cyan")
    match_table.add_column("Score", style="green")

    for e in selected_exps:
        match_table.add_row("Experience", f"{e.role} @ {e.company}", f"{e.score:.3f}")
    for p in selected_projs:
        match_table.add_row("Project", p.title, f"{p.score:.3f}")
    for a in selected_awards:
        match_table.add_row("Award/Lead", a.title, f"{a.score:.3f}")

    console.print(match_table)

    # 5. Optimize Bullet Points with LLM (Google XYZ formula)
    console.print("[bold blue]→[/bold blue] Optimizing bullets with Google XYZ formula (sem soar mentiroso)...")
    llm = LLMOptimizer(api_key=api_key, base_url=base_url, model=model)
    if llm.is_available():
        console.print(f"  [green]Connected to LLM: {llm.model}[/green]")
    else:
        console.print("  [dim]LLM key not provided; using intelligent offline XYZ formatter & metric highlighter.[/dim]")

    for exp in selected_exps:
        exp.formatted_bullets = llm.optimize_experience(exp, job_context)
    for proj in selected_projs:
        proj.formatted_bullets = llm.optimize_project(proj, job_context)

    # 6. Compile to PDF with Adaptive 1-Page Fit Loop
    console.print("[bold blue]→[/bold blue] Compiling LaTeX & Verifying Strict 1-Page Constraint...")
    compiler = PDFCompiler()
    output_pdf.parent.mkdir(parents=True, exist_ok=True)
    output_tex.parent.mkdir(parents=True, exist_ok=True)

    tex_code, page_count = compiler.render_and_fit_one_page(
        profile=profile,
        selected_experiences=selected_exps,
        selected_projects=selected_projs,
        selected_awards=selected_awards,
        language=language,
        output_pdf_path=output_pdf,
        output_tex_path=output_tex,
    )

    if page_count == 1:
        console.print(
            Panel.fit(
                f"[bold green]SUCCESS: 1-Page CV Generated![/bold green]\n\n"
                f"📄 PDF Output: [bold cyan]{output_pdf}[/bold cyan] ([green]1 page[/green])\n"
                f"📝 TeX Source: [bold cyan]{output_tex}[/bold cyan]\n"
                f"🌐 Language: [bold]{language.upper()}[/bold]\n"
                f"🎯 Tailored to: {job_file.name if job_file else 'Provided Context / Profile'}",
                border_style="green",
            )
        )
    else:
        console.print(
            Panel.fit(
                f"[bold yellow]Generated CV with {page_count} pages.[/bold yellow]\n"
                f"📄 PDF Output: [bold cyan]{output_pdf}[/bold cyan]\n"
                f"📝 TeX Source: [bold cyan]{output_tex}[/bold cyan]\n"
                "[dim]Tip: Reduce max_exp or max_proj options to fit within 1 page.[/dim]",
                border_style="yellow",
            )
        )


@app.command("serve")
def serve(
    host: str = typer.Option("127.0.0.1", "--host", "-h", help="Host to bind"),
    port: int = typer.Option(8000, "--port", "-p", help="Port to bind"),
    reload: bool = typer.Option(False, "--reload", "-r", help="Enable auto-reload for development"),
):
    """
    Start the Curriculum-Gen backend REST API.
    """
    import uvicorn
    console.print(
        Panel.fit(
            f"[bold cyan]Curriculum-Gen API Server[/bold cyan]\n"
            f"[green]Endpoint:[/green] http://{host}:{port}\n"
            f"[dim]Docs available at:[/dim] http://{host}:{port}/docs",
            border_style="cyan",
        )
    )
    uvicorn.run("curriculum_gen.server.app:app", host=host, port=port, reload=reload)


if __name__ == "__main__":
    app()
