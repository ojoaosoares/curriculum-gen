import re
from pathlib import Path
from typing import Dict, Any, List, Optional
from jinja2 import Environment, FileSystemLoader

from curriculum_gen.models import (
    UserProfile,
    ContactInfo,
    ExperienceItem,
    ProjectItem,
    AwardOrLeadershipItem,
)

LABELS_BY_LANG: Dict[str, Dict[str, str]] = {
    "en": {
        "education": "Education",
        "experience": "Experience",
        "awards_and_leadership": "Awards & Leadership",
        "projects": "Projects",
        "skills": "Skills",
        "last_updated_prefix": "Last updated in",
    },
    "pt": {
        "education": "Educação",
        "experience": "Experiência",
        "awards_and_leadership": "Prêmios & Liderança",
        "projects": "Projetos",
        "skills": "Habilidades Técnicas",
        "last_updated_prefix": "Atualizado em",
    },
}


def sanitize_latex(text: str) -> str:
    """
    Sanitize text for LaTeX while preserving intentional formatting
    such as \\textbf{...}, \\href{...}{...}, and markdown **bold**.
    """
    if not text:
        return ""

    # Convert markdown **bold** to \textbf{bold}
    text = re.sub(r"\*\*(.+?)\*\*", r"\\textbf{\1}", text)
    # Convert markdown *italic* to \textit{italic}
    text = re.sub(r"(?<!\*)\*([^*]+?)\*(?!\*)", r"\\textit{\1}", text)
    # Convert markdown [label](url) to \href{url}{label}
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\\href{\2}{\1}", text)

    # Protect existing LaTeX commands by placeholder tokens
    tokens: List[str] = []

    def replace_token(match):
        idx = len(tokens)
        tokens.append(match.group(0))
        return f"LATEXTOKENXYZ{idx}ENDTOKEN"

    # Match commands like \href{arg1}{arg2}, \textbf{...}, \textit{...}, etc.
    latex_cmd_pattern = re.compile(
        r"\\href\{[^}]*\}\{[^}]*\}|\\(textbf|textit|color|footnotesize|small|large|bfseries|underline|mbox)\{[^}]*\}|\\[a-zA-Z]+"
    )
    # Perform multiple passes to catch nested commands
    for _ in range(3):
        text = latex_cmd_pattern.sub(replace_token, text)

    # Now escape characters dangerous to LaTeX: & % _ # $
    text = text.replace("&", r"\&")
    text = text.replace("%", r"\%")
    text = text.replace("_", r"\_")
    text = text.replace("#", r"\#")
    text = text.replace("$", r"\$")

    # Restore tokens in reverse order
    for idx in range(len(tokens) - 1, -1, -1):
        text = text.replace(f"LATEXTOKENXYZ{idx}ENDTOKEN", tokens[idx])

    return text


def _make_mbox(inner: str) -> str:
    return f"\\mbox{{{inner}}}"


def _make_link_mbox(url: str, icon_cmd: str, label: str) -> str:
    # Generates: \mbox{\hrefWithoutArrow{url}{{\color{black}{icon}\hspace*{0.13cm}label}}}
    return f"\\mbox{{\\hrefWithoutArrow{{{url}}}{{{{\\color{{black}}{icon_cmd}\\hspace*{{0.13cm}}{label}}}}}}}"


def build_contact_elements(personal: ContactInfo) -> List[str]:
    r"""
    Build the list of \mbox{} elements for the header according to
    the user's visible_items selection and order.
    """
    elements = []
    for item_key in personal.visible_items:
        key = item_key.lower().strip()
        if key == "location" and personal.location:
            loc = sanitize_latex(personal.location)
            elements.append(_make_mbox(f"{{\\color{{black}}\\footnotesize\\faMapMarker*}}\\hspace*{{0.13cm}}{loc}"))
        elif key == "email" and personal.email:
            email = personal.email.strip()
            elements.append(_make_link_mbox(f"mailto:{email}", "{\\footnotesize\\faEnvelope[regular]}", email))
        elif key == "phone" and personal.phone:
            phone = personal.phone.strip()
            tel_clean = re.sub(r"[^\d+]", "", phone)
            elements.append(_make_link_mbox(f"tel:{tel_clean}", "{\\footnotesize\\faPhone*}", phone))
        elif key == "linkedin" and personal.linkedin:
            link = personal.linkedin.strip()
            handle = link
            if "linkedin.com/in/" in link:
                handle = link.split("linkedin.com/in/")[-1].strip("/")
            elif link.startswith("https://") or link.startswith("http://"):
                handle = link.rstrip("/").split("/")[-1]
            full_url = link if link.startswith("http") else f"https://www.linkedin.com/in/{link}/"
            elements.append(_make_link_mbox(full_url, "{\\footnotesize\\faLinkedinIn}", handle))
        elif key == "github" and personal.github:
            link = personal.github.strip()
            handle = link
            if "github.com/" in link:
                handle = link.split("github.com/")[-1].strip("/")
            elif link.startswith("https://") or link.startswith("http://"):
                handle = link.rstrip("/").split("/")[-1]
            full_url = link if link.startswith("http") else f"https://github.com/{link}"
            elements.append(_make_link_mbox(full_url, "{\\footnotesize\\faGithub}", handle))
        elif key == "lattes" and personal.lattes:
            link = personal.lattes.strip()
            full_url = link if link.startswith("http") else f"https://lattes.cnpq.br/{link}"
            elements.append(_make_link_mbox(full_url, "{\\footnotesize}", "lattes"))
        elif key == "website" and personal.website:
            link = personal.website.strip()
            full_url = link if link.startswith("http") else f"https://{link}"
            elements.append(_make_link_mbox(full_url, "{\\footnotesize\\faGlobe}", "portfolio"))

    # Also append custom links if any
    for custom in personal.custom_links:
        icon_cmd = f"{{\\footnotesize\\{custom.icon}}}" if custom.icon else "{\\footnotesize\\faExternalLinkAlt}"
        elements.append(_make_link_mbox(custom.url, icon_cmd, custom.label))

    return elements


