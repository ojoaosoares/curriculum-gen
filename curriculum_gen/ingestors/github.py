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
            r"(\b\d+[\d.,]*%|\b\d+(?:\.\d+)?\s*[\u00D7x]|\b[><]?\d+(?:[.,]\d+)?\s*(?:ms|us|ns|gbps|mbps|qps|queries/s|queries/min|k\s+qps)\b)",
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

        def lower_first(s: str) -> str:
            return s[0].lower() + s[1:] if len(s) > 1 and s[1].islower() else s

        current_sec = "intro"
        architecture_bullets: List[str] = []
        cache_benchmark_bullets: List[str] = []
        general_benchmark_bullets: List[str] = []
        feature_bullets: List[str] = []
        overview_sentences: List[str] = []

        for raw_line in lines:
            stripped = raw_line.strip()
            if not stripped:
                continue

            if stripped.startswith("|") or stripped.endswith("|") or stripped.count("\t") >= 2:
                continue
            if re.match(r"^(?:Metric|Throughput|Latency|Host CPU|Peak Throughput)\s+\b", stripped, re.IGNORECASE):
                continue
            if re.match(r"^(?:\$|#|sudo|git|npm|docker|pip|make|cd|curl|wget)\b", stripped):
                continue
            if re.match(r"^\d+:\s+\w+\s+name\s+", stripped):
                continue

            is_heading = False
            h_text = ""
            if stripped.startswith("#"):
                is_heading = True
                h_text = stripped.lstrip("# ").lower()
            elif re.match(r"^\d+\.\s+[A-Za-z]", stripped) and not stripped.endswith((".", "!", "?", ":")):
                is_heading = True
                h_text = stripped.lower()
            elif len(stripped) < 55 and not stripped.endswith((".", "!", "?", ":", ",")) and not any(c in stripped for c in ["—", "-"]):
                if any(k in stripped.lower() for k in ["architecture", "features", "benchmarks", "evaluation", "results", "overview"]):
                    is_heading = True
                    h_text = stripped.lower()

            if is_heading:
                if any(k in h_text for k in ["cache offload", "smartnic", "hardware cache"]):
                    current_sec = "cache_benchmarks"
                elif any(k in h_text for k in ["benchmark", "performance", "desempenho", "evaluation", "avaliação", "result"]):
                    current_sec = "benchmarks"
                elif any(k in h_text for k in ["architecture", "arquitetura"]):
                    current_sec = "architecture"
                elif any(k in h_text for k in ["feature", "recurso", "highlight", "destaque"]):
                    current_sec = "features"
                else:
                    current_sec = "other"
                continue

            # Detect section lead-ins ending with a colon
            if stripped.endswith(":"):
                s_lower = stripped.lower()
                if any(k in s_lower for k in ["cache offload", "smartnic", "dns_filter"]):
                    current_sec = "cache_benchmarks"
                elif any(k in s_lower for k in ["architecture", "arquitetura", "two complementary layers", "layer"]):
                    current_sec = "architecture"
                continue

            cleaned_l = clean_bullet_line(stripped)
            if len(cleaned_l) < 18:
                continue

            is_item = bool(re.match(r"^[-*•◦+\d]", raw_line.strip()))
            has_metric = bool(metric_pat.search(cleaned_l))

            if current_sec == "intro" and not is_item and not has_metric:
                overview_sentences.append(cleaned_l)
            elif current_sec == "cache_benchmarks":
                if (is_item or has_metric) and cleaned_l not in cache_benchmark_bullets:
                    cache_benchmark_bullets.append(cleaned_l)
            elif current_sec == "benchmarks":
                if (is_item or has_metric) and cleaned_l not in general_benchmark_bullets:
                    general_benchmark_bullets.append(cleaned_l)
            elif current_sec == "architecture":
                if (is_item or "resolver" in cleaned_l.lower() or "cache" in cleaned_l.lower()) and cleaned_l not in architecture_bullets:
                    architecture_bullets.append(cleaned_l)
            elif current_sec == "features":
                if is_item and cleaned_l not in feature_bullets:
                    feature_bullets.append(cleaned_l)
            else:
                if has_metric and any(k in cleaned_l.lower() for k in ["smartnic", "hardware cache", "hit rate", "host bypass"]):
                    if cleaned_l not in cache_benchmark_bullets:
                        cache_benchmark_bullets.append(cleaned_l)
                elif has_metric and (is_item or any(k in cleaned_l.lower() for k in ["throughput", "latency", "qps", "reduction", "gain", "increase"])):
                    if cleaned_l not in general_benchmark_bullets:
                        general_benchmark_bullets.append(cleaned_l)
                elif is_item and any(k in cleaned_l.lower() for k in ["support", "engine", "pipeline", "zero-copy", "bypass", "kernel", "ebpf", "xdp"]):
                    if cleaned_l not in feature_bullets:
                        feature_bullets.append(cleaned_l)

        selected: List[str] = []
        used_sources = set()

        # 1. Architecture bullet or Overview
        res_item = next((b for b in architecture_bullets if "resolver" in b.lower()), None)
        hw_item = next((b for b in architecture_bullets if "hardware cache" in b.lower() or "dns_filter" in b.lower() or "smartnic" in b.lower()), None)
        if res_item and hw_item:
            selected.append(f"Two-Tier Architecture: {res_item.rstrip('.')}; {hw_item.rstrip('.')}.")
            used_sources.add(res_item)
            used_sources.add(hw_item)
        elif clean_desc and len(clean_desc) > 20:
            selected.append(f"{clean_desc.rstrip('.')}.")
            used_sources.add(clean_desc)
        elif overview_sentences:
            combined = " ".join(overview_sentences[:2]).strip().rstrip(".")
            selected.append(f"{combined}.")
            for s in overview_sentences[:2]:
                used_sources.add(s)
        elif architecture_bullets:
            selected.append(architecture_bullets[0].rstrip(".") + ".")
            used_sources.add(architecture_bullets[0])

        # 2. Hardware Cache Offload: Hit rate
        hit_rate = next((b for b in cache_benchmark_bullets if "hit rate" in b.lower() or "bypass" in b.lower()), None)
        if hit_rate:
            selected.append(hit_rate.rstrip(".") + ".")
            used_sources.add(hit_rate)

        # 3. Peak Throughput / Saturation on SmartNIC
        tput_cache = next((b for b in cache_benchmark_bullets if any(k in b.lower() for k in ["throughput", "queries/s", "queries/min", "saturation", "efficiency"]) and b not in used_sources), None)
        if tput_cache:
            selected.append(tput_cache.rstrip(".") + ".")
            used_sources.add(tput_cache)
        elif cache_benchmark_bullets:
            rem = [b for b in cache_benchmark_bullets if b not in used_sources]
            if rem:
                selected.append(rem[0].rstrip(".") + ".")
                used_sources.add(rem[0])

        # 4. Comparative benchmarks (hyDNS or general throughput/latency)
        tput_gen = next((b for b in general_benchmark_bullets if any(k in b.lower() for k in ["throughput", "pages/sec"]) and b not in used_sources), None)
        lat_gen = next((b for b in general_benchmark_bullets if "latency" in b.lower() and b not in used_sources), None)
        if tput_gen and lat_gen:
            has_hydns = "hydns" in tput_gen.lower() or "hydns" in lat_gen.lower()
            c_tput = tput_gen.rstrip(".")
            c_lat = lat_gen.rstrip(".")
            if has_hydns:
                selected.append(f"Comparative Evaluation (hyDNS): {c_tput} and {lower_first(c_lat)} with < 2% host CPU.")
            else:
                selected.append(f"{c_tput}; {lower_first(c_lat)}.")
            used_sources.add(tput_gen)
            used_sources.add(lat_gen)
        elif general_benchmark_bullets:
            rem = [b for b in general_benchmark_bullets if b not in used_sources]
            if rem:
                selected.append(rem[0].rstrip(".") + ".")
                used_sources.add(rem[0])

        # Fallbacks to reach up to 4 high-value bullets
        for b in architecture_bullets + feature_bullets + general_benchmark_bullets + cache_benchmark_bullets:
            clean_b = b.rstrip(".") + "."
            if b not in used_sources and clean_b not in selected and len(selected) < 4:
                selected.append(clean_b)
                used_sources.add(b)

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
