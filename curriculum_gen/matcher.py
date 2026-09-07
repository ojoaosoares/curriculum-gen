import re
import math
from typing import List, Set, Dict, Any, Tuple, Optional
from datetime import datetime

from curriculum_gen.models import (
    JobContext,
    ExperienceItem,
    ProjectItem,
    AwardOrLeadershipItem,
    UserProfile,
)

CURRENT_YEAR = datetime.now().year


def tokenize(text: str) -> Set[str]:
    """Tokenize text into lowercase alphanumeric tokens."""
    return set(re.findall(r"\b[a-zA-Z0-9+#_.-]{2,}\b", text.lower()))


def extract_keywords(job_context: JobContext) -> Set[str]:
    """Extract all relevant keywords from job context."""
    tokens = set()
    if job_context.target_role:
        tokens.update(tokenize(job_context.target_role))
    if job_context.target_company:
        tokens.update(tokenize(job_context.target_company))
    if job_context.job_description:
        tokens.update(tokenize(job_context.job_description))
    for kw in job_context.keywords:
        tokens.update(tokenize(kw))
    return tokens


def calculate_relevance(item_tokens: Set[str], job_tokens: Set[str]) -> float:
    """Jaccard / overlap similarity between item tokens and job context tokens."""
    if not job_tokens or not item_tokens:
        return 0.1
    intersection = item_tokens.intersection(job_tokens)
    if not intersection:
        return 0.05
    # Overlap with respect to matched keywords
    score = len(intersection) / (math.sqrt(len(item_tokens)) * math.sqrt(len(job_tokens)))
    return min(1.0, score * 2.5)  # Scale reasonably


def calculate_recency(period_str: Optional[str] = None, start_year: Optional[int] = None, is_current: bool = False) -> float:
    """
    Calculate recency score between 0.0 and 1.0.
    Items that are 'Present', 'Current', or from this year get near 1.0.
    Older items decay smoothly. Safely handles None or empty strings.
    """
    if is_current:
        return 1.0

    if not period_str:
        if start_year:
            diff = CURRENT_YEAR - start_year
            return max(0.35, 1.0 - (0.15 * diff)) if diff > 0 else 1.0
        return 0.75

    p_lower = str(period_str).lower()
    if "present" in p_lower or "atual" in p_lower or "previsão" in p_lower or "expected" in p_lower:
        return 1.0

    years_found = [int(y) for y in re.findall(r"\b(20\d\d)\b", str(period_str))]
    item_year = max(years_found) if years_found else (start_year or (CURRENT_YEAR - 2))

    diff = CURRENT_YEAR - item_year
    if diff <= 0:
        return 1.0
    elif diff == 1:
        return 0.90
    elif diff == 2:
        return 0.75
    elif diff == 3:
        return 0.60
    else:
        return max(0.35, 1.0 - (0.15 * diff))


def calculate_impact(bullets: List[str], metrics: List[str]) -> float:
    """
    Items containing explicit quantitative metrics (percentages, speedups, numbers)
    receive higher impact scores according to Google XYZ standards.
    """
    all_text = " ".join(bullets) + " " + " ".join(metrics)
    metric_matches = re.findall(r"(\d+[\d.,]*%|\d+x|\d+\s*(?:ms|sec|x|k|mb|gb))", all_text, re.IGNORECASE)
    has_bold = "\\textbf" in all_text or "**" in all_text
    metric_count = len(metric_matches)

    score = 0.5
    if metric_count > 0:
        score += min(0.4, metric_count * 0.15)
    if has_bold:
        score += 0.1
    return min(1.0, score)


