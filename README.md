# 📄 Curriculum-Gen

Gerador inteligente de currículos em **LaTeX de 1 página**, otimizado para **ATS (Applicant Tracking Systems)**, com suporte a múltiplos idiomas, seleção dinâmica de links de contato, máquina de busca e ranqueamento (relevância, atualidade e diversidade), e bullets estruturados no padrão **Google XYZ** (*"Accomplished [X] as measured by [Y], by doing [Z]"*).

---

## ✨ Principais Diferenciais & Funcionalidades

1. **Formato LaTeX Fiel de 1 Página:**
   - Baseado no layout moderno com `geometry`, `titlesec`, `paracol`, `xcolor`, `fontawesome5`, `highlights` e `glyphtounicode=1` (totalmente legível e indexável por robôs de ATS).
   - **Garantia de 1 página única:** Loop de compilação adaptativo que afere o PDF e ajusta margens e densidade para **nunca** vazar para a página 2.

2. **Máquina de Busca e Ranqueamento:**
   - Dado o contexto da vaga pretendida (via arquivo ou entrada padrão `stdin`), avalia o pool de experiências, projetos e conquistas considerando:
     - **Relevância Semântica & Tecnológica:** Alinhamento direto com os requisitos da vaga.
     - **Atualidade (Recency):** Prioriza experiências e projetos recentes em relação aos mais antigos.
     - **Diversidade:** Aplica penalidade por redundância para evitar listar apenas variações do mesmo projeto (ex: balanceia infraestrutura/sistemas com backend, full-stack ou machine learning).
     - **Impacto Quantificável:** Valoriza itens que contenham métricas comprovadas.

3. **Geração de Bullets no Padrão Google XYZ (*"Sem soar mentiroso"*):**
   - *"Accomplished [X], as measured by [Y], by doing [Z]"*.
   - **Filtro de Veracidade Estrita:** Nunca inventa números ou estatísticas falsas. Se o projeto contém métricas (ex: *213% de throughput*, *redução de 51% na latência*, *16x mais velocidade*), estas são destacadas em `\textbf{}`. Se não houver números, foca nos fatos técnicos reais, decisões de arquitetura e impacto operacional.

4. **Ingestão Automática de Dados:**
   - **GitHub Ingestor:** Conecta-se à API do GitHub e extrai dados dos repositórios e conteúdos dos `README.md`, identificando seções de benchmark, resultados e métricas.
   - **Academic Papers / Lattes Ingestor:** Extrai títulos, conferências e **abstracts** de artigos via ArXiv (API oficial) e DOI (CrossRef API) ou URLs acadêmicas.

5. **Flexibilidade de Contatos e Idiomas:**
   - **Contatos configuráveis:** Escolha quais ícones e links exibir próximos ao nome (LinkedIn, Email, GitHub, Lattes, Telefone, Localização, Portfólio) e em qual ordem.
   - **Multi-idioma:** Suporte nativo a **Português (`pt`)** e **Inglês (`en`)** com tradução automática dos cabeçalhos de seções e datas.

6. **Entrada Padrão (`stdin`) e Integração com LLM Genérica:**
   - Aceita descrições de vagas via pipe: `cat vaga.txt | curriculum-gen generate ...`
   - Compatível com qualquer endpoint OpenAI-compatible (`OPENAI_API_KEY`, `OPENAI_BASE_URL`), Groq, DeepSeek, Ollama, LocalAI e Google Gemini.
   - **Modo Offline Resiliente:** Se nenhuma chave for informada, funciona perfeitamente offline usando heurística e formatação inteligente de métricas.

---

## 🚀 Instalação Rápida

### Pré-requisitos
- Python 3.10+
- `pdflatex` (TeX Live no Linux/macOS ou MiKTeX no Windows)
- Pacote de fontes `fontawesome5`

### Instalação

```bash
git clone https://github.com/ojoaosoares/curriculum-gen.git
cd curriculum-gen

# Criar ambiente virtual
python3 -m venv .venv
source .venv/bin/activate

# Instalar dependências e CLI
pip install -e .

# Instalar dependências do Frontend (React + Vite)
cd frontend && npm install && cd ..
```

---

## 🌐 Interface Web (Backend FastAPI + Frontend React & Vite)

Você pode rodar tanto o **Backend FastAPI** quanto o **Frontend React** localmente com um único comando:

```bash
./run_local.sh
```

Ou iniciando em terminais separados:
- **Terminal 1 (Backend API):**
  ```bash
  curriculum-gen serve --port 8000
  ```
- **Terminal 2 (Frontend React):**
  ```bash
  cd frontend
  npm run dev
  ```

