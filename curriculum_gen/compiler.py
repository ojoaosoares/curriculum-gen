import os
import shutil
import tempfile
import subprocess
from pathlib import Path
from typing import Optional, Tuple, Dict, Any, List
from pypdf import PdfReader

from curriculum_gen.models import (
    UserProfile,
    ExperienceItem,
    ProjectItem,
    AwardOrLeadershipItem,
)
from curriculum_gen.template_engine import TemplateEngine


class CompileError(Exception):
    pass


class PDFCompiler:
    def __init__(self, pdflatex_bin: str = "pdflatex"):
        self.pdflatex_bin = pdflatex_bin
        self.template_engine = TemplateEngine()

    def is_pdflatex_available(self) -> bool:
        return shutil.which(self.pdflatex_bin) is not None

    def compile_tex_to_pdf(self, tex_code: str, output_pdf_path: Path) -> Tuple[int, str]:
        """
        Compiles raw LaTeX string to a PDF file.
        Returns (page_count, log_output).
        """
        if not self.is_pdflatex_available():
            raise CompileError(
                f"LaTeX compiler '{self.pdflatex_bin}' not found on system PATH. "
                "Please install texlive (pdflatex) to compile PDFs."
            )

        with tempfile.TemporaryDirectory() as tmpdir:
            tmppath = Path(tmpdir)
            tex_file = tmppath / "resume.tex"
            tex_file.write_text(tex_code, encoding="utf-8")

            # Run pdflatex twice for proper cross-references and lastpage calculations
            log_output = ""
            for run_num in range(2):
                cmd = [
                    self.pdflatex_bin,
                    "-interaction=nonstopmode",
                    "-output-directory",
                    str(tmppath),
                    str(tex_file),
                ]
                proc = subprocess.run(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    timeout=30,
                )
                log_output = proc.stdout
                if proc.returncode != 0 and run_num == 0:
                    # If fatal error on first run, raise error with details
                    if not (tmppath / "resume.pdf").exists():
                        raise CompileError(f"pdflatex compilation failed:\n{log_output[-1500:]}")

            pdf_file = tmppath / "resume.pdf"
            if not pdf_file.exists():
                raise CompileError(f"No PDF output generated. LaTeX Log:\n{log_output[-1500:]}")

            # Read page count using pypdf
            reader = PdfReader(str(pdf_file))
            page_count = len(reader.pages)

            # Copy to target destination
            output_pdf_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(pdf_file, output_pdf_path)

            return page_count, log_output

    def render_and_fit_one_page(
        self,
        profile: UserProfile,
        selected_experiences: List[ExperienceItem],
        selected_projects: List[ProjectItem],
        selected_awards: List[AwardOrLeadershipItem],
        language: str,
        output_pdf_path: Path,
        output_tex_path: Optional[Path] = None,
    ) -> Tuple[str, int]:
        """
        Adaptive fitting loop: ensures the resulting CV strictly fits onto 1 page.
        Tries normal margins first, then tightens margins/spacing, and if needed,
        trims trailing bullet points until page count == 1.
        """
        # Progressive layout configurations to try
        layout_attempts: List[Dict[str, Any]] = [
            # Attempt 0: Default standard margins (2.0 cm)
            {
                "margin_top": "2.0",
                "margin_bottom": "2.0",
                "margin_left": "2.0",
                "margin_right": "2.0",
                "section_space_top": "0.25",
                "section_space_bottom": "0.15",
            },
            # Attempt 1: Slightly reduced margins (1.75 cm)
            {
                "margin_top": "1.75",
                "margin_bottom": "1.75",
                "margin_left": "1.8",
                "margin_right": "1.8",
                "section_space_top": "0.20",
                "section_space_bottom": "0.12",
            },
            # Attempt 2: Compact margins (1.5 cm)
            {
                "margin_top": "1.5",
                "margin_bottom": "1.5",
                "margin_left": "1.6",
                "margin_right": "1.6",
                "section_space_top": "0.16",
                "section_space_bottom": "0.10",
            },
            # Attempt 3: Ultra compact margins (1.3 cm)
            {
                "margin_top": "1.3",
                "margin_bottom": "1.3",
                "margin_left": "1.4",
                "margin_right": "1.4",
                "section_space_top": "0.12",
                "section_space_bottom": "0.08",
            },
        ]

        working_exps = [exp.model_copy(deep=True) for exp in selected_experiences]
        working_projs = [proj.model_copy(deep=True) for proj in selected_projects]
        working_awards = [aw.model_copy(deep=True) for aw in selected_awards]

        best_tex = ""
        best_pages = 999

        # Phase 1: Try layout space compressions
        for layout in layout_attempts:
            tex_code = self.template_engine.render(
                profile=profile,
                selected_experiences=working_exps,
                selected_projects=working_projs,
                selected_awards=working_awards,
                language=language,
                layout_overrides=layout,
            )
            try:
                pages, _ = self.compile_tex_to_pdf(tex_code, output_pdf_path)
                best_tex = tex_code
                best_pages = pages
                if pages == 1:
                    if output_tex_path:
                        output_tex_path.write_text(best_tex, encoding="utf-8")
                    return best_tex, 1
            except CompileError:
                continue

        # Phase 2: If still > 1 page, iteratively trim bullets from least-scored items
        compact_layout = layout_attempts[-1]

        while best_pages > 1:
            trimmed_something = False

            # Try trimming a bullet from projects first
            for proj in reversed(working_projs):
                bullets = proj.formatted_bullets if proj.formatted_bullets else proj.raw_bullets
                if len(bullets) > 1:
                    bullets.pop()
                    proj.formatted_bullets = bullets
                    proj.raw_bullets = bullets
                    trimmed_something = True
                    break

            if not trimmed_something:
                # Try trimming a bullet from experience
                for exp in reversed(working_exps):
                    bullets = exp.formatted_bullets if exp.formatted_bullets else exp.raw_bullets
                    if len(bullets) > 2:
                        bullets.pop()
                        exp.formatted_bullets = bullets
                        exp.raw_bullets = bullets
                        trimmed_something = True
                        break

            if not trimmed_something and len(working_awards) > 1:
                working_awards.pop()
                trimmed_something = True

            if not trimmed_something:
                break

            tex_code = self.template_engine.render(
                profile=profile,
                selected_experiences=working_exps,
                selected_projects=working_projs,
                selected_awards=working_awards,
                language=language,
                layout_overrides=compact_layout,
            )
            try:
                pages, _ = self.compile_tex_to_pdf(tex_code, output_pdf_path)
                best_tex = tex_code
                best_pages = pages
                if pages == 1:
                    break
            except CompileError:
                break

        if output_tex_path and best_tex:
            output_tex_path.write_text(best_tex, encoding="utf-8")

        return best_tex, best_pages