class TemplateEngine:
    def __init__(self, template_dir: Optional[Path] = None):
        if template_dir is None:
            template_dir = Path(__file__).parent / "templates"
        self.env = Environment(
            loader=FileSystemLoader(str(template_dir)),
            block_start_string="<%",
            block_end_string="%>",
            variable_start_string="<<",
            variable_end_string=">>",
            comment_start_string="<#",
            comment_end_string="#>",
            autoescape=False,
            trim_blocks=True,
            lstrip_blocks=True,
        )
        self.template = self.env.get_template("cv_template.tex.j2")

    def render(
        self,
        profile: UserProfile,
        selected_experiences: Optional[List[ExperienceItem]] = None,
        selected_projects: Optional[List[ProjectItem]] = None,
        selected_awards: Optional[List[AwardOrLeadershipItem]] = None,
        selected_skills: Optional[Dict[str, str]] = None,
        language: str = "en",
        layout_overrides: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Renders the full LaTeX document with selected items and language.
        """
        lang = "pt" if language.lower().startswith("pt") else "en"
        labels = LABELS_BY_LANG[lang]

        contact_elements = build_contact_elements(profile.personal)

        experiences = selected_experiences if selected_experiences is not None else profile.experiences
        projects = selected_projects if selected_projects is not None else profile.projects
        awards = selected_awards if selected_awards is not None else profile.awards_and_leadership

        # Format experiences
        formatted_exps = []
        for exp in experiences:
            bullets = exp.formatted_bullets if exp.formatted_bullets else exp.raw_bullets
            formatted_exps.append(
                {
                    "period": sanitize_latex(exp.period),
                    "role": sanitize_latex(exp.role),
                    "company": sanitize_latex(exp.company),
                    "company_url": exp.company_url,
                    "bullets": [sanitize_latex(b) for b in bullets],
                }
            )

        # Format projects
        formatted_projs = []
        for proj in projects:
            bullets = proj.formatted_bullets if proj.formatted_bullets else proj.raw_bullets
            formatted_projs.append(
                {
                    "title": sanitize_latex(proj.title),
                    "subtitle": sanitize_latex(proj.subtitle or ""),
                    "url": proj.url,
                    "url_label": sanitize_latex(proj.url_label or "GitHub"),
                    "period": sanitize_latex(proj.period or ""),
                    "bullets": [sanitize_latex(b) for b in bullets],
                }
            )

        # Format awards & leadership
        formatted_awards = []
        for aw in awards:
            formatted_awards.append(
                {
                    "title": sanitize_latex(aw.title),
                    "period_or_date": sanitize_latex(aw.period_or_date),
                    "description": sanitize_latex(aw.description),
                }
            )

        # Format education
        formatted_edu = []
        for edu in profile.education:
            formatted_edu.append(
                {
                    "institution": sanitize_latex(edu.institution),
                    "degree": sanitize_latex(edu.degree),
                    "period": sanitize_latex(edu.period),
                    "notes": sanitize_latex(edu.notes or ""),
                }
            )

        # Format skills
        raw_skills = selected_skills if selected_skills is not None else profile.skills
        formatted_skills = {}
        for k, v in raw_skills.items():
            cat_name = sanitize_latex(k)
            if isinstance(v, list):
                val = ", ".join(sanitize_latex(item) for item in v)
            else:
                val = sanitize_latex(str(v))
            formatted_skills[cat_name] = val

        # Last updated note
        last_updated = profile.last_updated
        if last_updated:
            last_updated = sanitize_latex(last_updated)

        context = {
            "personal": profile.personal,
            "contact_elements": contact_elements,
            "labels": labels,
            "education": formatted_edu,
            "experiences": formatted_exps,
            "awards_and_leadership": formatted_awards,
            "projects": formatted_projs,
            "skills": formatted_skills,
            "last_updated": last_updated,
            "primary_color_rgb": profile.primary_color_rgb,
        }

        # Apply any layout tweaks (margins, spacing)
        if layout_overrides:
            context.update(layout_overrides)

        return self.template.render(**context)
