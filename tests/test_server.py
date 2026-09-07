import pytest
from curriculum_gen.server.app import verify_llm_key, VerifyKeyRequest


def test_verify_llm_key_empty():
    with pytest.raises(Exception):
        verify_llm_key(VerifyKeyRequest(api_key=""))


def test_verify_llm_key_gemini_detect():
    res = verify_llm_key(VerifyKeyRequest(api_key="AIzaSyInvalidKeyTest"))
    assert res["provider"] == "Google Gemini"
    assert res["model"] == "gemini-2.0-flash"
    assert res["valid"] is False


def test_verify_llm_key_gemini_aq_detect():
    res = verify_llm_key(VerifyKeyRequest(api_key="AQ.InvalidKeyTest"))
    assert res["provider"] == "Google Gemini"
    assert res["model"] == "gemini-2.0-flash"
    assert res["valid"] is False


def test_verify_llm_key_openai_detect():
    res = verify_llm_key(VerifyKeyRequest(api_key="sk-invalidkeytest"))
    assert res["provider"] == "OpenAI"
    assert res["model"] == "gpt-4o-mini"
    assert res["valid"] is False


def test_llm_optimizer_system_prompt_substitution():
    from curriculum_gen.llm_optimizer import SYSTEM_PROMPT, LLMOptimizer
    from curriculum_gen.models import ExperienceItem, JobContext

    rendered = SYSTEM_PROMPT.replace("{language}", "Brazilian Portuguese")
    assert "Brazilian Portuguese" in rendered
    assert "{language}" not in rendered

    llm = LLMOptimizer(api_key="AQ.TestKeyFake", provider="gemini")
    exp = ExperienceItem(
        role="Software Engineer",
        company="Tech Corp",
        period="2023 - Present",
        tags=["Python", "Go"],
        raw_bullets=["Built a service that increased throughput by 50%."],
    )
    job = JobContext(job_description="Go and Python engineer", language="pt")
    bullets = llm.optimize_experience(exp, job)
    assert len(bullets) == 1
    assert "textbf" in bullets[0]


def test_llm_optimizer_token_metrics():
    from curriculum_gen.llm_optimizer import LLMOptimizer
    from curriculum_gen.models import ExperienceItem, JobContext

    llm = LLMOptimizer(api_key="AQ.TestKeyFake", provider="gemini")
    exp = ExperienceItem(
        role="Backend Engineer",
        company="Kernel Lab",
        period="2022 - 2024",
        tags=["Rust", "eBPF"],
        raw_bullets=["Reduced latency by 45% using XDP kernel bypass."],
    )
    long_job_desc = "Software Engineer needed. " + ("Benefits include 401k and health care. " * 30)
    job = JobContext(job_description=long_job_desc, language="en")
    llm.optimize_experience(exp, job)
    metrics = llm.get_token_metrics()
    assert "tokens_used" in metrics
    assert "tokens_saved" in metrics
    assert "efficiency_pct" in metrics
    assert metrics["tokens_saved"] > 0
    assert metrics["breakdown"]["job_distillation"] > 0


def test_clean_latex_bullet_unicode_and_html():
    from curriculum_gen.llm_optimizer import _clean_latex_bullet

    raw = r"Desenvolvi um \u003cb\u003eResolvedor DNS\u003c/\u003cb\u003e de alta performance (\u003cb\u003eeBPF/XDP\u003c/\u003cb\u003e) alcan\u00e7ando 213% throughput."
    cleaned = _clean_latex_bullet(raw)
    assert r"\textbf{Resolvedor DNS}" in cleaned
    assert r"\textbf{eBPF/XDP}" in cleaned
    assert "alcançando" in cleaned
    assert r"213\%" in cleaned
    assert "003c" not in cleaned


def test_clean_latex_bullet_extbf_repair():
    import re
    from curriculum_gen.llm_optimizer import _clean_latex_bullet

    raw1 = "Otimizei pipelines com \textbf{eBPF/XDP} e mecanismos"
    raw2 = "Reduziu latencia usando extbf{AF_XDP} e extbfE2E nos testes"
    cleaned1 = _clean_latex_bullet(raw1)
    cleaned2 = _clean_latex_bullet(raw2)
    assert r"\textbf{eBPF/XDP}" in cleaned1
    assert r"\textbf{AF_XDP}" in cleaned2
    assert r"\textbf{E2E}" in cleaned2
    assert "\t" not in cleaned1
    assert "extbfE2E" not in cleaned2


def test_safe_parse_json_bullets_robust():
    from curriculum_gen.llm_optimizer import safe_parse_json_bullets

    json_str = r"""{"bullets": ["Built a feature with \textbf{React} and 50% faster turnaround.", "Engineered an API with \textbf{NestJS}."]}"""
    bullets = safe_parse_json_bullets(json_str)
    assert len(bullets) == 2
    assert r"\textbf{React}" in bullets[0]
    assert r"50\%" in bullets[0]
    assert r"\textbf{NestJS}" in bullets[1]
    assert "\t" not in bullets[0]


def test_validate_experience_fidelity_catches_hallucination():
    from curriculum_gen.llm_optimizer import LLMOptimizer
    from curriculum_gen.models import ExperienceItem

    llm = LLMOptimizer(api_key="AQ.TestKeyFake", provider="gemini")
    exp_web = ExperienceItem(
        role="Full Stack & Mobile Developer Intern",
        company="Tarken",
        period="09/2025 - Present",
        tags=["React", "React Native", "TypeScript", "NestJS"],
        raw_bullets=["Developed UIs with React.js and MUI."],
    )
    hallucinated = [
        "Otimizou pipelines de rede utilizando eBPF/XDP e AF_XDP no kernel.",
    ]
    assert llm._validate_experience_fidelity(hallucinated, exp_web) is False

    legit = [
        "Desenvolveu interfaces web utilizando React.js e TypeScript.",
    ]
    assert llm._validate_experience_fidelity(legit, exp_web) is True


