from typing import List, Optional, Dict, Union, Any
from pydantic import BaseModel, Field


class ContactLink(BaseModel):
    label: str
    url: str
    icon: Optional[str] = None  # e.g., 'faGlobe', 'faCode'


class ContactInfo(BaseModel):
    name: str = ""
    location: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    lattes: Optional[str] = None
    website: Optional[str] = None
    custom_links: List[ContactLink] = Field(default_factory=list)
    # Allows user to specify which contact items to display and in what order
    # Default order: location, email, phone, linkedin, github, lattes
    visible_items: List[Union[str, Dict[str, Any]]] = Field(
        default_factory=lambda: [
            "location",
            "email",
            "phone",
            "linkedin",
            "github",
            "lattes",
        ]
    )


class EducationItem(BaseModel):
    institution: str
    degree: Optional[str] = ""
    period: Optional[str] = ""
    location: Optional[str] = None
    notes: Optional[str] = None


class ExperienceItem(BaseModel):
    id: Optional[str] = None
    role: str
    company: str
    company_url: Optional[str] = None
    period: Optional[str] = ""
    location: Optional[str] = None
    start_year: Optional[int] = None
    end_year: Optional[int] = None
    is_current: bool = False
    tags: List[str] = Field(default_factory=list)
    category: Optional[str] = None  # e.g., 'systems', 'web', 'research', 'mobile'
    raw_bullets: List[str] = Field(default_factory=list)
    formatted_bullets: List[str] = Field(default_factory=list)
    metrics: List[str] = Field(default_factory=list)
    score: float = 0.0


class ProjectItem(BaseModel):
    id: Optional[str] = None
    title: str
    subtitle: Optional[str] = None  # Tech stack overview, e.g. "Python, multi-threading"
    url: Optional[str] = None
    url_label: str = "GitHub"
    period: Optional[str] = None
    start_year: Optional[int] = None
    tags: List[str] = Field(default_factory=list)
    category: Optional[str] = None
    raw_bullets: List[str] = Field(default_factory=list)
    formatted_bullets: List[str] = Field(default_factory=list)
    metrics: List[str] = Field(default_factory=list)
    github_repo: Optional[str] = None  # e.g., "ojoaosoares/web-crawler"
    readme_content: Optional[str] = None
    score: float = 0.0


class AwardOrLeadershipItem(BaseModel):
    id: Optional[str] = None
    title: str
    organization: Optional[str] = None
    period_or_date: Optional[str] = "N/A"
    description: Optional[str] = ""
    url: Optional[str] = None
    url_label: Optional[str] = None
    paper_abstract: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    category: Optional[str] = None
    score: float = 0.0


class UserProfile(BaseModel):
    personal: ContactInfo = Field(default_factory=ContactInfo)
    education: List[EducationItem] = Field(default_factory=list)
    experiences: List[ExperienceItem] = Field(default_factory=list)
    awards_and_leadership: List[AwardOrLeadershipItem] = Field(default_factory=list)
    projects: List[ProjectItem] = Field(default_factory=list)
    skills: Dict[str, Union[List[str], str]] = Field(default_factory=dict)
    last_updated: Optional[str] = None  # e.g. "Last updated in August 2026"
    primary_color_rgb: str = "0, 79, 144"  # Default clean deep blue

    @classmethod
    def empty(cls) -> "UserProfile":
        return cls()


class JobContext(BaseModel):
    target_role: Optional[str] = None
    target_company: Optional[str] = None
    job_description: str = ""
    keywords: List[str] = Field(default_factory=list)
    language: str = "en"  # "en" or "pt"
    # Page budget limits to guarantee strictly 1 page
    max_experiences: int = 2
    max_projects: int = 2
    max_awards: int = 2
    max_bullets_per_experience: int = 4
    max_bullets_per_project: int = 3
    # Scoring weights
    weight_relevance: float = 0.50
    weight_recency: float = 0.25
    weight_diversity: float = 0.15
    weight_impact: float = 0.10


class GeneratedResume(BaseModel):
    latex_code: str
    selected_experiences: List[ExperienceItem]
    selected_projects: List[ProjectItem]
    selected_awards: List[AwardOrLeadershipItem]
    pdf_bytes: Optional[bytes] = None
    page_count: Optional[int] = None
