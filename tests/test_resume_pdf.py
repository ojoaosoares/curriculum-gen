import pathlib
import pytest
from fastapi.testclient import TestClient

from curriculum_gen.server.app import app
from curriculum_gen.ingestors.resume_pdf import ResumePDFIngestor


@pytest.fixture
def sample_pdf_bytes():
    pdf_path = pathlib.Path("output/test_verify.pdf")
    if not pdf_path.exists():
        # Fallback to any existing pdf in output
        pdfs = list(pathlib.Path("output").glob("*.pdf"))
        if pdfs:
            pdf_path = pdfs[0]
        else:
            pytest.skip("No sample PDF available in output/ to test PDF extraction.")
    return pdf_path.read_bytes()


def test_resume_pdf_ingestor_extract_text(sample_pdf_bytes):
    ingestor = ResumePDFIngestor()
    text = ingestor.extract_text(sample_pdf_bytes)
    assert len(text) > 50
    assert "João Soares" in text or "Educação" in text or "Experiência" in text


def test_resume_pdf_ingestor_heuristic_parse(sample_pdf_bytes):
    ingestor = ResumePDFIngestor()
    result = ingestor.ingest(sample_pdf_bytes)
    assert result["success"] is True
    assert "profile_data" in result
    assert "personal" in result["profile_data"]
    assert "counts" in result
    assert result["counts"]["skills"] > 0


