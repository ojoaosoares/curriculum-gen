import os
import re
import base64
from typing import List, Optional, Dict, Any
import requests

from curriculum_gen.models import ProjectItem


class GitHubIngestor:
    """
    Fetches repositories and parses README files to discover projects,
    tech stacks, benchmark results, and quantified outcomes.
    """

    def __init__(self, token: Optional[str] = None):
        self.token = token or os.getenv("GITHUB_TOKEN")
        self.headers = {"Accept": "application/vnd.github.v3+json"}
        if self.token:
            self.headers["Authorization"] = f"token {self.token}"

    def fetch_user_repos(self, username: str, max_repos: int = 15) -> List[Dict[str, Any]]:
        """Fetch non-fork public repositories for a given username."""
        url = f"https://api.github.com/users/{username}/repos?sort=updated&per_page={max_repos}"
        try:
            resp = requests.get(url, headers=self.headers, timeout=10)
            if resp.status_code == 200:
                repos = resp.json()
                return [r for r in repos if not r.get("fork", False)]
        except Exception:
            pass
        return []

    def fetch_readme(self, owner: str, repo: str) -> Optional[str]:
        """Fetch README content in markdown for a specific repo."""
        # Try GitHub API first
        url = f"https://api.github.com/repos/{owner}/{repo}/readme"
        try:
            resp = requests.get(url, headers=self.headers, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                content = data.get("content", "")
                encoding = data.get("encoding", "")
                if encoding == "base64":
                    return base64.b64decode(content).decode("utf-8", errors="ignore")
        except Exception:
            pass

        # Fallback to raw githubusercontent for main or master
        for branch in ["main", "master"]:
            raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/README.md"
            try:
                resp = requests.get(raw_url, timeout=6)
                if resp.status_code == 200:
                    return resp.text
            except Exception:
                continue

        return None

    def parse_readme_for_project(self, repo_data: Dict[str, Any], readme_text: Optional[str]) -> ProjectItem:
        """
        Extracts project highlights, metrics, and tech stack from BOTH repository info (About/description)
        and README markdown (overview sections, architecture, benchmarks, quantified metrics).
        """
        title = repo_data.get("name", "Project")
        description = (repo_data.get("description") or "").strip()
        html_url = repo_data.get("html_url", "")
        language = repo_data.get("language")
        topics = repo_data.get("topics", [])

        bullets = []
        metrics = []

        # 1. First bullet: Repo description (About)
        # If GitHub repo has a description, it provides the essential high-level context
        if description:
            clean_desc = description.rstrip(".") + "."
            bullets.append(clean_desc)
            # Find metrics in description as well
            found_metrics = re.findall(
                r"(\b\d+[\d.,]*%|\b\d+(?:\.\d+)?\s*[\u00D7x]|\b[><]?\d+\s*(?:ms|us|ns|gbps|mbps)\b)",
                clean_desc,
                re.IGNORECASE,
            )
            metrics.extend(found_metrics)

        # 2. Extract from README
        if readme_text:
            lines = [l.strip() for l in readme_text.splitlines()]

            # 2a. Find overview/summary paragraph if not already covered by repo description
            intro_lines = []
            capture_intro = False
            for line in lines:
                if line.startswith("# ") or re.match(r"^##\s+(?:about|overview|description|introdução|sobre|resumo)", line, re.IGNORECASE):
                    capture_intro = True
                    continue
                if capture_intro:
                    if line.startswith("#"):
                        break
                    if line and not line.startswith(("[!", "<", "[![", "```")):
                        intro_lines.append(line)
                        if len(intro_lines) >= 2 or line.endswith("."):
                            break

            if intro_lines:
                intro_text = " ".join(intro_lines).strip()
                if len(intro_text) > 25 and (not description or description.lower() not in intro_text.lower()):
                    bullets.append(intro_text[:280].rstrip(".") + ".")

            # 2b. Search for benchmark, metric, or technical architecture lines
            for line in lines:
                is_bullet = line.startswith(("-", "*", "•"))
                line_content = line.lstrip("-*• ").strip() if is_bullet else line

                if len(line_content) > 15:
                    found_metrics = re.findall(
                        r"(\b\d+[\d.,]*%|\b\d+(?:\.\d+)?\s*[\u00D7x]|\b[><]?\d+\s*(?:ms|us|ns|gbps|mbps)\b)",
                        line_content,
                        re.IGNORECASE,
                    )
                    if found_metrics:
                        metrics.extend(found_metrics)
                        if line_content not in bullets:
                            bullets.append(line_content)
                    elif is_bullet and any(kw in line_content.lower() for kw in [
                        "reduced", "increased", "optimized", "built", "implemented", "achieved", "designed",
                        "desenvolveu", "otimizou", "implementou", "alcançou", "redução", "aumento", "vazão", "latência"
                    ]):
                        if line_content not in bullets:
                            bullets.append(line_content)

            # Cap extracted bullets to top 4 most informative
            bullets = bullets[:4]

        # 3. Fallback if both description and readme were empty
        if not bullets:
            bullets.append(f"Desenvolvimento e arquitetura do projeto {title}.")

        # 4. Tech stack: Language, Topics, and Technologies detected in README
        tags = []
        if language:
            tags.append(language)
        for t in topics:
            if t not in tags:
                tags.append(t)

        if readme_text:
            common_techs = [
                "eBPF", "XDP", "Linux Kernel", "DNS", "C", "C++", "Rust", "Go", "Python",
                "TypeScript", "React", "React Native", "NestJS", "Node.js", "TypeORM",
                "Docker", "Kubernetes", "Playwright", "Jest", "GPU", "CUDA", "ns-3"
            ]
            lower_readme = readme_text.lower()
            for tech in common_techs:
                if tech.lower() in lower_readme and tech not in tags:
                    tags.append(tech)

        subtitle_parts = []
        if language:
            subtitle_parts.append(language)
        subtitle_parts.extend([t for t in tags if t != language][:4])
        subtitle = ", ".join(subtitle_parts) if subtitle_parts else None

        return ProjectItem(
            title=title,
            subtitle=subtitle,
            url=html_url,
            url_label="GitHub",
            tags=tags[:8],
            raw_bullets=bullets,
            metrics=list(dict.fromkeys(metrics)),
            github_repo=repo_data.get("full_name"),
            readme_content=readme_text,
        )

    def ingest_user_projects(self, username: str, max_repos: int = 10) -> List[ProjectItem]:
        """
        Fetches all public repos for a user and creates structured ProjectItem objects.
        """
        repos = self.fetch_user_repos(username, max_repos=max_repos)
        projects = []
        for repo in repos:
            owner = repo["owner"]["login"]
            name = repo["name"]
            readme = self.fetch_readme(owner, name)
            proj = self.parse_readme_for_project(repo, readme)
            projects.append(proj)
        return projects
