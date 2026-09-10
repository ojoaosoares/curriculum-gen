#!/usr/bin/env bash
# ==============================================================================
# Curriculum-Gen: Script de Instalação Automatizada
# ==============================================================================
# Detecta e instala/configura:
# 1. Dependências do Sistema (Python 3.10+, pdflatex + fontawesome5, Node.js, npm)
# 2. Ambiente Virtual Python (.venv) e pacotes do Backend/CLI
# 3. Dependências do Frontend (npm install em frontend/)
# 4. Arquivo de configuração de ambiente (.env)
# ==============================================================================

set -eo pipefail

# Diretório raiz do projeto
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# Estilos e cores para o terminal
BOLD="\033[1m"
DIM="\033[2m"
GREEN="\033[0;32m"
BLUE="\033[0;34m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
RESET="\033[0m"

log_info() {
    echo -e "${BLUE}[INFO]${RESET} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${RESET} $1"
}

log_warn() {
    echo -e "${YELLOW}[AVISO]${RESET} $1"
}

log_error() {
    echo -e "${RED}[ERRO]${RESET} $1"
}

log_step() {
    echo -e "\n${BOLD}${CYAN}==>${RESET} ${BOLD}$1${RESET}"
}

# Opções de linha de comando
AUTO_YES=false
SKIP_SYS_DEPS=false

for arg in "$@"; do
    case $arg in
        -y|--yes)
            AUTO_YES=true
            shift
            ;;
        --no-sys-deps|--skip-sys-deps)
            SKIP_SYS_DEPS=true
            shift
            ;;
        -h|--help)
            echo "Uso: ./install.sh [OPÇÕES]"
            echo ""
            echo "Opções:"
            echo "  -y, --yes          Não solicita confirmação interativa para instalar dependências do sistema"
            echo "  --no-sys-deps      Pula a tentativa de instalar pacotes do sistema (apt/dnf/pacman/brew)"
            echo "  -h, --help         Exibe esta mensagem de ajuda"
            exit 0
            ;;
    esac
done

echo -e "${BOLD}┌─────────────────────────────────────────────────────────────┐${RESET}"
echo -e "${BOLD}│        Instalador Automatizado do Curriculum-Gen            │${RESET}"
echo -e "${BOLD}└─────────────────────────────────────────────────────────────┘${RESET}"

# ==============================================================================
# 1. Detecção do Sistema Operacional e Gerenciador de Pacotes
# ==============================================================================
log_step "1/5: Verificando Sistema Operacional e Ferramentas Base"

OS="unknown"
PKG_MANAGER="unknown"

if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
    if command -v apt-get &>/dev/null; then
        PKG_MANAGER="apt"
    elif command -v dnf &>/dev/null; then
        PKG_MANAGER="dnf"
    elif command -v pacman &>/dev/null; then
        PKG_MANAGER="pacman"
    elif command -v zypper &>/dev/null; then
        PKG_MANAGER="zypper"
    fi
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
    if command -v brew &>/dev/null; then
        PKG_MANAGER="brew"
    fi
fi

log_info "Sistema detectado: $OS ($PKG_MANAGER)"

# ==============================================================================
# 2. Verificação e Instalação de Pré-requisitos de Sistema
# ==============================================================================
MISSING_SYS_PKGS=()
NEED_SUDO_INSTALL=false

# Verificação de Python 3.10+
if ! command -v python3 &>/dev/null; then
    MISSING_SYS_PKGS+=("python3")
    NEED_SUDO_INSTALL=true
else
    PY_VER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    PY_MAJOR=$(python3 -c 'import sys; print(sys.version_info.major)')
    PY_MINOR=$(python3 -c 'import sys; print(sys.version_info.minor)')
    if [[ "$PY_MAJOR" -lt 3 ]] || [[ "$PY_MAJOR" -eq 3 && "$PY_MINOR" -lt 10 ]]; then
        log_error "Python $PY_VER detectado. O Curriculum-Gen requer Python >= 3.10."
        MISSING_SYS_PKGS+=("python3 (>=3.10)")
        NEED_SUDO_INSTALL=true
    else
        log_success "Python $PY_VER encontrado."
    fi

    # Testa suporte a venv
    if ! python3 -c "import venv" &>/dev/null; then
        log_warn "O módulo 'venv' do Python não está disponível."
        if [[ "$PKG_MANAGER" == "apt" ]]; then
            MISSING_SYS_PKGS+=("python3-venv" "python3-pip")
            NEED_SUDO_INSTALL=true
        fi
    fi
fi

# Verificação de Node.js e npm (para o frontend)
if ! command -v node &>/dev/null || ! command -v npm &>/dev/null; then
    log_warn "Node.js ou npm não encontrados (necessários para a interface Web React)."
    if [[ "$PKG_MANAGER" == "apt" ]]; then
        MISSING_SYS_PKGS+=("nodejs" "npm")
    elif [[ "$PKG_MANAGER" == "pacman" ]]; then
        MISSING_SYS_PKGS+=("nodejs" "npm")
    elif [[ "$PKG_MANAGER" == "dnf" ]]; then
        MISSING_SYS_PKGS+=("nodejs" "npm")
    elif [[ "$PKG_MANAGER" == "brew" ]]; then
        MISSING_SYS_PKGS+=("node")
    fi
    NEED_SUDO_INSTALL=true
