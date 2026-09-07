import React, { useState, useEffect } from 'react';
import {
  FileText,
  Sparkles,
  Download,
  Settings,
  Briefcase,
  User,
  Github,
  Award,
  Layers,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Code2,
  ExternalLink,
  RefreshCw,
  Sliders,
  ChevronRight,
} from 'lucide-react';

const PRESET_JOBS = {
  systems: `Job Title: Systems & Network Software Engineer
Company: Cloud / Infra Lab
Responsibilities:
- Build high-performance networking pipelines using C, Go, or Rust.
- Leverage eBPF/XDP and kernel bypass mechanisms (AF_XDP) for packet filtering and routing.
- Optimize memory management, cache performance, and tail latency (p99).
- Measure throughput, latency, and CPU overhead under multi-core workloads.`,
  fullstack: `Job Title: Full Stack & Mobile Engineer
Company: High-Growth Tech
Responsibilities:
- Build modern, responsive web applications in React.js, TypeScript, and Tailwind.
- Develop cross-platform mobile apps in React Native with offline-first synchronization.
- Implement scalable REST APIs using NestJS, PostgreSQL, and Redis caching.
- Write end-to-end tests with Playwright and automate CI/CD pipelines.`,
  datascience: `Vaga: Data Scientist / Machine Learning Engineer
Empresa: Analytics & AI Solutions
Responsabilidades:
- Desenvolver e aplicar modelos de Machine Learning (Random Forest, Decision Trees, Redes Neurais).
- Pipelines de dados, crawling e processamento de grandes volumes (Python, SQL).
- Otimização de latência de inferência e throughput de predição em tempo real.
- Modelagem estatística, benchmarks de performance e álgebra linear.`,
};

