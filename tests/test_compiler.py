from pathlib import Path
from curriculum_gen.compiler import PDFCompiler
from curriculum_gen.models import (
    UserProfile,
    ContactInfo,
    EducationItem,
    ExperienceItem,
    ProjectItem,
    AwardOrLeadershipItem,
)


def test_pdf_compiler_1_page(tmp_path: Path):
    compiler = PDFCompiler()
    assert compiler.is_pdflatex_available()

    profile = UserProfile(
        personal=ContactInfo(
            name="Sample Candidate",
            email="candidate@example.com",
            location="City - State",
            visible_items=["location", "email"],
        ),
        education=[
            EducationItem(
                institution="UFMG",
                degree="B.S. in Information Systems",
                period="2023 – 2027",
            )
        ],
        experiences=[
            ExperienceItem(
                role="Research Fellow",
                company="UFMG Lab",
                period="2024 – Present",
                raw_bullets=["Built eBPF DNS resolver with \\textbf{213\\% throughput} increase."],
            )
        ],
        projects=[
            ProjectItem(
                title="Web Crawler",
                subtitle="Python",
                raw_bullets=["Increased throughput by \\textbf{16x} with multithreading."],
            )
        ],
        awards_and_leadership=[
            AwardOrLeadershipItem(
                title="Academic Award",
                period_or_date="2025",
                description="Distinguished for networking research.",
            )
        ],
        skills={
            "Programming Languages": "C, Go, Python, TypeScript",
        },
    )

    out_pdf = tmp_path / "test_resume.pdf"
    out_tex = tmp_path / "test_resume.tex"

    tex_code, pages = compiler.render_and_fit_one_page(
        profile=profile,
        selected_experiences=profile.experiences,
        selected_projects=profile.projects,
        selected_awards=profile.awards_and_leadership,
        language="en",
        output_pdf_path=out_pdf,
        output_tex_path=out_tex,
    )

    assert pages == 1
    assert out_pdf.exists()
    assert out_pdf.stat().st_size > 1000
    assert out_tex.exists()
