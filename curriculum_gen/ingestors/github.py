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
        Extracts project highlights, metrics, and tech stack from repository info and README.
        """
        title = repo_data.get("name", "Project")
        description = repo_data.get("description") or ""
        html_url = repo_data.get("html_url", "")
        language = repo_data.get("language")
        topics = repo_data.get("topics", [])

        bullets = []
        metrics = []

        # Subtitle: language and topics
        subtitle_parts = []
        if language:
            subtitle_parts.append(language)
        if topics:
            subtitle_parts.extend(topics[:4])
        subtitle = ", ".join(subtitle_parts) if subtitle_parts else None

        if readme_text:
            # 1. Search for benchmark / metric lines
            # Looks for bullet points with numbers, %, ms, x, throughput, latency
            lines = readme_text.splitlines()
            for line in lines:
                clean_line = line.strip()
                if clean_line.startswith(("-", "*", "•")) and len(clean_line) > 15:
                    bullet_text = clean_line.lstrip("-*• ").strip()
                    # Check for metrics
                    found_metrics = re.findall(
                        r"(\b\d+[\d.,]*%|\b\d+(?:\.\d+)?\s*[\u00D7x]|\b[><]?\d+\s*ms\b)",
                        bullet_text,
                        re.IGNORECASE,
                    )
                    if found_metrics:
                        metrics.extend(found_metrics)
                        bullets.append(bullet_text)
                    elif any(kw in bullet_text.lower() for kw in ["reduced", "increased", "optimized", "built", "implemented", "achieved"]):
                        bullets.append(bullet_text)

            # Cap extracted bullets to top 4 most informative
            bullets = bullets[:4]

        # If no bullet points were found in the README, fall back to repo description
        if not bullets and description:
            bullets.append(description)

        tags = []
        if language:
            tags.append(language)
        tags.extend(topics)

        return ProjectItem(
            title=title,
            subtitle=subtitle,
            url=html_url,
            url_label="GitHub",
            tags=tags,
            raw_bullets=bullets,
            metrics=metrics,
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
