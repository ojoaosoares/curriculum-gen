import os
import re
import json
from typing import List, Optional
from openai import OpenAI
from curriculum_gen.models import (
    ExperienceItem,
    ProjectItem,
    AwardOrLeadershipItem,
    JobContext,
)

SYSTEM_PROMPT = """You are an elite technical resume coach and ATS optimization specialist.
Your mission is to craft bullet points following the strict Google XYZ Formula:
"Accomplished [X], as measured by [Y], by doing [Z]"

CRITICAL RULES:
1. TRUTHFULNESS & ZERO HALLUCINATION:
   - NEVER invent fake metrics, statistics, percentages, or achievements.
   - Only quantify if numbers/metrics are present or directly deducible from the source material.
   - If no quantitative metric exists, focus on concrete technical achievements, architecture decisions, and operational outcomes.

2. STYLE & HIGHLIGHTING:
   - Highlight key metrics and core technologies using LaTeX \\textbf{...} syntax (e.g., \\textbf{51\\% latency reduction}, \\textbf{eBPF/XDP}).
   - Use strong, active past-tense verbs (Engineered, Developed, Architected, Optimized, Implemented).
   - Keep each bullet concise, impactful, and single-sentence (1-2 lines in LaTeX).

3. TARGET LANGUAGE:
   - Generate bullet points strictly in the requested language ({language}).
   - Ensure native, professional terminology.

OUTPUT FORMAT:
Return ONLY a valid JSON object with the key "bullets" containing an array of strings. Do not include markdown code blocks or additional text.
Example:
{"bullets": ["Developed a high-performance \\textbf{DNS Resolver} (\\textbf{eBPF/XDP}) achieving a \\textbf{213\\% throughput increase} via kernel bypass.", "Engineered a caching layer cutting p99 tail latency by \\textbf{>70ms}."]}
"""


class LLMOptimizer:
    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY") or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        self.base_url = base_url or os.getenv("OPENAI_BASE_URL")
        
        # If using Gemini key with OpenAI compatibility endpoint
        if self.api_key and not self.base_url and (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")):
            if not os.getenv("OPENAI_API_KEY"):
                self.base_url = "https://generativelanguage.googleapis.com/v1beta/openai/"
                self.model = model or "gemini-2.5-flash"
            else:
                self.model = model or "gpt-4o-mini"
        else:
            self.model = model or os.getenv("OPENAI_MODEL") or "gpt-4o-mini"

        self.client = None
        if self.api_key:
            try:
                self.client = OpenAI(api_key=self.api_key, base_url=self.base_url)
            except Exception:
                self.client = None

    def is_available(self) -> bool:
        return self.client is not None

    def optimize_experience(self, exp: ExperienceItem, job_context: JobContext) -> List[str]:
        """
        Generates Google XYZ bullet points for an experience entry.
        Falls back to rule-based formatter if LLM is unavailable.
        """
        if not self.is_available() or not exp.raw_bullets:
            return self._heuristic_format_bullets(exp.raw_bullets, job_context.language)

        lang_name = "Brazilian Portuguese" if job_context.language.startswith("pt") else "English"
        prompt = f"""
Job Title / Context: {job_context.target_role or 'Software Engineer'}
Job Requirements & Description:
{job_context.job_description[:1000]}

Candidate Experience Entry:
Role: {exp.role}
Company: {exp.company}
Technologies / Tags: {', '.join(exp.tags)}
Raw Bullets:
{json.dumps(exp.raw_bullets, indent=2)}

Requested:
Generate up to {job_context.max_bullets_per_experience} high-impact Google XYZ bullet points in {lang_name}.
"""
        return self._call_llm(prompt, exp.raw_bullets, lang_name)

    def optimize_project(self, proj: ProjectItem, job_context: JobContext) -> List[str]:
        """
        Generates Google XYZ bullet points for a project entry (using README content if available).
        """
        if not self.is_available() or (not proj.raw_bullets and not proj.readme_content):
            return self._heuristic_format_bullets(proj.raw_bullets, job_context.language)

        lang_name = "Brazilian Portuguese" if job_context.language.startswith("pt") else "English"
        readme_snippet = (proj.readme_content[:1500] if proj.readme_content else "")
        
        prompt = f"""
Job Title / Context: {job_context.target_role or 'Software Engineer'}
Job Requirements & Description:
{job_context.job_description[:1000]}

Candidate Project:
Title: {proj.title}
Subtitle / Tech Stack: {proj.subtitle or ''}
Tags: {', '.join(proj.tags)}
Raw Bullets:
{json.dumps(proj.raw_bullets, indent=2)}
README Content / Highlights:
{readme_snippet}

Requested:
Generate up to {job_context.max_bullets_per_project} high-impact Google XYZ bullet points in {lang_name}.
"""
        return self._call_llm(prompt, proj.raw_bullets, lang_name)

    def _call_llm(self, user_prompt: str, fallback_bullets: List[str], language: str) -> List[str]:
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT.format(language=language)},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.2,
                response_format={"type": "json_object"} if "gpt-4" in self.model or "gemini" in self.model else None,
            )
            content = response.choices[0].message.content.strip()
            # Clean possible markdown formatting
            if content.startswith("```json"):
                content = content.replace("```json", "", 1).rstrip("```").strip()
            elif content.startswith("```"):
                content = content.replace("```", "", 1).rstrip("```").strip()

            data = json.loads(content)
            bullets = data.get("bullets", [])
            if isinstance(bullets, list) and bullets:
                return [str(b).strip() for b in bullets if str(b).strip()]
        except Exception:
            pass

        return self._heuristic_format_bullets(fallback_bullets, language)

    def _heuristic_format_bullets(self, raw_bullets: List[str], language: str) -> List[str]:
        """
        Offline rule-based formatter:
        - Bolds numbers, percentages, and metrics.
        - Translates or aligns common verbs.
        - Preserves factual accuracy.
        """
        formatted = []
        for bullet in raw_bullets:
            b = bullet.strip()
            if not b:
                continue

            # Ensure metrics like 213% or 16x are bolded if not already bolded
            def bold_metric(match):
                metric = match.group(0)
                return f"\\textbf{{{metric}}}"

            # Bold percentages like 50%, 2.85x, >70ms if not preceded by textbf
            b = re.sub(r"(?<!\\textbf\{)(\b\d+[\d.,]*%|\b\d+(?:\.\d+)?\s*[\u00D7x]|\b[><]?\d+\s*ms\b)", bold_metric, b)

            formatted.append(b)

        return formatted
