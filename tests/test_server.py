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


def test_profile_persistence_and_reset(tmp_path, monkeypatch):
    import sys
    from fastapi.testclient import TestClient
    import curriculum_gen.server.app
    server_module = sys.modules["curriculum_gen.server.app"]

    fake_data_dir = tmp_path / "data"
    fake_data_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(server_module, "PROJECT_ROOT", tmp_path)

    client = TestClient(server_module.app)

    # 1. Initial GET loads default empty profile
    res = client.get("/api/profile")
    assert res.status_code == 200
    assert res.json()["personal"]["name"] == ""
    assert res.json()["experiences"] == []

    # 2. POST /api/profile saves to data/active_profile.yaml
    updated = res.json()
    updated["personal"]["name"] = "Saved User"
    save_res = client.post("/api/profile", json=updated)
    assert save_res.status_code == 200

    # 3. GET /api/profile returns saved user
    get_res = client.get("/api/profile")
    assert get_res.status_code == 200
    assert get_res.json()["personal"]["name"] == "Saved User"

    # 4. POST /api/profile/reset restores default empty profile
    reset_res = client.post("/api/profile/reset")
    assert reset_res.status_code == 200
    assert reset_res.json()["profile"]["personal"]["name"] == ""
    assert reset_res.json()["profile"]["experiences"] == []


def test_profile_fallback_to_root_profile_yaml(tmp_path, monkeypatch):
    import sys
    from fastapi.testclient import TestClient
    import curriculum_gen.server.app
    server_module = sys.modules["curriculum_gen.server.app"]

    monkeypatch.setattr(server_module, "PROJECT_ROOT", tmp_path)
    client = TestClient(server_module.app)

    # Place a custom profile.yaml in the root
    (tmp_path / "profile.yaml").write_text("""
personal:
  name: "Root Configured User"
  email: "root@example.com"
education: []
experiences: []
awards_and_leadership: []
projects: []
skills: {}
""", encoding="utf-8")

    res = client.get("/api/profile")
    assert res.status_code == 200
    assert res.json()["personal"]["name"] == "Root Configured User"


def test_suggest_description_endpoint():
    from fastapi.testclient import TestClient
    from curriculum_gen.server.app import app

    client = TestClient(app)

    # 1. Cisco certification suggestion
    res1 = client.post(
        "/api/suggest-description",
        json={
            "item_type": "award",
            "title": "Networking Basics (Cisco)",
            "subtitle_or_org": "Cisco",
            "language": "pt",
        },
    )
    assert res1.status_code == 200
    assert "redes" in res1.json()["suggestion"].lower()

    # 2. eBPF / DNS project suggestion
    res2 = client.post(
        "/api/suggest-description",
        json={
            "item_type": "project",
            "title": "AtesN-DS: Acelerando o DNS com eBPF",
            "subtitle_or_org": "Publicação Técnica",
            "language": "pt",
        },
    )
    assert res2.status_code == 200
    assert "ebpf" in res2.json()["suggestion"].lower() or "dns" in res2.json()["suggestion"].lower()

    # 3. Academic distinction suggestion
    res3 = client.post(
        "/api/suggest-description",
        json={
            "item_type": "award",
            "title": "Relevância Acadêmica na Semana do Conhecimento UFMG 2025",
            "subtitle_or_org": "UFMG",
            "language": "pt",
        },
    )
    assert res1.json()["tokens_saved"] > 0
    assert "tokens_used" in res1.json()

    # 4. Profile context cross-referencing (AtesN-DS project details enriched into SBESC award)
    mock_profile = {
        "projects": [
            {
                "title": "AtesN-DS",
                "subtitle": "eBPF, XDP, Linux Kernel",
                "raw_bullets": [
                    "Desenvolveu um resolvedor DNS recursivo em eBPF e XDP alcançando 51% de redução na latência e 213% de aumento na vazão."
                ],
                "tags": ["eBPF", "XDP", "DNS", "C"],
            }
        ],
        "experiences": [
            {
                "role": "Pesquisador científico",
                "company": "Laboratório de Engenharia de Computadores (Lecom)",
                "raw_bullets": ["Pesquisa em eBPF/XDP e redes de alto desempenho."],
            }
        ],
        "awards_and_leadership": [
            {
                "title": "Relevância Acadêmica na Semana do Conhecimento UFMG 2025",
                "period_or_date": "2025",
            }
        ],
    }

    res_cross = client.post(
        "/api/suggest-description",
        json={
            "item_type": "award",
            "title": "Apresentação e Participação no XV Symposium on Computing Systems Engineering (SBESC )",
            "current_description": "Presented AtesN-DS work on the XV Symposium on Computing Systems Engineering (SBESC )",
            "language": "pt",
            "profile_context": mock_profile,
            "mode": "cross_ref",
        },
    )
    assert res_cross.status_code == 200
    cross_data = res_cross.json()
    assert "atesn" in cross_data["suggestion"].lower()
    assert "ebpf" in cross_data["suggestion"].lower() or "latência" in cross_data["suggestion"].lower()
    assert cross_data["tokens_saved"] > 0
    assert len(cross_data.get("cross_refs", [])) > 0

    # 5. Fusion endpoint test (merging SBESC presentation + Semana do Conhecimento UFMG)
    res_fusion = client.post(
        "/api/suggest-fusion",
        json={
            "items": [
                {
                    "title": "Apresentação e Participação no XV Symposium on Computing Systems Engineering (SBESC )",
                    "period_or_date": "2025",
                    "description": "Presented AtesN-DS work on the XV Symposium on Computing Systems Engineering (SBESC )",
                },
                {
                    "title": "Relevância Acadêmica na Semana do Conhecimento UFMG 2025",
                    "period_or_date": "2025",
                    "description": "Premiação acadêmica pelo projeto.",
                },
            ],
            "profile_context": mock_profile,
            "language": "pt",
        },
    )
    assert res_fusion.status_code == 200
    fusion_data = res_fusion.json()
    fused_item = fusion_data["fused_item"]
    assert "atesn" in fused_item["title"].lower() or "sbesc" in fused_item["title"].lower()
    assert "relevância" in fused_item["description"].lower() or "sbesc" in fused_item["description"].lower()
    assert fusion_data["tokens_saved"] > 0


