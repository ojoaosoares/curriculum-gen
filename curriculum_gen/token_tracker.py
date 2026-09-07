import os
import json
import threading
import datetime
from typing import Dict, Any, List, Optional
import pathlib

DATA_DIR = pathlib.Path("data")
TELEMETRY_FILE = DATA_DIR / "token_telemetry.json"


class TokenTracker:
    """
    Persistent, thread-safe token telemetry and economy engine.
    Tracks tokens consumed vs tokens saved across all pipelines:
    - Curriculum Generation (Job distillation, Cache memoization, Zero-Retry LaTeX)
    - Resume / LinkedIn PDF Ingestion (Deterministic schema extraction, PDF distillation, SHA-256 cache)
    - GitHub Ingestion (README benchmark distillation)
    - Academic Ingestion (Paper abstract pruning)
    """

    def __init__(self, storage_path: pathlib.Path = TELEMETRY_FILE):
        self.storage_path = storage_path
        self._lock = threading.Lock()
        self._state: Dict[str, Any] = self._load()

    def _default_state(self) -> Dict[str, Any]:
        return {
            "total_tokens_used": 0,
            "total_tokens_saved": 0,
            "total_calls": 0,
            "total_cache_hits": 0,
            "efficiency_pct": 0.0,
            "estimated_cost_saved_usd": 0.0,
            "breakdown": {
                "job_distillation": 0,
                "pdf_distillation_and_schema": 0,
                "github_readme_distillation": 0,
                "academic_abstract_pruning": 0,
                "cache_memoization": 0,
                "zero_retry_latex": 0,
            },
            "history": [],
        }

    def _load(self) -> Dict[str, Any]:
        if self.storage_path.exists():
            try:
                with open(self.storage_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    # Merge with default state in case new fields were added
                    default = self._default_state()
                    for k, v in default.items():
                        if k not in data:
                            data[k] = v
                    for bk, bv in default["breakdown"].items():
                        if bk not in data["breakdown"]:
                            data["breakdown"][bk] = bv
                    return data
            except Exception as e:
                print(f"[TokenTracker] Error loading telemetry: {e}. Using defaults.")
        return self._default_state()

    def _save(self) -> None:
        try:
            self.storage_path.parent.mkdir(parents=True, exist_ok=True)
            temp_file = self.storage_path.with_suffix(".tmp")
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(self._state, f, indent=2, ensure_ascii=False)
            temp_file.replace(self.storage_path)
        except Exception as e:
            print(f"[TokenTracker] Error persisting telemetry: {e}")

    def record_operation(
        self,
        operation: str,
        tokens_used: int,
        tokens_saved: int,
        category: str,
        strategy: str,
        details: str = "",
        provider: str = "offline",
        is_cache_hit: bool = False,
    ) -> Dict[str, Any]:
        with self._lock:
            self._state["total_tokens_used"] += max(0, tokens_used)
            self._state["total_tokens_saved"] += max(0, tokens_saved)
            self._state["total_calls"] += 1
            if is_cache_hit:
                self._state["total_cache_hits"] += 1

            if category in self._state["breakdown"]:
                self._state["breakdown"][category] += max(0, tokens_saved)
            else:
                self._state["breakdown"][category] = max(0, tokens_saved)

            total = self._state["total_tokens_used"] + self._state["total_tokens_saved"]
            self._state["efficiency_pct"] = (
                round((self._state["total_tokens_saved"] / total) * 100, 1) if total > 0 else 0.0
            )
            # Estimated cost savings at standard rate ($2.00 / 1M tokens blended)
            self._state["estimated_cost_saved_usd"] = round(
                (self._state["total_tokens_saved"] / 1_000_000) * 2.0, 4
            )

            timestamp = datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")
            entry = {
                "id": f"evt-{len(self._state['history']) + 1}",
                "timestamp": timestamp,
                "operation": operation,
                "provider": provider,
                "tokens_used": tokens_used,
                "tokens_saved": tokens_saved,
                "strategy": strategy,
                "details": details,
                "is_cache_hit": is_cache_hit,
            }
            # Keep up to 50 entries
            self._state["history"].insert(0, entry)
            self._state["history"] = self._state["history"][:50]

            self._save()
            return dict(self._state)

    def record_llm_optimizer_metrics(self, metrics: Dict[str, Any], target_role: str = "") -> None:
        used = metrics.get("tokens_used", 0)
        saved = metrics.get("tokens_saved", 0)
        hits = metrics.get("cache_hits", 0)
        breakdown = metrics.get("breakdown", {})

        with self._lock:
            # We record incremental metrics
            self._state["total_tokens_used"] += used
            self._state["total_tokens_saved"] += saved
            self._state["total_calls"] += 1
            self._state["total_cache_hits"] += hits

            for k in ["job_distillation", "cache_memoization", "zero_retry_latex"]:
                if k in breakdown:
                    self._state["breakdown"][k] += breakdown[k]

            total = self._state["total_tokens_used"] + self._state["total_tokens_saved"]
            self._state["efficiency_pct"] = (
                round((self._state["total_tokens_saved"] / total) * 100, 1) if total > 0 else 0.0
            )
            self._state["estimated_cost_saved_usd"] = round(
                (self._state["total_tokens_saved"] / 1_000_000) * 2.0, 4
            )

            timestamp = datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")
            entry = {
                "id": f"evt-{len(self._state['history']) + 1}",
                "timestamp": timestamp,
                "operation": "Otimização ATS de Currículo",
                "provider": "LLM / Local",
                "tokens_used": used,
                "tokens_saved": saved,
                "strategy": "Poda Heurística de Vaga + Memoization + Zero-Retry LaTeX",
                "details": f"Alvo: {target_role or 'Geral'} ({hits} cache hits)",
                "is_cache_hit": hits > 0,
            }
            self._state["history"].insert(0, entry)
            self._state["history"] = self._state["history"][:50]

            self._save()

    def get_summary(self) -> Dict[str, Any]:
        with self._lock:
            return dict(self._state)

    def reset(self) -> Dict[str, Any]:
        with self._lock:
            self._state = self._default_state()
            self._save()
            return dict(self._state)

    def generate_readme_snippet(self) -> str:
        s = self.get_summary()
        return f"""### ⚡ Estratégias de Redução de Tokens & Eficiência de LLM
O Curriculum-Gen foi arquitetado com um motor determinístico de **Token Intelligence**, reduzindo significativamente os custos e a latência de chamadas a modelos de linguagem:

- **Eficiência Global**: {s['efficiency_pct']}% de economia de tokens alcançada ({s['total_tokens_saved']:,} tokens poupados vs {s['total_tokens_used']:,} consumidos).
- **Extração Estrutural Determinística Prévia**: Ingestão de currículos e LinkedIn PDFs via parser determinístico offline (0 tokens consumidos para dados estruturados, contatos e tags).
- **Poda Heurística de Vagas (Job Distillation)**: Remoção de boilerplate, benefícios e jargão corporativo de job descriptions, preservando apenas o núcleo técnico (-65% de tokens no prompt).
- **Memoization & Cache SHA-256**: Identificação de prompts e arquivos idênticos sem realizar novas requisições de rede.
- **Zero-Retry LaTeX**: Sanitização de comandos e caracteres especiais diretamente em memória, eliminando ciclos de re-tentativa e falhas de compilação.
- **README & Abstract Distillation**: Extração cirúrgica de métricas de benchmark de repositórios e resumos científicos via arXiv/CrossRef em vez de processar documentos completos.
"""


# Global singleton instance
token_tracker = TokenTracker()
