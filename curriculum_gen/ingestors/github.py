import os
import re
import base64
from typing import List, Optional, Dict, Any, Tuple
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

    @staticmethod
    def _clean_markdown_prose(text: str) -> str:
        """
        Removes fenced code blocks, HTML, badges, tables, shell commands, and emojis.
        Returns clean prose text for analysis and extraction.
        """
        if not text:
            return ""
        # 1. Remove all fenced code blocks ```...```
        s = re.sub(r"```[\s\S]*?```", "\n", text)
        # 2. Remove HTML comments and tags
        s = re.sub(r"<!--[\s\S]*?-->", "", s)
        s = re.sub(r"<[^>]+>", "", s)
        # 3. Remove image links and badge lines
        s = re.sub(r"\[\!\[[^\]]*\]\([^)]*\)\]\([^)]*\)", "", s)
        s = re.sub(r"\!\[[^\]]*\]\([^)]*\)", "", s)
        # 4. Remove emojis
        s = re.sub(
            r"[\U00010000-\U0010ffff\u2600-\u26ff\u2700-\u27bf\u200d\ufe0f]",
            "",
            s,
        )
        # 5. Remove markdown tables and shell prompts
        cleaned_lines = []
        for line in s.splitlines():
            trimmed = line.strip()
            if trimmed.startswith("|") and trimmed.endswith("|"):
                continue
            if re.match(r"^\|?[\s:\-]+\|[\s:\-]+\|?$", trimmed):
                continue
            if re.match(r"^(?:\$|#|sudo|git\s+clone|npm\s+install|docker\s+run|pip\s+install|make\b)\s+", trimmed):
                continue
            if re.match(r"^\d+:\s+\w+\s+name\s+", trimmed):  # bpftool dump line
                continue
            cleaned_lines.append(line)
        return "\n".join(cleaned_lines)

    @classmethod
    def _extract_genuine_technologies(
        cls, repo_data: Dict[str, Any], clean_text: str
    ) -> List[str]:
        """
        Extracts genuine technologies using verified repo language, topics, and strict
        word-boundary matches on clean prose. Never uses naive substring searching.
        """
        tags: List[str] = []
        lang = repo_data.get("language")
        if lang and lang.strip():
            tags.append(lang.strip())

        topics = repo_data.get("topics", [])
        topic_map = {
            "ebpf": "eBPF",
            "xdp": "XDP",
            "dns": "DNS",
            "linux": "Linux",
            "kernel": "Linux Kernel",
            "bpf": "eBPF",
            "af-xdp": "AF_XDP",
            "af_xdp": "AF_XDP",
            "k8s": "Kubernetes",
            "kubernetes": "Kubernetes",
            "docker": "Docker",
            "react": "React",
            "react-native": "React Native",
            "reactnative": "React Native",
            "nestjs": "NestJS",
            "nodejs": "Node.js",
            "node": "Node.js",
            "fastapi": "FastAPI",
            "postgres": "PostgreSQL",
            "postgresql": "PostgreSQL",
            "redis": "Redis",
            "typescript": "TypeScript",
            "python": "Python",
            "rust": "Rust",
            "golang": "Go",
            "go": "Go",
            "c": "C",
            "cpp": "C++",
            "cplusplus": "C++",
        }
        for t in topics:
            norm = topic_map.get(str(t).lower(), str(t))
            if norm and not any(norm.lower() == x.lower() for x in tags):
                tags.append(norm)

        # Strict word boundary patterns on clean prose (no code fences, no inline code)
        tech_patterns = [
            ("eBPF", r"\beBPF\b", re.IGNORECASE),
            ("XDP", r"\bXDP\b", re.IGNORECASE),
            ("AF_XDP", r"\bAF[_-]?XDP\b", re.IGNORECASE),
            ("Linux Kernel", r"\bLinux\s+Kernel\b", re.IGNORECASE),
            ("DNS", r"\bDNS\b", 0),
            ("Docker", r"\bDocker\b", re.IGNORECASE),
            ("Kubernetes", r"\b(?:Kubernetes|k8s)\b", re.IGNORECASE),
            ("FastAPI", r"\bFastAPI\b", re.IGNORECASE),
            ("React", r"\bReact(?:\.js)?\b", 0),
            ("React Native", r"\bReact\s+Native\b", re.IGNORECASE),
            ("NestJS", r"\bNest\.?JS\b", re.IGNORECASE),
            ("Node.js", r"\bNode(?:\.js)?\b", re.IGNORECASE),
            ("TypeScript", r"\bTypeScript\b", re.IGNORECASE),
            ("Python", r"\bPython\b", re.IGNORECASE),
            ("Rust", r"\bRust\b", 0),
            ("Playwright", r"\bPlaywright\b", re.IGNORECASE),
            ("PostgreSQL", r"\b(?:PostgreSQL|Postgres)\b", re.IGNORECASE),
            ("Redis", r"\bRedis\b", re.IGNORECASE),
            ("CUDA", r"\bCUDA\b", 0),
            ("GPU", r"\bGPU\b", 0),
            ("ns-3", r"\bns-?3\b", re.IGNORECASE),
            ("Go", r"\b(?:Golang|Go\s+language|written\s+in\s+Go)\b", re.IGNORECASE),
            ("C", r"\b(?:linguagem\s+C|pure\s+C|written\s+in\s+C|ANSI\s+C)\b", re.IGNORECASE),
        ]

        for label, pat, flags in tech_patterns:
            if any(x.lower() == label.lower() for x in tags):
                continue
            if re.search(pat, clean_text, flags):
                tags.append(label)

        return tags

    @classmethod
    def _parse_readme_highlights(
        cls, title: str, repo_desc: str, readme_text: Optional[str]
    ) -> Tuple[List[str], List[str]]:
        """
        Extracts clean, informative bullet points (Summary, Key Features/Architecture, Benchmarks/Metrics).
        Guarantees no mid-word truncations, no code dumps, no tables, and no emojis.
        """
        bullets: List[str] = []
        metrics: List[str] = []

        clean_desc = (repo_desc or "").strip()
        if clean_desc:
            clean_desc = re.sub(
                r"[\U00010000-\U0010ffff\u2600-\u26ff\u2700-\u27bf\u200d\ufe0f]",
                "",
                clean_desc,
            ).strip()
            found_m = re.findall(
                r"(\b\d+[\d.,]*%|\b\d+(?:\.\d+)?\s*[\u00D7x]|\b[><]?\d+\s*(?:ms|us|ns|gbps|mbps)\b)",
                clean_desc,
                re.IGNORECASE,
            )
            metrics.extend(found_m)

        if not readme_text:
            if clean_desc:
                bullets.append(clean_desc.rstrip(".") + ".")
            else:
                bullets.append(f"Desenvolvimento e arquitetura do projeto {title}.")
            return bullets, metrics

        clean_prose = cls._clean_markdown_prose(readme_text)
        lines = [l.strip() for l in clean_prose.splitlines()]

        def clean_bullet_line(raw: str) -> str:
            s = re.sub(r"^[-*•◦\s]+", "", raw)
            s = re.sub(r"^\d+[\.\)]\s+", "", s)
            s = s.replace("**", "").replace("__", "").replace("`", "")
            s = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", s)
            s = re.sub(r"\s+([,.:;])", r"\1", s)
            s = re.sub(r"\s{2,}", " ", s).strip()
            return s

        # 1. Extract Overview paragraph
        overview_text = ""
        in_intro = False
        intro_lines: List[str] = []
        for line in lines:
            if not line:
                if intro_lines:
                    break
                continue
            if line.startswith("# ") or re.match(
                r"^##\s+(?:about|overview|description|introdução|sobre|resumo|what is)",
                line,
                re.IGNORECASE,
            ):
                in_intro = True
                continue
            if in_intro:
                if line.startswith("#"):
                    break
                if line.startswith("|") or re.match(r"^(?:\$|#|sudo|git|npm|docker|pip|make)\b", line):
                    continue
                intro_lines.append(clean_bullet_line(line))
                if sum(len(l) for l in intro_lines) > 120 and line.endswith((".", "!", "?")):
                    break

        if intro_lines:
            combined_intro = " ".join(intro_lines).strip()
            sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", combined_intro) if s.strip()]
            if sentences:
                picked: List[str] = []
                cur_len = 0
                for sent in sentences:
                    if cur_len + len(sent) < 320 or not picked:
                        picked.append(sent)
                        cur_len += len(sent)
                    else:
                        break
                overview_text = " ".join(picked).strip()

        if clean_desc and len(clean_desc) > 25:
            bullets.append(clean_desc.rstrip(".") + ".")
        elif overview_text and len(overview_text) > 25:
            bullets.append(overview_text.rstrip(".") + ".")

        # 2. Extract Feature Highlights and Benchmark/Metric lines
        current_section = ""
        feature_bullets: List[str] = []
        benchmark_bullets: List[str] = []

        feature_headers = (
            "feature", "recurso", "highlight", "destaque",
            "architecture", "arquitetura", "capacidade", "capability", "vantag"
        )
        benchmark_headers = (
            "benchmark", "performance", "desempenho", "result",
            "resultado", "avaliação", "evaluation", "metric"
        )

        for line in lines:
            if line.startswith("#"):
                h_text = line.lstrip("# ").lower()
                if any(fh in h_text for fh in feature_headers):
                    current_section = "feature"
                elif any(bh in h_text for bh in benchmark_headers):
                    current_section = "benchmark"
                else:
                    current_section = ""
                continue

            is_item = line.startswith(("-", "*", "•", "◦")) or bool(re.match(r"^\d+\.\s+", line))
            cleaned_l = clean_bullet_line(line)

            if (
                len(cleaned_l) < 20
                or cleaned_l.startswith("|")
                or re.match(r"^(?:\$|#|sudo|git|npm|docker|pip|make|cd|curl|wget)\b", cleaned_l)
            ):
                continue

            found_m = re.findall(
                r"(\b\d+[\d.,]*%|\b\d+(?:\.\d+)?\s*[\u00D7x]|\b[><]?\d+\s*(?:ms|us|ns|gbps|mbps)\b)",
                cleaned_l,
                re.IGNORECASE,
            )
            if found_m:
                metrics.extend(found_m)

            if current_section == "benchmark" or found_m:
                if is_item or found_m:
                    if cleaned_l not in benchmark_bullets and not any(cleaned_l in b for b in bullets):
                        benchmark_bullets.append(cleaned_l)
            elif current_section == "feature" or (
                is_item
                and any(
                    kw in cleaned_l.lower()
                    for kw in [
                        "support", "cache", "engine", "protocol", "pipeline", "distributed",
                        "zero-copy", "bypass", "recursiv", "resolv", "kernel", "ebpf",
                        "xdp", "filter", "hardware", "async", "optim"
                    ]
                )
            ):
                if cleaned_l not in feature_bullets and not any(cleaned_l in b for b in bullets):
                    feature_bullets.append(cleaned_l)

        for b in benchmark_bullets[:2]:
            b_clean = b.rstrip(".") + "."
            if b_clean not in bullets:
                bullets.append(b_clean)

        for f in feature_bullets[:2]:
            f_clean = f.rstrip(".") + "."
            if f_clean not in bullets and len(bullets) < 4:
                bullets.append(f_clean)

        if not bullets:
            bullets.append(f"Desenvolvimento e arquitetura do projeto {title}.")

        bullets = bullets[:4]
        metrics = list(dict.fromkeys(metrics))
        return bullets, metrics

    def parse_readme_for_project(self, repo_data: Dict[str, Any], readme_text: Optional[str]) -> ProjectItem:
        """
        Extracts clean project highlights, verified metrics, and accurate tech stack from repository
        metadata and README markdown (clean overview, architecture highlights, benchmarks).
        """
        title = repo_data.get("name", "Project")
        description = (repo_data.get("description") or "").strip()
        html_url = repo_data.get("html_url", "")
        language = repo_data.get("language")

        clean_prose = self._clean_markdown_prose(readme_text or "")
        bullets, metrics = self._parse_readme_highlights(title, description, readme_text)
        tags = self._extract_genuine_technologies(repo_data, clean_prose)

        # Build clean subtitle using confirmed technologies (language + top 3 genuine tags)
        subtitle_parts = []
        if language and any(language.lower() == t.lower() for t in tags):
            subtitle_parts.append(language)
        for t in tags:
            if not any(t.lower() == s.lower() for s in subtitle_parts) and len(subtitle_parts) < 4:
                subtitle_parts.append(t)
        subtitle = ", ".join(subtitle_parts) if subtitle_parts else None

        return ProjectItem(
            title=title,
            subtitle=subtitle,
            url=html_url,
            url_label="GitHub",
            tags=tags[:8],
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