class MatcherEngine:
    def __init__(self, job_context: JobContext):
        self.job_context = job_context
        self.job_tokens = extract_keywords(job_context)

    def score_experience(self, exp: ExperienceItem) -> float:
        role = exp.role or ""
        company = exp.company or ""
        tags = exp.tags or []
        bullets = exp.raw_bullets or []
        content = f"{role} {company} {' '.join(tags)} {' '.join(bullets)}"
        tokens = tokenize(content)
        s_rel = calculate_relevance(tokens, self.job_tokens)
        s_rec = calculate_recency(exp.period, exp.start_year, exp.is_current)
        s_imp = calculate_impact(bullets, exp.metrics or [])

        total = (
            self.job_context.weight_relevance * s_rel
            + self.job_context.weight_recency * s_rec
            + self.job_context.weight_impact * s_imp
        )
        exp.score = round(total, 4)
        return exp.score

    def score_project(self, proj: ProjectItem) -> float:
        title = proj.title or ""
        subtitle = proj.subtitle or ""
        tags = proj.tags or []
        bullets = proj.raw_bullets or []
        readme = proj.readme_content or ""
        content = f"{title} {subtitle} {' '.join(tags)} {' '.join(bullets)} {readme}"
        tokens = tokenize(content)
        s_rel = calculate_relevance(tokens, self.job_tokens)
        s_rec = calculate_recency(proj.period, proj.start_year)
        s_imp = calculate_impact(bullets, proj.metrics or [])

        total = (
            self.job_context.weight_relevance * s_rel
            + self.job_context.weight_recency * s_rec
            + self.job_context.weight_impact * s_imp
        )
        proj.score = round(total, 4)
        return proj.score

    def score_award(self, award: AwardOrLeadershipItem) -> float:
        title = award.title or ""
        org = award.organization or ""
        desc = award.description or ""
        abstract = award.paper_abstract or ""
        tags = award.tags or []
        content = f"{title} {org} {desc} {abstract} {' '.join(tags)}"
        tokens = tokenize(content)
        s_rel = calculate_relevance(tokens, self.job_tokens)
        s_rec = calculate_recency(award.period_or_date)
        t_lower = title.lower()
        s_imp = 0.8 if abstract or "award" in t_lower or "prêmio" in t_lower else 0.5

        total = (
            self.job_context.weight_relevance * s_rel
            + self.job_context.weight_recency * s_rec
            + self.job_context.weight_impact * s_imp
        )
        award.score = round(total, 4)
        return award.score

    def select_diverse_items(
        self,
        scored_items: List[Tuple[Any, Set[str], Optional[str]]],
        limit: int,
    ) -> List[Any]:
        """
        Greedy selection with Diversity Penalty (Maximal Marginal Relevance inspired).
        Penalizes selecting multiple items from the exact same category or with identical tags.
        """
        if not scored_items:
            return []

        selected: List[Any] = []
        selected_categories: Set[str] = set()
        selected_tags: Set[str] = set()

        # Sort candidate pool initially by raw score descending
        pool = list(scored_items)

        while pool and len(selected) < limit:
            best_idx = -1
            best_effective_score = -1.0

            for i, (item, tags, category) in enumerate(pool):
                raw_score = getattr(item, "score", 0.5)

                # Diversity penalty
                diversity_penalty = 0.0
                if category and category in selected_categories:
                    diversity_penalty += 0.20  # Penalize identical category
                tag_overlap = len(tags.intersection(selected_tags))
                if tag_overlap > 0:
                    diversity_penalty += min(0.15, tag_overlap * 0.05)

                effective_score = raw_score - (self.job_context.weight_diversity * diversity_penalty)

                if effective_score > best_effective_score:
                    best_effective_score = effective_score
                    best_idx = i

            if best_idx >= 0:
                chosen_item, chosen_tags, chosen_category = pool.pop(best_idx)
                selected.append(chosen_item)
                if chosen_category:
                    selected_categories.add(chosen_category)
                selected_tags.update(chosen_tags)
            else:
                break

        return selected

    def match(self, profile: UserProfile) -> Tuple[List[ExperienceItem], List[ProjectItem], List[AwardOrLeadershipItem]]:
        """
        Scores and selects the best experiences, projects, and awards/leadership
        for the given job context, balancing Relevance, Recency, and Diversity.
        """
        # Score experiences
        exp_candidates = []
        for exp in profile.experiences:
            self.score_experience(exp)
            tags = set(t.lower() for t in exp.tags)
            exp_candidates.append((exp, tags, exp.category))

        selected_exps = self.select_diverse_items(exp_candidates, self.job_context.max_experiences)

        # Score projects
        proj_candidates = []
        for proj in profile.projects:
            self.score_project(proj)
            tags = set(t.lower() for t in proj.tags)
            proj_candidates.append((proj, tags, proj.category))

        selected_projs = self.select_diverse_items(proj_candidates, self.job_context.max_projects)

        # Score awards and leadership
        award_candidates = []
        for aw in profile.awards_and_leadership:
            self.score_award(aw)
            tags = set(t.lower() for t in aw.tags)
            award_candidates.append((aw, tags, aw.category))

        selected_awards = self.select_diverse_items(award_candidates, self.job_context.max_awards)

        return selected_exps, selected_projs, selected_awards
