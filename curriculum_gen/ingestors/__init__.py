"""
Ingestor modules for external sources (GitHub repositories, Academic papers, Lattes).
"""

from curriculum_gen.ingestors.github import GitHubIngestor
from curriculum_gen.ingestors.academic import AcademicIngestor

__all__ = ["GitHubIngestor", "AcademicIngestor"]