export default function App() {
  // State
  const [activeTab, setActiveTab] = useState('job'); // 'job', 'profile', 'llm'
  const [rightTab, setRightTab] = useState('preview'); // 'preview', 'scores', 'latex'
  const [backendOnline, setBackendOnline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState(null);

  // Profile state
  const [profile, setProfile] = useState(null);
  const [jobDescription, setJobDescription] = useState(PRESET_JOBS.systems);
  const [language, setLanguage] = useState('en');
  const [visibleContacts, setVisibleContacts] = useState([
    'location',
    'email',
    'phone',
    'linkedin',
    'github',
    'lattes',
  ]);

  // LLM State (BYOK - Bring Your Own Key)
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState('gpt-4o-mini');

  // Generation Output
  const [result, setResult] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);

  // GitHub modal
  const [ghUsername, setGhUsername] = useState('ojoaosoares');
  const [ghLoading, setGhLoading] = useState(false);
  const [ghMessage, setGhMessage] = useState('');

  // Check health and load profile on startup
  useEffect(() => {
    checkHealth();
    loadProfile();
  }, []);

  const checkHealth = async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        setBackendOnline(true);
      }
    } catch {
      setBackendOnline(false);
    }
  };

  const loadProfile = async () => {
    try {
      const res = await fetch('/api/profile');
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        if (data.personal?.visible_items) {
          setVisibleContacts(data.personal.visible_items);
        }
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
    }
  };

  const handleToggleContact = (item) => {
    if (visibleContacts.includes(item)) {
      setVisibleContacts(visibleContacts.filter((c) => c !== item));
    } else {
      setVisibleContacts([...visibleContacts, item]);
    }
  };

  const handleGenerate = async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);
    setStatusMessage('1. Analisando vaga e ranqueando relevância...');

    try {
      const payload = {
        profile: {
          ...profile,
          personal: {
            ...profile.personal,
            visible_items: visibleContacts,
          },
        },
        job_description: jobDescription,
        language: language,
        visible_contacts: visibleContacts,
        api_key: apiKey || null,
        model: model,
        max_exps: 2,
        max_projs: 2,
        max_awards: 2,
      };

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(errData.detail || 'Falha ao compilar currículo');
      }

      const data = await res.json();
      setResult(data);

      // Convert base64 to Blob URL for iframe
      const byteChars = atob(data.pdf_base64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      setPdfUrl(blobUrl);

      setStatusMessage('Sucesso! Currículo de 1 página gerado.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleIngestGithub = async () => {
    if (!ghUsername) return;
    setGhLoading(true);
    setGhMessage('');
    try {
      const res = await fetch('/api/ingest/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: ghUsername, max_repos: 8 }),
      });
      if (res.ok) {
        const data = await res.json();
        const newProjects = data.projects || [];
        if (profile) {
          const existingTitles = new Set(profile.projects.map((p) => p.title.toLowerCase()));
          const added = newProjects.filter((p) => !existingTitles.has(p.title.toLowerCase()));
          setProfile({
            ...profile,
            projects: [...profile.projects, ...added],
          });
          setGhMessage(`Importado com sucesso! ${added.length} novos projetos com READMEs adicionados.`);
        }
      } else {
        setGhMessage('Erro ao buscar repositórios no GitHub.');
      }
    } catch {
      setGhMessage('Falha na comunicação com o backend.');
    } finally {
      setGhLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100">
      {/* Top Navbar */}
      <header className="h-14 border-b border-slate-800 px-6 flex items-center justify-between bg-slate-900/60 backdrop-blur shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-500/30">
            CG
          </div>
          <div>
            <h1 className="font-semibold text-base leading-tight tracking-tight">Curriculum-Gen</h1>
            <p className="text-xs text-slate-400">Gerador ATS de 1 Página • Google XYZ Formula</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`h-2 w-2 rounded-full ${
                backendOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
              }`}
            />
            <span className="text-slate-400">
              {backendOnline ? 'Backend Conectado (127.0.0.1:8000)' : 'Backend Desconectado'}
            </span>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading || !profile}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
              loading
                ? 'bg-slate-700 cursor-not-allowed text-slate-400'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 hover:scale-[1.02]'
            }`}
          >
            {loading ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Gerando PDF...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 text-blue-200" />
                Gerar Currículo de 1 Página
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Workspace (Split Pane) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Controls & Inputs */}
        <div className="w-[45%] border-r border-slate-800 flex flex-col bg-slate-900/20">
          {/* Tabs */}
          <div className="flex border-b border-slate-800 bg-slate-900/40 px-3 pt-2 shrink-0">
            <button
              onClick={() => setActiveTab('job')}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'job'
                  ? 'border-blue-500 text-blue-400 bg-blue-500/10 rounded-t-md'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Briefcase className="h-3.5 w-3.5" />
              Contexto da Vaga
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'profile'
                  ? 'border-blue-500 text-blue-400 bg-blue-500/10 rounded-t-md'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <User className="h-3.5 w-3.5" />
              Perfil & GitHub
            </button>
            <button
              onClick={() => setActiveTab('llm')}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'llm'
                  ? 'border-blue-500 text-blue-400 bg-blue-500/10 rounded-t-md'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="h-3.5 w-3.5" />
              LLM & Segurança (BYOK)
            </button>
          </div>

          {/* Tab Contents */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {activeTab === 'job' && (
              <div className="space-y-5">
                {/* Idioma e Presets */}
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-1">
                      Idioma do Currículo
                    </label>
                    <div className="inline-flex rounded-lg border border-slate-700 p-0.5 bg-slate-950">
                      <button
                        onClick={() => setLanguage('pt')}
                        className={`px-3 py-1 text-xs rounded-md font-medium transition ${
                          language === 'pt' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Português (PT)
                      </button>
                      <button
                        onClick={() => setLanguage('en')}
                        className={`px-3 py-1 text-xs rounded-md font-medium transition ${
                          language === 'en' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        English (EN)
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-1">
                      Presets de Vaga
                    </label>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setJobDescription(PRESET_JOBS.systems)}
                        className="px-2.5 py-1 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                      >
                        Sistemas / Kernel
                      </button>
                      <button
                        onClick={() => setJobDescription(PRESET_JOBS.fullstack)}
                        className="px-2.5 py-1 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                      >
                        Full Stack
                      </button>
                      <button
                        onClick={() => setJobDescription(PRESET_JOBS.datascience)}
                        className="px-2.5 py-1 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                      >
                        Data Science
                      </button>
                    </div>
                  </div>
                </div>

                {/* Job Description TextArea */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-1.5">
                    Descrição da Vaga Pretendida (Cole requisitos, stack e responsabilidades)
                  </label>
                  <textarea
                    rows={8}
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    placeholder="Cole aqui a descrição da vaga..."
                    className="w-full text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-200 focus:outline-none focus:border-blue-500 resize-none transition"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    O motor de busca usará este texto para calcular relevância semântica, recência e diversidade dos seus itens.
                  </p>
                </div>

                {/* Visible Contacts Selection */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-2">
                    Contatos Visíveis no Topo do Currículo
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {['location', 'email', 'phone', 'linkedin', 'github', 'lattes'].map((item) => {
                      const isSelected = visibleContacts.includes(item);
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => handleToggleContact(item)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition border ${
                            isSelected
                              ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-sm'
                              : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isSelected ? 'bg-blue-400' : 'bg-slate-600'
                            }`}
                          />
                          {item.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'profile' && profile && (
              <div className="space-y-6">
                {/* Personal Info Quick View */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-blue-400" />
                    Dados Cadastrados
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Nome Completo</span>
                      <span className="font-medium text-slate-200">{profile.personal.name}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Localização</span>
                      <span className="text-slate-300">{profile.personal.location}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">E-mail</span>
                      <span className="text-slate-300">{profile.personal.email}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">LinkedIn</span>
                      <span className="text-slate-300">{profile.personal.linkedin}</span>
                    </div>
                  </div>
                </div>

                {/* Pool Status */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-center">
                    <span className="text-xl font-bold text-blue-400">{profile.experiences?.length || 0}</span>
                    <span className="block text-[11px] text-slate-400 mt-0.5">Experiências</span>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-center">
                    <span className="text-xl font-bold text-emerald-400">{profile.projects?.length || 0}</span>
                    <span className="block text-[11px] text-slate-400 mt-0.5">Projetos</span>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-center">
                    <span className="text-xl font-bold text-purple-400">{profile.awards_and_leadership?.length || 0}</span>
                    <span className="block text-[11px] text-slate-400 mt-0.5">Prêmios / Liderança</span>
                  </div>
                </div>

                {/* GitHub Ingestor Section */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Github className="h-3.5 w-3.5 text-slate-300" />
                      Ingestão de Repositórios do GitHub
                    </h3>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    O gerador lê os <code className="text-blue-300">README.md</code> dos repositórios buscando métricas, throughput, latência e resultados.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={ghUsername}
                      onChange={(e) => setGhUsername(e.target.value)}
                      placeholder="Usuário GitHub (ex: ojoaosoares)"
                      className="flex-1 text-xs bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={handleIngestGithub}
                      disabled={ghLoading}
                      className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition flex items-center gap-1.5"
                    >
                      {ghLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                      Puxar READMEs
                    </button>
                  </div>
                  {ghMessage && (
                    <p className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-900/60 p-2 rounded-lg">
                      {ghMessage}
                    </p>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'llm' && (
              <div className="space-y-5">
                {/* Security Banner */}
                <div className="bg-blue-950/30 border border-blue-900/50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-blue-300 font-semibold text-xs">
                    <CheckCircle2 className="h-4 w-4 text-blue-400 shrink-0" />
                    Privacidade & Segurança Local (BYOK)
                  </div>
                  <p className="text-xs text-blue-200/80 leading-relaxed">
                    Sua chave de API é mantida <strong>apenas na memória</strong> da requisição local no seu navegador e no seu computador. Ela <strong>nunca é persistida em banco de dados</strong> nem enviada a servidores de terceiros.
                  </p>
                </div>

                {/* API Key Input */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-1.5">
                    Chave de API da LLM (Opcional)
                  </label>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-... ou AIzaSy... (Deixe em branco para modo Offline)"
                      className="w-full text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg pl-3 pr-10 py-2.5 text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300"
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    Compatível com <strong>OpenAI</strong>, <strong>Google Gemini</strong>, <strong>Groq</strong>, <strong>DeepSeek</strong> ou <strong>Ollama local</strong>.
                  </p>
                </div>

                {/* Model Selector */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-1.5">
                    Modelo de Linguagem
                  </label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="gpt-4o-mini">gpt-4o-mini (Rápido e Preciso)</option>
                    <option value="gpt-4o">gpt-4o (Alta Capacidade)</option>
                    <option value="gemini-2.5-flash">gemini-2.5-flash (Google Gemini)</option>
                    <option value="llama3.2">llama3.2 (Ollama Local)</option>
                  </select>
                </div>

                {/* Mode description */}
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs space-y-1">
                  <span className="text-slate-400 font-semibold block">Status da Otimização:</span>
                  {apiKey ? (
                    <span className="text-emerald-400 flex items-center gap-1.5 font-medium">
                      <Sparkles className="h-3.5 w-3.5" />
                      Modo LLM Ativo (Google XYZ com reescrita dinâmica de bullets)
                    </span>
                  ) : (
                    <span className="text-amber-400 flex items-center gap-1.5 font-medium">
                      <Layers className="h-3.5 w-3.5" />
                      Modo Offline Ativo (Filtro heurístico e negrito de métricas)
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Feedback bar */}
          {error && (
            <div className="p-3 bg-red-950/40 border-t border-red-900/60 text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}
          {statusMessage && !error && (
            <div className="p-2.5 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span>{statusMessage}</span>
            </div>
          )}
        </div>

        {/* Right Side: Live Output (PDF / Scores / LaTeX) */}
        <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
          {/* Header tabs */}
          <div className="h-11 border-b border-slate-800 px-4 flex items-center justify-between bg-slate-900/40 shrink-0">
            <div className="flex gap-2">
              <button
                onClick={() => setRightTab('preview')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                  rightTab === 'preview' ? 'bg-slate-800 text-blue-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Prévia do PDF (1 Página)
              </button>
              <button
                onClick={() => setRightTab('scores')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                  rightTab === 'scores' ? 'bg-slate-800 text-blue-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Pontuação do Match
              </button>
              <button
                onClick={() => setRightTab('latex')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                  rightTab === 'latex' ? 'bg-slate-800 text-blue-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Código LaTeX (.tex)
              </button>
            </div>

            {pdfUrl && (
              <a
                href={pdfUrl}
                download="curriculo.pdf"
                className="px-3 py-1 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 transition"
              >
                <Download className="h-3.5 w-3.5" />
                Baixar PDF
              </a>
            )}
          </div>

          {/* Right Tab Content */}
          <div className="flex-1 relative bg-slate-950 overflow-hidden">
            {rightTab === 'preview' && (
              pdfUrl ? (
                <iframe
                  src={pdfUrl}
                  title="PDF Preview"
                  className="w-full h-full border-0 bg-slate-900"
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 p-8 text-center">
                  <div className="h-16 w-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4 text-slate-600">
                    <FileText className="h-8 w-8" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-300 mb-1">Nenhum currículo gerado ainda</h3>
                  <p className="text-xs max-w-sm text-slate-500 mb-4 leading-relaxed">
                    Selecione os parâmetros desejados e clique no botão <span className="text-blue-400 font-medium">"Gerar Currículo de 1 Página"</span> para compilar seu PDF em tempo real.
                  </p>
                  <button
                    onClick={handleGenerate}
                    disabled={loading || !profile}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-lg shadow-blue-600/20 flex items-center gap-2"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Gerar Agora
                  </button>
                </div>
              )
            )}

            {rightTab === 'scores' && (
              <div className="h-full overflow-y-auto p-6 space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200 mb-1">Transparência do Motor de Busca</h3>
                  <p className="text-xs text-slate-400">
                    Veja por que cada item foi selecionado para preencher o orçamento de 1 página com base no contexto da vaga.
                  </p>
                </div>

                {result ? (
                  <div className="space-y-6">
                    {/* Experiences Section */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                        <Briefcase className="h-3.5 w-3.5 text-blue-400" />
                        Experiências Selecionadas
                      </h4>
                      <div className="space-y-3">
                        {result.selected_experiences?.map((exp, idx) => (
                          <div key={idx} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-xs text-slate-200">{exp.role} @ {exp.company}</span>
                              <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/50">
                                Score: {exp.score?.toFixed(3)}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {exp.tags?.map((t, i) => (
                                <span key={i} className="text-[10px] font-mono bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                                  {t}
                                </span>
                              ))}
                            </div>
                            <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
                              {(exp.formatted_bullets || exp.raw_bullets)?.map((b, i) => (
                                <li key={i} className="text-slate-300 text-[11px] leading-relaxed">
                                  {b.replace(/\\textbf\{([^}]+)\}/g, '$1')}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Projects Section */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5 text-emerald-400" />
                        Projetos Selecionados
                      </h4>
                      <div className="space-y-3">
                        {result.selected_projects?.map((proj, idx) => (
                          <div key={idx} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-xs text-slate-200">{proj.title} ({proj.subtitle})</span>
                              <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/50">
                                Score: {proj.score?.toFixed(3)}
                              </span>
                            </div>
                            <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
                              {(proj.formatted_bullets || proj.raw_bullets)?.map((b, i) => (
                                <li key={i} className="text-slate-300 text-[11px] leading-relaxed">
                                  {b.replace(/\\textbf\{([^}]+)\}/g, '$1')}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">
                    Gere o currículo para ver a tabela detalhada de pontuação e matching.
                  </div>
                )}
              </div>
            )}

            {rightTab === 'latex' && (
              <div className="h-full flex flex-col p-4">
                <textarea
                  readOnly
                  value={result?.tex_source || '% O código LaTeX aparecerá aqui após a compilação'}
                  className="flex-1 w-full bg-slate-900/60 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-300 focus:outline-none resize-none"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
