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
        # 5. Remove markdown tables, TSV tables, and shell prompts
        cleaned_lines = []
        for line in s.splitlines():
            trimmed = line.strip()
            if trimmed.startswith("|") or trimmed.endswith("|"):
                continue
            if trimmed.count("\t") >= 2:
                continue
            if re.match(r"^\|?[\s:\-]+\|[\s:\-]+\|?$", trimmed):
                continue
            if re.match(r"^(?:Metric|Throughput|Latency|Host CPU|Peak Throughput)\s+\b", trimmed, re.IGNORECASE):
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
            "smartnic": "SmartNIC",
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
            ("SmartNIC", r"\bSmartNIC\b", re.IGNORECASE),
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
        Extracts clean, informative bullet points (Summary/Architecture, Hardware Cache Offload, Benchmarks/Metrics).
        Guarantees no mid-word truncations, no code dumps, no tables, and no emojis.
        """
        bullets: List[str] = []
        metrics: List[str] = []

        metric_pat = re.compile(
            r"("
            r"\b\d+(?:[\.,]\d+)?\s*%"
            r"|\b\d+(?:[\.,]\d+)?\s*[×xX](?!\w)"
            r"|\b[><~]?\s*\d+(?:[\.,]\d+)?\s*(?:ms|us|ns|µs|s|min)\b"
            r"|\b[><~]?\s*\d+(?:[\.,]\d+)?\s*(?:k|m|g)?\s*(?:queries|query|reqs?|requests?|ops?|pages?|packets?|events?|msgs?|tokens?)/(?:s|sec|min)\b"
            r"|\b[><~]?\s*\d+(?:[\.,]\d+)?\s*(?:qps|tps|iops|fps|mbps|gbps|kbps)\b"
            r")",
            re.IGNORECASE,
        )

        clean_desc = (repo_desc or "").strip()
        if clean_desc:
            clean_desc = re.sub(
                r"[\U00010000-\U0010ffff\u2600-\u26ff\u2700-\u27bf\u200d\ufe0f]",
                "",
                clean_desc,
            ).strip()
            found_m = metric_pat.findall(clean_desc)
            metrics.extend(m.strip() for m in found_m)

        if not readme_text:
            if clean_desc:
                bullets.append(clean_desc.rstrip(".") + ".")
            else:
                bullets.append(f"Desenvolvimento e arquitetura do projeto {title}.")
            return bullets, metrics

        clean_prose = cls._clean_markdown_prose(readme_text)
        for m in metric_pat.findall(clean_prose):
            m_str = m.strip()
            if m_str not in metrics:
                metrics.append(m_str)

        lines = [l.strip() for l in clean_prose.splitlines()]

        def clean_bullet_line(raw: str) -> str:
            s = raw.strip()
            s = re.sub(r"^[-*•◦+\s]+", "", s)
            s = re.sub(r"^\d+[\.\)]\s+", "", s)
            s = s.replace("**", "").replace("__", "").replace("`", "")
            s = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", s)
            s = re.sub(r"\s+([,.:;])", r"\1", s)
            s = re.sub(r"\s{2,}", " ", s).strip()
            return s

        def get_metric_dimension(text: str) -> str:
            t = text.lower()
            if any(k in t for k in ["hit rate", "cache hit", "accuracy", "precision", "recall"]):
                return "hit_rate"
            if any(k in t for k in ["throughput", "capacity", "qps", "tps", "iops", "ops/s", "queries/s", "pages/s", "req/s", "speedup", "line-rate", "line rate"]):
                return "throughput"
            if any(k in t for k in ["latency", "rtt", "response time", "round-trip"]):
                return "latency"
            if any(k in t for k in ["cpu", "memory", "ram", "footprint", "efficiency", "softirq", "power", "bandwidth"]):
                return "resource"
            return "other"

        sec_type = "intro"
        overview_lines: List[str] = []
        arch_bullets: List[str] = []
        feature_bullets: List[str] = []
        section_metric_bullets: Dict[str, List[str]] = {}
        current_sec_key = "general"

        for raw_line in lines:
            stripped = raw_line.strip()
            if not stripped:
                continue

            is_heading = False
            h_text = ""
            if stripped.startswith("#"):
                is_heading = True
                h_text = stripped.lstrip("# ").lower()
            elif re.match(r"^\d+\.\s+[A-Za-z]", stripped) and not stripped.endswith((".", "!", "?", ":")):
                is_heading = True
                h_text = stripped.lower()
            elif len(stripped) < 60 and not stripped.endswith((".", "!", "?", ":", ",")) and not any(c in stripped for c in ["—", "-", ":"]):
                if any(k in stripped.lower() for k in ["architecture", "features", "benchmarks", "evaluation", "results", "overview", "design"]):
                    is_heading = True
                    h_text = stripped.lower()

            if is_heading:
                if any(k in h_text for k in ["benchmark", "performance", "result", "evaluation", "desempenho", "avaliação", "metric"]):
                    sec_type = "benchmark"
                    current_sec_key = h_text[:35]
                elif any(k in h_text for k in ["architecture", "arquitetura", "design", "component", "layer", "internal", "structure"]):
                    sec_type = "architecture"
                elif any(k in h_text for k in ["feature", "recurso", "highlight", "capability"]):
                    sec_type = "features"
                else:
                    sec_type = "other"
                continue

            # Incomplete lead-in sentences ending in colon are section context, never bullets
            if stripped.endswith(":"):
                s_lower = stripped.lower()
                if any(k in s_lower for k in ["architecture", "arquitetura", "layer", "camada", "structure", "component"]):
                    sec_type = "architecture"
                elif any(k in s_lower for k in ["benchmark", "result", "evaluation", "desempenho", "avaliação"]):
                    sec_type = "benchmark"
                    current_sec_key = s_lower[:35]
                continue

            cleaned_l = clean_bullet_line(stripped)
            if len(cleaned_l) < 18:
                continue

            is_item = bool(re.match(r"^[-*•◦+\d]", raw_line.strip()))
            has_metric = bool(metric_pat.search(cleaned_l))

            if sec_type == "intro" and not is_item and not has_metric:
                overview_lines.append(cleaned_l)
            elif has_metric or (sec_type == "benchmark" and is_item):
                section_metric_bullets.setdefault(current_sec_key, []).append(cleaned_l)
            elif sec_type == "architecture" and is_item:
                arch_bullets.append(cleaned_l)
            elif sec_type == "features" and is_item:
                feature_bullets.append(cleaned_l)
            elif is_item:
                if any(k in cleaned_l.lower() for k in [
                    "engine", "protocol", "pipeline", "distributed", "concurrency",
                    "zero-copy", "bypass", "cache", "hardware", "kernel", "compiler",
                    "async", "queue", "storage", "memory", "stream", "api", "optim"
                ]):
                    feature_bullets.append(cleaned_l)

        selected: List[str] = []
        used_bullets = set()

        # 1. Project Overview / Purpose (clean description or intro)
        clean_d = (repo_desc or "").strip().rstrip(".")
        if clean_d and len(clean_d) > 25:
            selected.append(f"{clean_d}.")
        elif overview_lines:
            combined = " ".join(overview_lines[:2]).strip().rstrip(".")
            if len(combined) > 25:
                selected.append(f"{combined}.")

        # 2. Key Architecture / Design Bullet (from author's README)
        for b in arch_bullets:
            if b not in used_bullets:
                selected.append(b.rstrip(".") + ".")
                used_bullets.add(b)
                break

        # 3 & 4. Diverse Metric / Benchmark Bullets across distinct benchmark sections
        # First round: take top metric from each distinct section to ensure cross-section coverage
        for sec_key, b_list in section_metric_bullets.items():
            sorted_b = sorted(b_list, key=lambda x: (
                0 if get_metric_dimension(x) == "hit_rate" else
                1 if get_metric_dimension(x) == "throughput" else
                2 if get_metric_dimension(x) == "latency" else 3
            ))
            for b in sorted_b:
                if b not in used_bullets and len(selected) < 4:
                    selected.append(b.rstrip(".") + ".")
                    used_bullets.add(b)
                    break

        # Second round: diverse dimensions across remaining bullets
        seen_dimensions = {get_metric_dimension(b) for b in selected}
        for sec_key, b_list in section_metric_bullets.items():
            for b in b_list:
                dim = get_metric_dimension(b)
                if b not in used_bullets and dim not in seen_dimensions and len(selected) < 4:
                    selected.append(b.rstrip(".") + ".")
                    used_bullets.add(b)
                    seen_dimensions.add(dim)

        # Third round: fill with remaining metrics or features
        for sec_key, b_list in section_metric_bullets.items():
            for b in b_list:
                if b not in used_bullets and len(selected) < 4:
                    selected.append(b.rstrip(".") + ".")
                    used_bullets.add(b)

        for b in arch_bullets + feature_bullets:
            if b not in used_bullets and len(selected) < 4:
                selected.append(b.rstrip(".") + ".")
                used_bullets.add(b)

        if not selected:
            selected.append(f"Desenvolvimento e arquitetura do projeto {title}.")

        bullets = selected[:4]
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
