from curriculum_gen.models import (
    UserProfile,
    ContactInfo,
    ExperienceItem,
    ProjectItem,
    JobContext,
)
from curriculum_gen.matcher import MatcherEngine, calculate_recency, calculate_impact


def test_calculate_recency():
    assert calculate_recency("Present", is_current=True) == 1.0
    assert calculate_recency("2026") >= 0.95
    assert calculate_recency("2020") < calculate_recency("2025")


def test_calculate_impact():
    high_impact = ["Achieved 213% throughput increase and 51% latency reduction."]
    low_impact = ["Worked on internal tasks."]
    assert calculate_impact(high_impact, []) > calculate_impact(low_impact, [])


def test_matcher_selects_relevant():
    exp_systems = ExperienceItem(
        role="Systems Engineer",
        company="Kernel Lab",
        period="2025",
        tags=["eBPF", "Linux Kernel", "C", "Networking"],
        raw_bullets=["Offloaded packet filter with eBPF/XDP."],
    )
    exp_web = ExperienceItem(
        role="Frontend Engineer",
        company="UI Shop",
        period="2025",
        tags=["React", "CSS", "Design"],
        raw_bullets=["Created design system components in React."],
    )

    profile = UserProfile(
        personal=ContactInfo(name="Candidate"),
        experiences=[exp_systems, exp_web],
    )

    # Context 1: Systems job
    job_systems = JobContext(job_description="Looking for Linux Kernel, eBPF and C systems engineer.")
    matcher1 = MatcherEngine(job_systems)
    selected_exps, _, _ = matcher1.match(profile)
    assert selected_exps[0].role == "Systems Engineer"

    # Context 2: Frontend job
    job_frontend = JobContext(job_description="Looking for React frontend UI design specialist.")
    matcher2 = MatcherEngine(job_frontend)
    selected_exps2, _, _ = matcher2.match(profile)
    assert selected_exps2[0].role == "Frontend Engineer"


def test_calculate_recency_handles_none():
    assert calculate_recency(None) == 0.75
    assert calculate_recency("") == 0.75
    assert calculate_recency(None, start_year=2026) >= 0.95


def test_matcher_scores_with_none_fields():
    from curriculum_gen.models import AwardOrLeadershipItem
    award = AwardOrLeadershipItem(title="Hackathon Winner", period_or_date=None, description=None)
    job = JobContext(job_description="Hackathon winner needed")
    matcher = MatcherEngine(job)
    score = matcher.score_award(award)
    assert score > 0.0


def test_matcher_analyze_ats():
    job = JobContext(job_description="Senior Python Docker Kubernetes developer")
    matcher = MatcherEngine(job)
    exp = ExperienceItem(role="Software Engineer", company="Acme", tags=["Python", "Docker"])
    profile = UserProfile(personal=ContactInfo(name="Dev"), experiences=[exp], skills={"Tech": ["Git"]})
    res = matcher.analyze_ats(profile, [exp], [], [])
    assert res["score_pct"] > 0
    assert "python" in res["matched_keywords"]
    assert "docker" in res["matched_keywords"]
    assert "kubernetes" in res["missing_keywords"]
    assert len(res["recommendations"]) > 0


def test_matcher_detects_incomplete_items():
    from curriculum_gen.models import AwardOrLeadershipItem, ProjectItem
    job = JobContext(job_description="Networking eBPF engineer")
    matcher = MatcherEngine(job)

    # Incomplete experience (empty bullets)
    exp = ExperienceItem(id="exp-1", role="Dev", company="TechCorp", raw_bullets=[])
    # Incomplete project (empty bullets)
    proj = ProjectItem(id="proj-1", title="AtesN-DS: Acelerando DNS com eBPF", raw_bullets=[])
    # Incomplete award (empty description)
    award = AwardOrLeadershipItem(id="aw-1", title="Networking Basics (Cisco)", description="")

    profile = UserProfile(
        personal=ContactInfo(name="Dev"),
        experiences=[exp],
        projects=[proj],
        awards_and_leadership=[award],
    )

    res = matcher.analyze_ats(profile, [exp], [proj], [award])
    assert "incomplete_items" in res
    assert len(res["incomplete_items"]) == 3

    types = {item["type"] for item in res["incomplete_items"]}
    assert types == {"experience", "project", "award"}
    assert any("Atenção ATS" in r for r in res["recommendations"])

