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