else
    NODE_VER=$(node -v)
    NPM_VER=$(npm -v)
    log_success "Node.js $NODE_VER e npm $NPM_VER encontrados."
fi

# Verificação do TeX Live / pdflatex e pacote fontawesome5
HAS_PDFLATEX=false
HAS_FONTAWESOME=false

if command -v pdflatex &>/dev/null; then
    HAS_PDFLATEX=true
    log_success "pdflatex encontrado no PATH."
    if command -v kpsewhich &>/dev/null && kpsewhich fontawesome5.sty &>/dev/null; then
        HAS_FONTAWESOME=true
        log_success "Pacote LaTeX 'fontawesome5' encontrado."
    else
        log_warn "Pacote LaTeX 'fontawesome5.sty' não encontrado (necessário para os ícones do CV)."
        NEED_SUDO_INSTALL=true
    fi
else
    log_warn "pdflatex não encontrado (necessário para compilar o currículo em PDF)."
    NEED_SUDO_INSTALL=true
fi

if [[ "$NEED_SUDO_INSTALL" == true && "$SKIP_SYS_DEPS" == false ]]; then
    log_step "2/5: Instalando Dependências do Sistema"
    
    INSTALL_CONFIRMED=false
    if [[ "$AUTO_YES" == true ]]; then
        INSTALL_CONFIRMED=true
    else
        echo -e "${YELLOW}Dependências de sistema faltantes ou recomendadas detectadas:${RESET}"
        if [[ "$HAS_PDFLATEX" == false || "$HAS_FONTAWESOME" == false ]]; then
            echo -e "  - TeX Live (pdflatex e fontes extras como fontawesome5)"
        fi
        for p in "${MISSING_SYS_PKGS[@]}"; do
            echo -e "  - $p"
        done
        
        echo ""
        read -p "Deseja que o instalador tente instalar os pacotes via $PKG_MANAGER? [S/n] " -r RESP
        if [[ -z "$RESP" || "$RESP" =~ ^[SsYy]$ ]]; then
            INSTALL_CONFIRMED=true
        fi
    fi

    if [[ "$INSTALL_CONFIRMED" == true ]]; then
        case "$PKG_MANAGER" in
            apt)
                log_info "Atualizando repositórios e instalando pacotes via apt..."
                sudo apt-get update -qq
                APT_PACKAGES=()
                [[ "$HAS_PDFLATEX" == false ]] && APT_PACKAGES+=("texlive-latex-base" "texlive-latex-extra" "texlive-fonts-recommended")
                [[ "$HAS_FONTAWESOME" == false ]] && APT_PACKAGES+=("texlive-fonts-extra")
                for pkg in "${MISSING_SYS_PKGS[@]}"; do
                    APT_PACKAGES+=("$pkg")
                done
                if [[ ${#APT_PACKAGES[@]} -gt 0 ]]; then
                    sudo apt-get install -y "${APT_PACKAGES[@]}"
                fi
                ;;
            pacman)
                log_info "Instalando pacotes via pacman..."
                PACMAN_PKGS=()
                [[ "$HAS_PDFLATEX" == false ]] && PACMAN_PKGS+=("texlive-basic" "texlive-latex" "texlive-latexextra")
                [[ "$HAS_FONTAWESOME" == false ]] && PACMAN_PKGS+=("texlive-fontsextra")
                for pkg in "${MISSING_SYS_PKGS[@]}"; do
                    PACMAN_PKGS+=("$pkg")
                done
                if [[ ${#PACMAN_PKGS[@]} -gt 0 ]]; then
                    sudo pacman -S --noconfirm --needed "${PACMAN_PKGS[@]}"
                fi
                ;;
            dnf)
                log_info "Instalando pacotes via dnf..."
                DNF_PKGS=()
                [[ "$HAS_PDFLATEX" == false ]] && DNF_PKGS+=("texlive-scheme-medium")
                [[ "$HAS_FONTAWESOME" == false ]] && DNF_PKGS+=("texlive-fontawesome5")
                for pkg in "${MISSING_SYS_PKGS[@]}"; do
                    DNF_PKGS+=("$pkg")
                done
                if [[ ${#DNF_PKGS[@]} -gt 0 ]]; then
                    sudo dnf install -y "${DNF_PKGS[@]}"
                fi
                ;;
            brew)
                log_info "Instalando pacotes via Homebrew..."
                [[ "$HAS_PDFLATEX" == false ]] && brew install --cask mactex-no-gui
                for pkg in "${MISSING_SYS_PKGS[@]}"; do
                    brew install "$pkg"
                done
                ;;
            *)
                log_warn "Gerenciador de pacotes não suportado para instalação automática."
                log_warn "Por favor, instale manualmente: pdflatex (TeX Live com fontawesome5), Python 3.10+ e Node.js."
                ;;
        esac
    else
        log_warn "Instalação de pacotes do sistema ignorada pelo usuário."
    fi
else
    log_step "2/5: Dependências do Sistema Verificadas"
    log_success "Ambiente de sistema pronto para prosseguir."
fi

# ==============================================================================
# 3. Configuração do Ambiente Virtual Python (.venv)
# ==============================================================================
log_step "3/5: Configurando Ambiente Virtual Python (.venv)"

if [ ! -d ".venv" ]; then
    log_info "Criando ambiente virtual em $ROOT_DIR/.venv..."
    python3 -m venv .venv
    log_success "Ambiente virtual criado."
else
    log_info "Ambiente virtual (.venv) já existente."
fi

# Ativa o ambiente virtual
source .venv/bin/activate
log_info "Ambiente virtual ativado: $(which python3)"

# Atualiza ferramentas fundamentais do pip
log_info "Atualizando pip, setuptools e wheel..."
pip install --upgrade pip setuptools wheel -q

# Instala as dependências do projeto em modo editável (incluindo dependências de teste/dev)
log_info "Instalando Curriculum-Gen e dependências Python (FastAPI, Typer, Jinja2, OpenAI, etc.)..."
if pip install -e ".[dev]" -q; then
    log_success "Dependências Python instaladas com sucesso."
else
    log_warn "Falha ao instalar com [dev], tentando instalação padrão..."
    pip install -e . -q
    log_success "Dependências padrão Python instaladas com sucesso."
fi

# ==============================================================================
# 4. Configuração do Frontend Web (React + Vite)
# ==============================================================================
log_step "4/5: Configurando Frontend Web (React + Vite)"

if [ -d "frontend" ]; then
    if command -v npm &>/dev/null; then
        log_info "Instalando dependências do frontend (npm install)..."
        (cd frontend && npm install)
        log_success "Dependências do frontend instaladas com sucesso."
    else
        log_warn "npm não está disponível. Não foi possível instalar as dependências do frontend em frontend/."
    fi
else
    log_warn "Diretório 'frontend' não encontrado, pulando etapa."
fi

# ==============================================================================
# 5. Configuração de Arquivo de Ambiente (.env) e Permissões
# ==============================================================================
log_step "5/5: Finalizando Configurações"

# Cria .env a partir de .env.example se não existir
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        log_success "Arquivo '.env' criado a partir de '.env.example'."
        log_info "Lembre-se de configurar sua chave GEMINI_API_KEY ou OPENAI_API_KEY no arquivo .env."
    fi
else
    log_info "Arquivo '.env' já existe."
fi

# Concede permissão de execução aos scripts utilitários
chmod +x run_local.sh install.sh 2>/dev/null || true

# Teste rápido de sanidade da CLI
if command -v curriculum-gen &>/dev/null; then
    log_success "CLI 'curriculum-gen' disponível e pronta para uso!"
else
    log_warn "Comando 'curriculum-gen' não encontrado diretamente no PATH atual (ative com 'source .venv/bin/activate')."
fi

# ==============================================================================
# Resumo Final
# ==============================================================================
echo ""
echo -e "${BOLD}${GREEN}======================================================================${RESET}"
echo -e "${BOLD}${GREEN}        Instalação do Curriculum-Gen Concluída com Sucesso!          ${RESET}"
echo -e "${BOLD}${GREEN}======================================================================${RESET}"
echo ""
echo -e "${BOLD}Como executar o projeto:${RESET}"
echo ""
echo -e "  ${BOLD}1. Iniciar Aplicação Completa (Web + API Backend):${RESET}"
echo -e "     ${CYAN}./run_local.sh${RESET}"
echo -e "     -> Frontend: ${BLUE}http://localhost:5173${RESET}"
echo -e "     -> Backend API & Docs: ${BLUE}http://127.0.0.1:8000/docs${RESET}"
echo ""
echo -e "  ${BOLD}2. Usar a Linha de Comando (CLI):${RESET}"
echo -e "     ${CYAN}source .venv/bin/activate${RESET}"
echo -e "     ${CYAN}curriculum-gen --help${RESET}"
echo -e "     ${CYAN}curriculum-gen generate --profile examples/profile_sample.yaml${RESET}"
echo ""
echo -e "  ${BOLD}3. Rodar Testes Automatizados:${RESET}"
echo -e "     ${CYAN}source .venv/bin/activate${RESET}"
echo -e "     ${CYAN}pytest${RESET}"
echo ""
echo -e "  ${BOLD}4. Chaves de API (Opcional para Modo LLM):${RESET}"
echo -e "     Edite o arquivo ${CYAN}.env${RESET} para adicionar suas chaves de API (Gemini ou OpenAI)."
echo -e "     (Nota: O gerador também funciona 100% offline via regras heurísticas!)"
echo ""