Acesse:
- **Interface Visual:** [http://localhost:5173](http://localhost:5173)
- **Documentação da API (Swagger):** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

## 🛠️ Como Usar via Terminal (CLI)

### 1. Inicializar seu perfil (`profile.yaml`)
Gere um template pronto para preencher com seus dados:
```bash
curriculum-gen init -o profile.yaml
```

Ou use o perfil de exemplo pronto em [`examples/profile_sample.yaml`](examples/profile_sample.yaml).

---

### 2. Ingestão do GitHub (Projetos & READMEs)
Descubra e importe projetos diretamente do seu GitHub lendo os READMEs:
```bash
curriculum-gen ingest-github ojoaosoares --max-repos 10
```
Para anexar diretamente ao seu arquivo de perfil:
```bash
curriculum-gen ingest-github ojoaosoares --append-to profile.yaml
```

---

### 3. Gerar Currículo Customizado para uma Vaga

#### Exemplo A: Passando arquivo de vaga (Inglês)
```bash
curriculum-gen generate \
  --profile examples/profile_sample.yaml \
  --job examples/job_systems.txt \
  --lang en \
  --output-pdf output/curriculo_systems.pdf \
  --output-tex output/curriculo_systems.tex
```

#### Exemplo B: Passando arquivo de vaga (Português)
```bash
curriculum-gen generate \
  --profile examples/profile_sample.yaml \
  --job examples/job_fullstack.txt \
  --lang pt \
  --output-pdf output/curriculo_fullstack_pt.pdf \
  --output-tex output/curriculo_fullstack_pt.tex
```

#### Exemplo C: Passando a vaga via entrada padrão (`stdin` / pipe)
```bash
cat << 'EOF' | curriculum-gen generate --profile examples/profile_sample.yaml -o output/resume.pdf
Vaga: Engenheiro de Software Sênior
Stack: Go, Linux Kernel, eBPF, redes de alta velocidade, Docker e microsserviços.
EOF
```

---

### 4. Customização das Informações de Contato

Você pode selecionar no perfil ou diretamente na CLI quais contatos exibir próximos ao seu nome:

```bash
curriculum-gen generate \
  --profile examples/profile_sample.yaml \
  --job examples/job_systems.txt \
  --contacts "email,linkedin,github,lattes" \
  --output-pdf output/resume_custom.pdf
```

---

## ⚙️ Configuração da LLM (Opcional)

Crie um arquivo `.env` na raiz do projeto (veja [`.env.example`](.env.example)):

```bash
# Para usar OpenAI:
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# Para usar Google Gemini (via endpoint compatível):
GEMINI_API_KEY=AIzaSy...

# Para usar Ollama local:
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_MODEL=llama3.2
```

Se nenhuma chave for fornecida, o sistema opera no **modo offline inteligente**, formatando métricas em negrito (`\textbf{}`) e preservando a integridade dos dados fornecidos sem gerar alucinações.

---

## 📁 Estrutura do Repositório

```text
curriculum-gen/
├── curriculum_gen/
│   ├── cli.py                  # Interface CLI (Typer & Rich)
│   ├── models.py               # Schemas Pydantic (Profile, Experience, Project, JobContext)
│   ├── template_engine.py      # Renderizador Jinja2 com delimitadores seguros e i18n
│   ├── matcher.py              # Máquina de busca: Relevância, Atualidade, Diversidade e Impacto
│   ├── llm_optimizer.py        # Otimizador de bullets (Google XYZ + Veracidade + Fallback)
│   ├── compiler.py             # Compilador pdflatex com loop adaptativo de 1 página
│   ├── ingestors/
│   │   ├── github.py           # Parser de repositórios e READMEs
│   │   └── academic.py         # Extrator de abstracts (ArXiv e DOI)
│   └── templates/
│       └── cv_template.tex.j2  # Template LaTeX ATS em Jinja2
├── examples/
│   ├── profile_sample.yaml     # Perfil de exemplo higienizado
│   ├── profile_template.yaml   # Template limpo para novos usuários
│   ├── job_systems.txt         # Vaga exemplo de Sistemas / Redes / eBPF
│   └── job_fullstack.txt       # Vaga exemplo de Full Stack / Mobile
├── tests/                      # 9 testes unitários automatizados (pytest)
├── pyproject.toml
├── .env.example
└── README.md
```

---

## 🧪 Testes Automatizados

Para rodar a suíte completa de testes:
```bash
pytest tests/
```
Output:
```text
tests/test_academic.py .                                                 [ 11%]
tests/test_compiler.py .                                                 [ 22%]
tests/test_github.py .                                                   [ 33%]
tests/test_matcher.py ...                                                [ 66%]
tests/test_template.py ...                                               [100%]
============================== 9 passed in 1.08s ===============================
```

---

## 📄 Licença
Distribuído sob licença MIT. Criado para potencializar candidaturas técnicas de alto nível com transparência e precisão matemática.
