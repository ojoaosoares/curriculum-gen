import pytest
from curriculum_gen.models import UserProfile, ContactInfo, EducationItem, ExperienceItem
from curriculum_gen.template_engine import TemplateEngine, sanitize_latex, build_contact_elements


def test_sanitize_latex():
    raw = "Boosted throughput by 50% & cut latency_p99 with **bold text** and [link](https://foo.com)."
    cleaned = sanitize_latex(raw)
    assert r"50\%" in cleaned
    assert r"\&" in cleaned
    assert r"latency\_p99" in cleaned
    assert r"\textbf{bold text}" in cleaned
    assert r"\href{https://foo.com}{link}" in cleaned


def test_build_contact_elements():
    contact = ContactInfo(
        name="Test User",
        email="test@example.com",
        github="https://github.com/testuser",
        linkedin="testuser-li",
        visible_items=["github", "email"],
    )
    elements = build_contact_elements(contact)
    assert len(elements) == 2
    assert "faGithub" in elements[0]
    assert "faEnvelope" in elements[1]


def test_render_en_and_pt():
    engine = TemplateEngine()
    profile = UserProfile(
        personal=ContactInfo(name="Test User", email="test@example.com"),
        education=[
            EducationItem(institution="Test Univ", degree="B.S.", period="2020-2024")
        ],
        experiences=[
            ExperienceItem(
                role="Dev",
                company="Company",
                period="2024",
                raw_bullets=["Built feature X."],
            )
        ],
    )
    rendered_en = engine.render(profile, language="en")
    assert r"\section{Education}" in rendered_en
    assert r"\section{Experience}" in rendered_en

    rendered_pt = engine.render(profile, language="pt")
    assert r"\section{Educação}" in rendered_pt
    assert r"\section{Experiência}" in rendered_pt


def test_compact_period():
    from curriculum_gen.template_engine import compact_period

    # Portuguese
    assert compact_period("maio de 2024 - Present (2 anos 5 meses)", "pt") == "Mai 2024 – Presente"
    assert compact_period("setembro de 2025 - Present (1 ano 1 mês)", "pt") == "Set 2025 – Presente"
    assert compact_period("março de 2023 - setembro de 2027", "pt") == "Mar 2023 – Set 2027"

    # English
    assert compact_period("maio de 2024 - Present (2 anos 5 meses)", "en") == "May 2024 – Present"
    assert compact_period("setembro de 2025 - Present (1 ano 1 mês)", "en") == "Sep 2025 – Present"


def test_clean_award_fields():
    from curriculum_gen.template_engine import clean_award_fields

    # Duplicate year stripped from title and fake heuristic description suppressed
    t, d, desc = clean_award_fields(
        title="Relevância Acadêmica na Semana do Conhecimento UFMG 2025",
        period_or_date="2025",
        description="Reconhecimento acadêmico ou premiação profissional documentada no currículo",
        language="pt",
    )
    assert t == "Relevância Acadêmica na Semana do Conhecimento UFMG"
    assert d == "2025"
    assert desc == ""

    # Certification fake description suppressed
    t2, d2, desc2 = clean_award_fields(
        title="Networking Basics (Cisco)",
        period_or_date="Certificação",
        description="Certificação técnica ou participação em simpósio",
        language="pt",
    )
    assert t2 == "Networking Basics (Cisco)"
    assert d2 == "Certificação"
    assert desc2 == ""


def test_awards_template_rendering_twocolentry():
    from curriculum_gen.template_engine import TemplateEngine
    from curriculum_gen.models import AwardOrLeadershipItem

    engine = TemplateEngine()
    profile = UserProfile(
        personal=ContactInfo(name="Test User"),
        awards_and_leadership=[
            AwardOrLeadershipItem(
                title="Networking Basics (Cisco)",
                period_or_date="Certificação",
                description="Certificação técnica ou participação em simpósio",  # fake heuristic
            ),
            AwardOrLeadershipItem(
                title="Relevância Acadêmica na Semana do Conhecimento UFMG 2025",
                period_or_date="2025",
                description="",
            ),
        ],
    )
    rendered = engine.render(profile, language="pt")

    # Should not contain fake text
    assert "participação em simpósio" not in rendered
    # Should not repeat 2025 2025
    assert "2025 2025" not in rendered
    # Should use twocolentry for aligned title and date
    assert r"\begin{twocolentry}" in rendered
    assert "Networking Basics (Cisco)" in rendered
    assert "Relevância Acadêmica na Semana do Conhecimento UFMG" in rendered