def test_gemini_candidate_fallback_and_error_reporting(monkeypatch):
    from fastapi.testclient import TestClient
    from curriculum_gen.server.app import app
    import httpx

    client = TestClient(app)

    # 1. Test fallback to second model when first candidate returns 404
    call_counts = {"count": 0}

    def mock_post(url, json=None, timeout=None):
        call_counts["count"] += 1
        if "gemini-2.0-flash" in url:
            # Simulate 404 for 2.0-flash
            return httpx.Response(
                404,
                json={"error": {"message": "models/gemini-2.0-flash is not found", "code": 404}},
                request=httpx.Request("POST", url),
            )
        # Next candidate succeeds
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {"text": "Apresentação de artigo sobre o AtesN-DS com redução de 51% de latência."}
                            ]
                        }
                    }
                ],
                "usageMetadata": {"totalTokenCount": 215},
            },
            request=httpx.Request("POST", url),
        )

    def mock_get(url, timeout=None):
        return httpx.Response(
            200,
            json={
                "models": [
                    {"name": "models/gemini-2.0-flash", "supportedGenerationMethods": ["generateContent"]},
                    {"name": "models/gemini-2.5-flash", "supportedGenerationMethods": ["generateContent"]},
                ]
            },
            request=httpx.Request("GET", url),
        )

    monkeypatch.setattr(httpx, "post", mock_post)
    monkeypatch.setattr(httpx, "get", mock_get)

    res_fallback = client.post(
        "/api/suggest-description",
        json={
            "item_type": "award",
            "title": "Apresentação SBESC",
            "subtitle_or_org": "SBESC 2025",
            "api_key": "AIzaSyMockTestKey",
            "provider": "gemini",
            "model": "gemini-2.0-flash",
        },
    )
    assert res_fallback.status_code == 200
    data_fallback = res_fallback.json()
    assert data_fallback["provider"] == "gemini"
    assert data_fallback["tokens_used"] == 215
    assert "AtesN-DS" in data_fallback["suggestion"]
    assert call_counts["count"] >= 2

    # 2. Test fallback_reason when all candidate models fail (e.g. quota 429)
    def mock_post_fail(url, json=None, timeout=None):
        return httpx.Response(
            429,
            json={"error": {"message": "Resource has been exhausted (e.g. check quota)", "code": 429}},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx, "post", mock_post_fail)

    res_error = client.post(
        "/api/suggest-description",
        json={
            "item_type": "award",
            "title": "Apresentação SBESC",
            "subtitle_or_org": "SBESC 2025",
            "api_key": "AIzaSyMockTestKey",
            "provider": "gemini",
        },
    )
    assert res_error.status_code == 200
    data_error = res_error.json()
    assert data_error["provider"] == "offline_heuristic"
    assert data_error["fallback_reason"] is not None
    assert "429" in data_error["fallback_reason"]
