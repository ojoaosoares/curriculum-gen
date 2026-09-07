import pytest
from fastapi.testclient import TestClient
from curriculum_gen.server.app import app
from curriculum_gen.token_tracker import TokenTracker


def test_token_tracker_record_and_persist(tmp_path):
    storage_file = tmp_path / "telemetry_test.json"
    tracker = TokenTracker(storage_path=storage_file)

    # 1. Record an offline PDF operation
    state = tracker.record_operation(
        operation="Ingestão de PDF",
        tokens_used=0,
        tokens_saved=1500,
        category="pdf_distillation_and_schema",
        strategy="Extração Determinística",
        details="3 exps extraídas",
        provider="heuristic_offline"
    )
    assert state["total_tokens_used"] == 0
    assert state["total_tokens_saved"] == 1500
    assert state["efficiency_pct"] == 100.0
    assert state["breakdown"]["pdf_distillation_and_schema"] == 1500
    assert len(state["history"]) == 1

    # 2. Record a LLM generation operation
    state2 = tracker.record_operation(
        operation="Geração de Currículo",
        tokens_used=500,
        tokens_saved=500,
        category="job_distillation",
        strategy="Poda de Vaga",
        details="Vaga condensada",
        provider="gemini"
    )
    assert state2["total_tokens_used"] == 500
    assert state2["total_tokens_saved"] == 2000
    assert state2["efficiency_pct"] == 80.0
    assert len(state2["history"]) == 2

    # 3. Reload from disk to verify persistence
    reloaded = TokenTracker(storage_path=storage_file)
    summary = reloaded.get_summary()
    assert summary["total_tokens_saved"] == 2000
    assert summary["total_tokens_used"] == 500
    assert summary["efficiency_pct"] == 80.0

    # 4. Generate README snippet
    snippet = reloaded.generate_readme_snippet()
    assert "Estratégias de Redução de Tokens" in snippet
    assert "80.0%" in snippet


def test_api_token_endpoints():
    client = TestClient(app)

    # 1. Get stats
    resp = client.get("/api/tokens/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_tokens_saved" in data
    assert "total_tokens_used" in data
    assert "breakdown" in data
    assert "history" in data

    # 2. Get README snippet
    resp_readme = client.get("/api/tokens/readme")
    assert resp_readme.status_code == 200
    readme_data = resp_readme.json()
    assert "markdown" in readme_data
    assert "Token Intelligence" in readme_data["markdown"]
