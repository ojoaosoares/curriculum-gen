#!/usr/bin/env bash
set -e

# ==============================================================================
# Curriculum-Gen: Script para rodar Backend (FastAPI) e Frontend (React+Vite)
# ==============================================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "=== Iniciando Curriculum-Gen Localmente ==="

# Ativa o ambiente virtual se existir
if [ -d ".venv" ]; then
  source .venv/bin/activate
fi

# 1. Inicia o Backend FastAPI na porta 8000
echo "Iniciando Backend FastAPI (http://127.0.0.1:8000)..."
curriculum-gen serve --port 8000 --reload &
BACKEND_PID=$!

# 2. Inicia o Frontend React + Vite na porta 5173
echo "Iniciando Frontend React + Vite (http://localhost:5173)..."
cd "$ROOT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

# Captura Ctrl+C para finalizar ambos os processos graciosamente
cleanup() {
  echo ""
  echo "Encerrando servidores..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
  exit 0
}

trap cleanup SIGINT SIGTERM

echo ""
echo "Aplicação pronta!"
echo "-> Frontend: http://localhost:5173"
echo "-> Backend API: http://127.0.0.1:8000"
echo "-> Docs da API (Swagger): http://127.0.0.1:8000/docs"
echo "Pressione Ctrl+C para parar os servidores."
echo ""

wait
