import re
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
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
        "awards_and_leadership": "Awards \\& Leadership",
        "projects": "Projects",
        "skills": "Skills",
        "last_updated_prefix": "Last updated in",
    },
    "pt": {
        "education": "Educação",
        "experience": "Experiência",
        "awards_and_leadership": "Prêmios \\& Liderança",
        "projects": "Projetos",
        "skills": "Habilidades Técnicas",
        "last_updated_prefix": "Atualizado em",
    },
}


def sanitize_latex(text: str) -> str:
    """
    Sanitize text for LaTeX while preserving intentional formatting
    such as \\textbf{...}, \\textit{...}, \\href{...}{...}, and markdown **bold**.
    Also decodes unicode escapes, converts HTML tags, and repairs mangled commands.
    """
    if not text:
        return ""

    # 1. Decode literal \\uXXXX sequences (e.g., \\u003c -> <, \\u00e7 -> ç)
    try:
        text = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), text)
    except Exception:
        pass

    # 2. Convert HTML tags to LaTeX
    text = re.sub(r"<(?:b|strong)\b[^>]*>(.*?)(?:</+<?(?:b|strong)>|</(?:b|strong)>)", r"\\textbf{\1}", text, flags=re.IGNORECASE)
    text = re.sub(r"<(?:i|em)\b[^>]*>(.*?)(?:</+<?(?:i|em)>|</(?:i|em)>)", r"\\textit{\1}", text, flags=re.IGNORECASE)
    text = re.sub(r"</?[a-zA-Z][^>]*>", "", text)

    # 3. Repair mangled LaTeX commands caused by JSON tab/escape decoding
    text = re.sub(r"(\t|(?<=\s)|^)(?:ext|\\text)(bf|it)\{([^}]+)\}", r"\\text\2{\3}", text)
    text = re.sub(r"(\t|(?<=\s)|^)ext(bf|it)([\w/-]+)", r"\\text\2{\3}", text)

    # 4. Convert markdown formatting
    text = re.sub(r"\*\*(.+?)\*\*", r"\\textbf{\1}", text)
    text = re.sub(r"(?<!\*)\*([^*]+?)\*(?!\*)", r"\\textit{\1}", text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\\href{\2}{\1}", text)

    # 5. Protect existing LaTeX commands and already-escaped symbols by placeholder tokens
    tokens: List[str] = []

    def replace_token(match):
        idx = len(tokens)
        tokens.append(match.group(0))
        return f"LATEXTOKENXYZ{idx}ENDTOKEN"

    # Match commands like \href{arg1}{arg2}, \textbf{...}, \textit{...}, and escaped symbols \%, \_, \&, \$, \#
    latex_cmd_pattern = re.compile(
        r"\\href\{[^}]*\}\{[^}]*\}|\\(textbf|textit|color|footnotesize|small|large|bfseries|underline|mbox)\{[^}]*\}|\\[a-zA-Z]+|\\[%_&#$]"
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


MONTH_MAP_PT = {
    "janeiro": "Jan", "fevereiro": "Fev", "março": "Mar", "marco": "Mar",
    "abril": "Abr", "maio": "Mai", "junho": "Jun", "julho": "Jul",
    "agosto": "Ago", "setembro": "Set", "outubro": "Out", "novembro": "Nov", "dezembro": "Dez",
    "jan": "Jan", "fev": "Fev", "feb": "Fev", "mar": "Mar", "apr": "Abr", "abr": "Abr",
    "may": "Mai", "mai": "Mai", "jun": "Jun", "jul": "Jul", "aug": "Ago", "ago": "Ago",
    "sep": "Set", "set": "Set", "oct": "Out", "out": "Out", "nov": "Nov", "dec": "Dez", "dez": "Dez"
}

MONTH_MAP_EN = {
    "janeiro": "Jan", "fevereiro": "Feb", "março": "Mar", "marco": "Mar",
    "abril": "Apr", "maio": "May", "junho": "Jun", "julho": "Jul",
    "agosto": "Aug", "setembro": "Sep", "outubro": "Oct", "novembro": "Nov", "dezembro": "Dec",
    "jan": "Jan", "fev": "Feb", "feb": "Feb", "mar": "Mar", "apr": "Apr", "abr": "Apr",
    "may": "May", "mai": "May", "jun": "Jun", "jul": "Jul", "aug": "Aug", "ago": "Aug",
    "sep": "Sep", "set": "Sep", "oct": "Oct", "out": "Oct", "nov": "Nov", "dec": "Dec", "dez": "Dec"
}


def compact_period(period: Optional[str], language: str = "pt") -> str:
    """
    Compacts verbose period strings (especially from LinkedIn PDFs) to strictly fit
    within single-line CV date columns (e.g. 'setembro de 2025 - Present (1 ano 1 mês)' -> 'Set 2025 – Presente').
    """
    if not period or not str(period).strip():
        return ""
    text = str(period).strip()

    # 1. Remove parenthetical durations and employment type labels
    text = re.sub(
        r"\s*\([^)]*(?:ano|mes|mês|year|yr|mo|present|atual|tempo|integral|parcial|expected|previsão)[^)]*\)",
        "",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"\s*\(\s*\d+\s*(?:anos?|meses|mês|years?|yrs?|mos?)\b[^)]*\)", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*\((?:Expected|Previsão)\)", "", text, flags=re.IGNORECASE)

    # 2. Normalize dashes to en-dash
    text = re.sub(r"\s*[-–—]\s*", " – ", text).strip()

    is_pt = language.lower().startswith("pt")
    month_map = MONTH_MAP_PT if is_pt else MONTH_MAP_EN
    present_str = "Presente" if is_pt else "Present"

    # Normalize Present / Presente / Atual / momento
    text = re.sub(r"\b(Presente|Present|Atual|momento|current)\b", present_str, text, flags=re.IGNORECASE)

    # 3. Compact 'Mês de YYYY' -> 'Mês YYYY'
    for month_full, month_abbr in month_map.items():
        text = re.sub(rf"\b{month_full}\s*(?:de\s*|/\s*)?(\d{{4}})\b", rf"{month_abbr} \1", text, flags=re.IGNORECASE)
        text = re.sub(rf"\b{month_full}\b", month_abbr, text, flags=re.IGNORECASE)

    # Clean double spaces
    text = re.sub(r"\s+", " ", text).strip()
    return text


FAKE_AWARD_DESCRIPTIONS = {
    "certificação técnica ou participação em simpósio",
    "certificacao tecnica ou participacao em simposio",
    "reconhecimento acadêmico ou premiação profissional documentada no currículo",
    "reconhecimento academico ou premiacao profissional documentada no curriculo",
}


def clean_award_fields(
    title: str,
    period_or_date: Optional[str],
    description: Optional[str],
    language: str = "pt",
) -> Tuple[str, str, str]:
    """
    Cleans awards/certifications by:
    - Stripping fake hardcoded heuristic descriptions
    - Avoiding duplicated dates between title and date column (e.g. 'UFMG 2025' and '2025' -> 'UFMG' and '2025')
    - Extracting year from title if date is missing
    - Compacting dates
    """
    t = (title or "").strip()
    d = (period_or_date or "").strip()
    desc = (description or "").strip()

    # Suppress fake hardcoded heuristic descriptions
    if desc.lower() in FAKE_AWARD_DESCRIPTIONS:
        desc = ""

    # Normalize invalid dates
    if d.lower() in ["n/a", "none", "null"]:
        d = ""

    # If title ends with the date, remove the duplicate date from title to avoid '2025 2025'
    if d and re.search(rf"\b{re.escape(d)}\b\s*$", t):
        t = re.sub(rf"\b{re.escape(d)}\b\s*$", "", t).strip()

    # If date is empty or 'Certificação', but title ends with a 4-digit year, extract that year
    year_match = re.search(r"\b(19\d\d|20\d\d)\b\s*$", t)
    if year_match and (not d or d.lower() in ["certificação", "certificacao", "certificate", "certification"]):
        d = year_match.group(1)
        t = re.sub(rf"\b{re.escape(d)}\b\s*$", "", t).strip()

    # If date has parenthetical info or long text, compact it
    d = compact_period(d, language=language)

    # Clean trailing punctuation from title (e.g. trailing dash or colon)
    t = re.sub(r"[\s\-\–\—\:]+$", "", t).strip()

    return t, d, desc


def _make_mbox(inner: str) -> str:
    return f"\\mbox{{{inner}}}"


def _make_link_mbox(url: str, icon_cmd: str, label: str) -> str:
    return f"\\mbox{{\\hrefWithoutArrow{{{url}}}{{{{\\color{{black}}{icon_cmd}\\hspace*{{0.13cm}}{label}}}}}}}"


def build_contact_elements(personal: ContactInfo) -> List[str]:
    r"""
    Build the list of \mbox{} elements for the header according to
    the user's visible_items selection and order.
    Uses \faATS{} so fontawesome icons don't produce garbled characters
    when parsed by ATS or copied from the PDF.
    """
    elements = []
    for item_raw in personal.visible_items:
        if isinstance(item_raw, dict):
            item_key = str(item_raw.get("key") or item_raw.get("id") or "").strip()
        else:
            item_key = str(item_raw).strip()
        key = item_key.lower().strip()
        if key == "location" and personal.location:
            loc = sanitize_latex(personal.location)
            elements.append(_make_mbox(f"{{\\color{{black}}\\footnotesize\\faATS{{\\faMapMarker*}}}}\\hspace*{{0.13cm}}{loc}"))
        elif key == "email" and personal.email:
            email = personal.email.strip()
            elements.append(_make_link_mbox(f"mailto:{email}", "{\\footnotesize\\faATS{\\faEnvelope[regular]}}", email))
        elif key == "phone" and personal.phone:
            phone = personal.phone.strip()
            tel_clean = re.sub(r"[^\d+]", "", phone)
            elements.append(_make_link_mbox(f"tel:{tel_clean}", "{\\footnotesize\\faATS{\\faPhone*}}", phone))
        elif key == "linkedin" and personal.linkedin:
            link = personal.linkedin.strip()
            handle = link
            if "linkedin.com/in/" in link:
                handle = link.split("linkedin.com/in/")[-1].strip("/")
            elif link.startswith("https://") or link.startswith("http://"):
                handle = link.rstrip("/").split("/")[-1]
            full_url = link if link.startswith("http") else f"https://www.linkedin.com/in/{link}/"
            elements.append(_make_link_mbox(full_url, "{\\footnotesize\\faATS{\\faLinkedinIn}}", handle))
        elif key == "github" and personal.github:
            link = personal.github.strip()
            handle = link
            if "github.com/" in link:
                handle = link.split("github.com/")[-1].strip("/")
            elif link.startswith("https://") or link.startswith("http://"):
                handle = link.rstrip("/").split("/")[-1]
            full_url = link if link.startswith("http") else f"https://github.com/{link}"
            elements.append(_make_link_mbox(full_url, "{\\footnotesize\\faATS{\\faGithub}}", handle))
        elif key == "lattes" and personal.lattes:
            link = personal.lattes.strip()
            full_url = link if link.startswith("http") else f"https://lattes.cnpq.br/{link}"
            elements.append(_make_link_mbox(full_url, "{\\footnotesize\\faATS{\\faGraduationCap}}", "lattes"))
        elif key == "website" and personal.website:
            link = personal.website.strip()
            full_url = link if link.startswith("http") else f"https://{link}"
            elements.append(_make_link_mbox(full_url, "{\\footnotesize\\faATS{\\faGlobe}}", "portfolio"))

    # Also append custom links if any
    for custom in personal.custom_links:
        icon_cmd = f"{{\\footnotesize\\faATS{{\\{custom.icon}}}}}" if custom.icon else "{\\footnotesize\\faATS{\\faExternalLinkAlt}}"
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

        is_pt = (lang == "pt")

        def translate_pt_term(text: str) -> str:
            if not is_pt or not text:
                return text
            replacements = [
                (r"\bPresent\b", "Presente"),
                (r"\(Expected\)", "(Previsão)"),
                (r"\bExpected\b", "Previsão"),
                (r"\bResearch Fellow \(Scholarship\)\b", "Pesquisador Bolsista"),
                (r"\bFull Stack & Mobile Developer Intern\b", "Estagiário Full Stack & Mobile"),
                (r"\bSoftware Engineering Intern\b", "Estagiário de Engenharia de Software"),
                (r"\bDeveloper Intern\b", "Estagiário de Desenvolvimento"),
                (r"\bTeaching Assistant \(Scholarship\)\b", "Monitoria Acadêmica (Bolsista)"),
                (r"\bBachelor of Science in Information Systems\b", "Bacharelado em Sistemas de Informação"),
                (r"\bBachelor of Science in Computer Science\b", "Bacharelado em Ciência da Computação"),
                (r"\bBachelor of Science\b", "Bacharelado"),
                (r"\bAcademic Relevance Award\b", "Prêmio de Relevância Acadêmica"),
                (r"\bKnowledge Week\b", "Semana do Conhecimento"),
                (r"\bAnalytic Geometry and Linear Algebra\b", "Geometria Analítica e Álgebra Linear"),
                (r"\bMentored students from the whole UFMG university, providing technical guidance on complex algebraic concepts.\b", "Orientou alunos de toda a universidade, prestando suporte técnico em conceitos algébricos complexos."),
                (r"\bDistinguished for outstanding technical contribution to networking systems with the\b", "Destaque por contribuição técnica relevante para sistemas de redes com o"),
                (r"\bproject\.\b", "projeto."),
            ]
            for pat, rep in replacements:
                text = re.sub(pat, rep, text, flags=re.IGNORECASE)
            return text

        # Format experiences
        formatted_exps = []
        for exp in experiences:
            bullets = exp.formatted_bullets if exp.formatted_bullets else exp.raw_bullets
            period_str = compact_period(translate_pt_term(exp.period), language=lang)
            role_str = translate_pt_term(exp.role)
            formatted_exps.append(
                {
                    "period": sanitize_latex(period_str),
                    "role": sanitize_latex(role_str),
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
                    "period": sanitize_latex(compact_period(translate_pt_term(proj.period or ""), language=lang)),
                    "bullets": [sanitize_latex(b) for b in bullets],
                }
            )

        # Format awards & leadership
        formatted_awards = []
        for aw in awards:
            title_clean, date_clean, desc_clean = clean_award_fields(
                title=aw.title,
                period_or_date=aw.period_or_date,
                description=aw.description,
                language=lang,
            )
            formatted_awards.append(
                {
                    "title": sanitize_latex(translate_pt_term(title_clean)),
                    "period_or_date": sanitize_latex(translate_pt_term(date_clean)),
                    "description": sanitize_latex(translate_pt_term(desc_clean)),
                }
            )

        # Format education
        formatted_edu = []
        for edu in profile.education:
            formatted_edu.append(
                {
                    "institution": sanitize_latex(edu.institution),
                    "degree": sanitize_latex(translate_pt_term(edu.degree)),
                    "period": sanitize_latex(compact_period(translate_pt_term(edu.period), language=lang)),
                    "notes": sanitize_latex(translate_pt_term(edu.notes or "")),
                }
            )

        # Format skills
        raw_skills = selected_skills if selected_skills is not None else profile.skills
        skill_name_translations = {
            "Programming Languages": "Linguagens de Programação",
            "Technologies": "Tecnologias",
            "Languages Spoken": "Idiomas",
        }
        formatted_skills = {}
        for k, v in raw_skills.items():
            cat_name = skill_name_translations.get(k, k) if is_pt else k
            cat_name = sanitize_latex(cat_name)
            if isinstance(v, list):
                val = ", ".join(sanitize_latex(item) for item in v)
            else:
                val_str = str(v)
                if is_pt:
                    val_str = (
                        val_str.replace("English (Fluent)", "Inglês (Fluente)")
                        .replace("Portuguese (Native)", "Português (Nativo)")
                        .replace("Japanese (Advanced)", "Japonês (Avançado)")
                        .replace("Spanish (Intermediate)", "Espanhol (Intermediário)")
                    )
                val = sanitize_latex(val_str)
            formatted_skills[cat_name] = val

        # Last updated note
        last_updated = profile.last_updated
        if last_updated:
            last_updated = sanitize_latex(last_updated)

        # Format contact lines for balanced display
        if len(contact_elements) > 4:
            mid = (len(contact_elements) + 1) // 2
            contact_lines = [contact_elements[:mid], contact_elements[mid:]]
        else:
            contact_lines = [contact_elements] if contact_elements else []

        context = {
            "personal": profile.personal,
            "contact_elements": contact_elements,
            "contact_lines": contact_lines,
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