def test_api_ingest_pdf_endpoint(sample_pdf_bytes):
    client = TestClient(app)

    # 1. Successful PDF upload
    response = client.post(
        "/api/ingest/pdf",
        files={"file": ("curriculo.pdf", sample_pdf_bytes, "application/pdf")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "profile_data" in data

    # 2. Reject non-PDF file
    bad_resp = client.post(
        "/api/ingest/pdf",
        files={"file": ("curriculo.txt", b"Texto simples", "text/plain")},
    )
    assert bad_resp.status_code == 400
    assert "PDF" in bad_resp.json()["detail"]


def test_resume_pdf_linkedin_offline_parser():
    ingestor = ResumePDFIngestor()

    sample_linkedin_text = """Contato
contato.ojoaosoares@gmail.c
om
www.linkedin.com/in/ojoaovsoares
(LinkedIn)
github.com/ojoaosoares (Portfolio)
Principais competências
Sistemas de gestão de segurança
Segurança de rede
Sistemas de detecção de intrusão
Languages
Japonês (Professional Working)
Inglês (Full Professional)
Certifications
Japanese-Language Proficiency
Test (Phase 1)
Apresentação e Participação no XV
Symposium on Computing Systems
Engineering (SBESC 2025)
Introduction to Cybersecurity
Networking Basics (Cisco)
Japanese-Language Proficiency
Test (Phase 3)
Honors-Awards
Relevância Acadêmica na Semana
do Conhecimento UFMG 2025
Publications
AtesN-DS: Acelerando o DNS com
eBPF
Processamento de pacotes baseado
em GPU
João Soares
Software Engineer | Computer Networks
Belo Horizonte, Minas Gerais, Brasil
Resumo
Meu nome é João Soares, sou um desenvolvedor entusiasta
e curioso de Minas Gerais . Atualmente curso Sistemas de
Informação na UFMG. Tenho grande interesse por programação
de sistemas, redes de computadores e desafios algorítmicos, gosto
de explorar desempenho, protocolos e código de baixo nível. Além
de linguanges de programação, sou um amante de idiomas como
inglês, japonês e espanhol.
Experiência
Tarken
Estagiário de engenharia de software
setembro de 2025 - Present (1 ano 1 mês)
Белу-Оризонти, MG
◦ Desenvolvimento e integração de aplicações web e mobile utilizando o
ecossistema TypeScript.
◦ Backend com NestJS e TypeORM, com foco em escalabilidade e APIs
REST.
◦ Frontend com React.js, utilizando a biblioteca MUI para componentes e
design responsivo.
◦ Desenvolvimento mobile com React Native, entregando soluções
multiplataforma para Android e iOS.
◦ Desenvolvimento de testes unitários, e testes e2e usando playwright
Laboratório de Engenharia de Computadores (Lecom)
Pesquisador científico
maio de 2024 - Present (2 anos 5 meses)
Belo Horizonte, Minas Gerais, Brasil
Atuação em pesquisa aplicada em redes de computadores e sistemas de
alto desempenho, com ênfase em eBPF/XDP, protocolos de roteamento
e arquiteturas serverless. Experiência no desenvolvimento e avaliação
de sistemas voltados para processamento de pacotes em nível de kernel,
redução de latência e aumento de throughput em serviços de rede.
Page 1 of 2
• Coautoria do minicurso Processamento de Pacotes em GPU, capítulo 1 do
livro de minicursos da SBRC 2025.
• Autoria e desenvolvimento do AtesN-DS, resolvedor DNS recursivo em eBPF
e XDP, com redução de 51% na latência e aumento de 213% na vazão em
relação ao estado da arte.
• Projeto AtesN-DS indicado à categoria "Relevância Acadêmica" na Semana
de Iniciação Científica da UFMG 2025, pelo Departamento de Ciência da
Computação (DCC/UFMG).
• Desenvolvimento de um módulo do GPSR no simulador ns-3 que permite a
planarização do grafo com algoritmos como o Gabriel Graph (GG) e Relative
Neighborhood Graph (RNG).
Departamento de Ciência da Computação - UFMG
Monitor de Graduação
setembro de 2023 - janeiro de 2024 (5 meses)
Campus UFMG, Belo Horizonte, Minas Gerais, Brasil
Fui monitor Bolsista na disciplina de Geometria Analítica e Álgebra Linear
(GAAL) para os alunos do Instituto de Ciências Exatas (Icex) da Universidade
Federal de Minas Gerais (UFMG)
Formação acadêmica
Universidade Federal de Minas Gerais
Bacharelado, Sistemas de Informação · (março de 2023 - setembro de 2027)
Page 2 of 2"""

    cleaned = ingestor._clean_extracted_text(sample_linkedin_text)
    parsed = ingestor._heuristic_parse(cleaned)

    # 1. Contact validation
    assert parsed["personal"]["name"] == "João Soares"
    assert parsed["personal"]["email"] == "contato.ojoaosoares@gmail.com"
    assert "ojoaovsoares" in parsed["personal"]["linkedin"]
    assert "ojoaosoares" in parsed["personal"]["github"]
    assert "Belo Horizonte" in parsed["personal"]["location"]

    # 2. Experiences validation (all 3 roles extracted!)
    assert len(parsed["experiences"]) == 3
    companies = [e["company"] for e in parsed["experiences"]]
    assert "Tarken" in companies
    assert any("Lecom" in c for c in companies)
    assert any("UFMG" in c for c in companies)

    tarken = next(e for e in parsed["experiences"] if e["company"] == "Tarken")
    assert len(tarken["raw_bullets"]) == 5
    assert "TypeScript" in tarken["tags"]
    assert "React" in tarken["tags"]

    # 3. Education validation
    assert len(parsed["education"]) == 1
    assert "Universidade Federal de Minas Gerais" in parsed["education"][0]["institution"]
    assert "Sistemas de Informação" in parsed["education"][0]["degree"]

    # 4. Skills validation (competencies, languages, technologies)
    assert "Competências Principais" in parsed["skills"]
    assert "Idiomas" in parsed["skills"]
    assert "Tecnologias" in parsed["skills"]
    assert len(parsed["skills"]["Competências Principais"]) >= 3
    assert len(parsed["skills"]["Idiomas"]) >= 2
    assert len(parsed["skills"]["Tecnologias"]) >= 10

    # 5. Awards validation
    assert len(parsed["awards_and_leadership"]) >= 1
    assert any("Relevância Acadêmica" in a["title"] for a in parsed["awards_and_leadership"])

    # 6. Projects & Publications validation
    assert "projects" in parsed
    assert len(parsed["projects"]) >= 2
    proj_titles = [p["title"] for p in parsed["projects"]]
    assert any("AtesN-DS" in t for t in proj_titles)
    assert any("GPU" in t for t in proj_titles)


def test_resume_pdf_merge_logic():
    ingestor = ResumePDFIngestor()

    primary_incomplete = {
        "personal": {"name": "João Soares", "email": None},
        "experiences": [],
        "education": [],
        "skills": {"Tecnologias": ["Python", "Rust"]},
        "awards_and_leadership": []
    }

    fallback_complete = {
        "personal": {"name": "João Soares", "email": "joao@example.com", "location": "BH - MG"},
        "experiences": [{"company": "Empresa A", "role": "Dev", "period": "2024", "raw_bullets": ["Bullet 1"], "tags": ["Go"]}],
        "education": [{"institution": "UFMG", "degree": "BSI", "period": "2023-2027", "notes": None}],
        "skills": {"Idiomas": ["Inglês"], "Tecnologias": ["Go", "Python"]},
        "awards_and_leadership": [{"title": "Prêmio 1", "period_or_date": "2024", "description": "Desc"}]
    }

    merged = ingestor._merge_parsed(primary_incomplete, fallback_complete)

    assert merged["personal"]["email"] == "joao@example.com"
    assert merged["personal"]["location"] == "BH - MG"
    assert len(merged["experiences"]) == 1
    assert merged["experiences"][0]["company"] == "Empresa A"
    assert len(merged["education"]) == 1
    assert len(merged["awards_and_leadership"]) == 1
    assert "Idiomas" in merged["skills"]
    assert set(merged["skills"]["Tecnologias"]) == {"Python", "Rust", "Go"}
