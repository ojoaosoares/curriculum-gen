import re
import xml.etree.ElementTree as ET
from typing import Optional, Dict, Any
import requests

from curriculum_gen.models import AwardOrLeadershipItem


class AcademicIngestor:
    """
    Fetches academic publication metadata and abstracts from ArXiv, DOIs,
    or publication URLs to highlight research contributions and papers.
    """

    @staticmethod
    def fetch_arxiv_abstract(arxiv_id_or_url: str) -> Optional[Dict[str, Any]]:
        """
        Extract paper title, publication year, and abstract from ArXiv ID or URL.
        Example: '2301.12345' or 'https://arxiv.org/abs/2301.12345'
        """
        match = re.search(r"(\d{4}\.\d{4,5}(?:v\d+)?)", arxiv_id_or_url)
        if not match:
            return None
        arxiv_id = match.group(1)

        api_url = f"http://export.arxiv.org/api/query?id_list={arxiv_id}"
        try:
            resp = requests.get(api_url, timeout=10)
            if resp.status_code == 200:
                root = ET.fromstring(resp.content)
                ns = {"atom": "http://www.w3.org/2005/Atom"}
                entry = root.find("atom:entry", ns)
                if entry is not None:
                    title_elem = entry.find("atom:title", ns)
                    summary_elem = entry.find("atom:summary", ns)
                    published_elem = entry.find("atom:published", ns)

                    title = " ".join(title_elem.text.split()) if title_elem is not None else ""
                    abstract = " ".join(summary_elem.text.split()) if summary_elem is not None else ""
                    published = published_elem.text if published_elem is not None else ""
                    year = published[:4] if published else ""

                    return {
                        "title": title,
                        "abstract": abstract,
                        "year": year,
                        "url": f"https://arxiv.org/abs/{arxiv_id}",
                    }
        except Exception:
            pass
        return None

    @staticmethod
    def fetch_doi_metadata(doi_or_url: str) -> Optional[Dict[str, Any]]:
        """
        Fetch title, journal/conference, and abstract via CrossRef API.
        """
        # Clean DOI
        doi = re.sub(r"^https?://(dx\.)?doi\.org/", "", doi_or_url.strip())
        api_url = f"https://api.crossref.org/works/{doi}"
        headers = {"User-Agent": "CurriculumGen/0.1 (mailto:research@curriculum-gen.org)"}
        try:
            resp = requests.get(api_url, headers=headers, timeout=10)
            if resp.status_code == 200:
                data = resp.json().get("message", {})
                title = data.get("title", [""])[0]
                abstract = data.get("abstract", "")
                # Clean JATS XML tags in abstract if any
                clean_abstract = re.sub(r"<[^>]+>", "", abstract).strip()
                published = data.get("created", {}).get("date-time", "")
                year = published[:4] if published else ""
                container = data.get("container-title", [""])[0]

                return {
                    "title": title,
                    "abstract": clean_abstract,
                    "year": year,
                    "venue": container,
                    "url": f"https://doi.org/{doi}",
                }
        except Exception:
            pass
        return None

    @classmethod
    def create_publication_item(
        cls,
        title: str,
        venue: str,
        year: str,
        abstract: Optional[str] = None,
        url: Optional[str] = None,
        tags: Optional[list] = None,
    ) -> AwardOrLeadershipItem:
        """
        Builds a resume entry for a paper or academic contribution.
        """
        desc = f"Published at \\textbf{{{venue}}}. {abstract[:200] + '...' if abstract else ''}".strip()
        return AwardOrLeadershipItem(
            title=title,
            organization=venue,
            period_or_date=year,
            description=desc,
            url=url,
            url_label="Paper",
            paper_abstract=abstract,
            tags=tags or ["Research", "Paper", "Publication"],
            category="research",
        )
