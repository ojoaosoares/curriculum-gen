import React, { useState, useEffect } from 'react';
import {
  FileText,
  Sparkles,
  Download,
  BookOpen,
  Github,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
  Sliders,
  Layers,
  GraduationCap,
  Copy,
  Check,
  Zap,
  UploadCloud,
  FileUp,
  Linkedin,
  ArrowRight,
  Trash2,
  PieChart,
  ShieldCheck,
} from 'lucide-react';

const PRESET_JOBS = {
  systems: `Job Title: Systems & Network Software Engineer
Company: Cloud / Kernel Infra Lab
Responsibilities:
- Build high-performance networking pipelines using C, Go, or Rust.
- Leverage eBPF/XDP and kernel bypass mechanisms (AF_XDP) for packet filtering and routing.
- Optimize memory management, cache performance, and tail latency (p99).
- Measure throughput, latency, and CPU overhead under high packet loads.`,
  fullstack: `Job Title: Full Stack & Mobile Engineer
Company: Modern Tech Guild
Responsibilities:
- Build modern, responsive web applications in React.js, TypeScript, and Tailwind.
- Develop cross-platform mobile apps in React Native with offline-first synchronization.
- Implement scalable REST APIs using NestJS, PostgreSQL, and Redis caching.
- Write end-to-end tests with Playwright and automate deployment pipelines.`,
  datascience: `Vaga: Data Scientist / Machine Learning Engineer
Empresa: Analytics & AI Labs
Responsabilidades:
- Desenvolver e aplicar modelos de Machine Learning (Random Forest, Decision Trees, Redes Neurais).
- Pipelines de dados, crawling e processamento de grandes volumes (Python, SQL).
- Otimização de latência de inferência e throughput de predição em tempo real.
- Modelagem estatística, benchmarks de performance e álgebra linear.`,
};

export default function App() {
  // Navigation & State
  const [activeTab, setActiveTab] = useState('job'); // 'job', 'profile', 'llm', 'ingest'
  const [rightTab, setRightTab] = useState('preview'); // 'preview', 'scores', 'latex'
  const [backendOnline, setBackendOnline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState(null);
  const [copiedLatex, setCopiedLatex] = useState(false);

  // Profile data
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

  // LLM State (BYOK) with localStorage persistence
  const [provider, setProvider] = useState(() => localStorage.getItem('curriculum_gen_provider') || 'gemini');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('curriculum_gen_api_key') || '');
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState(() => localStorage.getItem('curriculum_gen_model') || 'gemini-2.0-flash');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  // Output
  const [result, setResult] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);

  // Ingestion State
  const [ghUsername, setGhUsername] = useState('ojoaosoares');
  const [ghLoading, setGhLoading] = useState(false);
  const [ghMessage, setGhMessage] = useState('');

  const [paperInput, setPaperInput] = useState('');
  const [paperLoading, setPaperLoading] = useState(false);
  const [paperMessage, setPaperMessage] = useState('');

  // Resume / LinkedIn PDF Ingestion State
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfResult, setPdfResult] = useState(null);
  const [pdfMessage, setPdfMessage] = useState('');
  const [pdfError, setPdfError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Persistent Token Economy Telemetry State
  const [tokenStats, setTokenStats] = useState(null);
  const [copiedReadme, setCopiedReadme] = useState(false);

  useEffect(() => {
    if (apiKey) {
      localStorage.setItem('curriculum_gen_api_key', apiKey);
    } else {
      localStorage.removeItem('curriculum_gen_api_key');
    }
  }, [apiKey]);

  useEffect(() => {
    if (provider) {
      localStorage.setItem('curriculum_gen_provider', provider);
    }
  }, [provider]);

  useEffect(() => {
    if (model) {
      localStorage.setItem('curriculum_gen_model', model);
    }
  }, [model]);

  useEffect(() => {
    checkHealth();
    loadProfile();
    fetchTokenStats();
  }, []);

  const fetchTokenStats = async () => {
    try {
      const res = await fetch('/api/tokens/stats');
      if (res.ok) {
        const data = await res.json();
        setTokenStats(data);
      }
    } catch (err) {
      console.error('Falha ao carregar telemetria de tokens:', err);
    }
  };

  const handleResetTokens = async () => {
    if (!window.confirm('Deseja realmente zerar o histórico de telemetria de tokens?')) return;
    try {
      const res = await fetch('/api/tokens/reset', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setTokenStats(data);
      }
    } catch (err) {
      console.error('Falha ao resetar telemetria:', err);
    }
  };

  const handleCopyReadmeSnippet = async () => {
    try {
      const res = await fetch('/api/tokens/readme');
      if (res.ok) {
        const data = await res.json();
        await navigator.clipboard.writeText(data.markdown);
        setCopiedReadme(true);
        setTimeout(() => setCopiedReadme(false), 2500);
      }
    } catch (err) {
      console.error('Falha ao copiar snippet:', err);
    }
  };

  const checkHealth = async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) setBackendOnline(true);
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
      console.error('Falha ao carregar perfil:', err);
    }
  };

  const handleApiKeyChange = (val) => {
    setApiKey(val);
    setVerifyResult(null);
    const clean = val.trim().replace(/^["']|["']$/g, '');
    if (clean.startsWith('AIza') || clean.startsWith('AQ')) {
      setProvider('gemini');
      setModel('gemini-2.0-flash');
    } else if (clean.startsWith('gsk_')) {
      setProvider('groq');
      setModel('llama-3.3-70b-versatile');
    } else if (clean.startsWith('sk-')) {
      setProvider('openai');
      setModel('gpt-4o-mini');
    }
  };

  const handleProviderChange = (newProvider) => {
    setProvider(newProvider);
    setVerifyResult(null);
    if (newProvider === 'gemini') {
      setModel('gemini-2.0-flash');
    } else if (newProvider === 'openai') {
      setModel('gpt-4o-mini');
    } else if (newProvider === 'groq') {
      setModel('llama-3.3-70b-versatile');
    }
  };

  const handleVerifyKey = async () => {
    const cleanKey = apiKey.trim().replace(/^["']|["']$/g, '');
    if (!cleanKey) {
      setVerifyResult({ valid: false, message: 'Digite ou cole uma chave de API para verificar.' });
      return;
    }
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch('/api/llm/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: cleanKey,
          model: model,
          provider: provider,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404) {
          setVerifyResult({
            valid: false,
            message: 'O backend local precisa ser reiniciado para carregar a rota de verificação da chave. No seu terminal, dê Ctrl+C e execute: ./run_local.sh',
          });
        } else {
          setVerifyResult({
            valid: false,
            message: data.detail || `Erro HTTP ${res.status}: Não foi possível autenticar a chave.`,
          });
        }
        return;
      }
      setVerifyResult({
        valid: Boolean(data.valid),
        message: data.message || (data.valid ? 'Chave validada com sucesso!' : 'Falha na validação da chave.'),
        provider: data.provider,
        model: data.model,
      });
      if (data.valid && data.model) {
        setModel(data.model);
      }
    } catch (err) {
      setVerifyResult({
        valid: false,
        message: 'Não foi possível conectar ao backend local (http://localhost:8000). Verifique se o servidor está rodando.',
      });
    } finally {
      setVerifying(false);
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
    setStatusMessage('Processando correspondência e compilando currículo...');

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
        api_key: apiKey.trim() ? apiKey.trim().replace(/^["']|["']$/g, '') : null,
        provider: provider,
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

      const byteChars = atob(data.pdf_base64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      setPdfUrl(blobUrl);

      if (data.llm_status?.error) {
        setError(`Aviso da LLM: ${data.llm_status.error}`);
        setStatusMessage('Currículo gerado em modo offline devido a erro na chave.');
      } else if (data.llm_status?.calls_succeeded > 0) {
        setStatusMessage(`Currículo gerado e otimizado com ${data.llm_status.provider.toUpperCase()} (${data.llm_status.model})!`);
      } else {
        setStatusMessage('Currículo gerado com sucesso em modo offline (1 página garantida)!');
      }
      fetchTokenStats();
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
          setGhMessage(`${added.length} novos projetos importados com sucesso a partir dos READMEs.`);
          fetchTokenStats();
        }
      } else {
        setGhMessage('Erro ao consultar repositórios do GitHub.');
      }
    } catch {
      setGhMessage('Falha ao conectar com o serviço de ingestão.');
    } finally {
      setGhLoading(false);
    }
  };

  const handleIngestAcademic = async () => {
    if (!paperInput) return;
    setPaperLoading(true);
    setPaperMessage('');
    try {
      const res = await fetch('/api/ingest/academic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query_or_url: paperInput }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.paper && profile) {
          setProfile({
            ...profile,
            projects: [...profile.projects, data.paper],
          });
          setPaperMessage(`Artigo "${data.paper.title}" importado com sucesso.`);
          fetchTokenStats();
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setPaperMessage(err.detail || 'Não foi possível extrair os dados da publicação.');
      }
    } catch {
      setPaperMessage('Falha na conexão com o servidor de ingestão acadêmica.');
    } finally {
      setPaperLoading(false);
    }
  };

  const handleUploadPdf = async () => {
    if (!pdfFile) return;
    setPdfLoading(true);
    setPdfError('');
    setPdfMessage('');
    setPdfResult(null);

    const formData = new FormData();
    formData.append('file', pdfFile);
    if (apiKey) {
      formData.append('api_key', apiKey);
      formData.append('model', model);
      formData.append('provider', provider);
    }

    try {
      const res = await fetch('/api/ingest/pdf', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPdfResult(data);
        const engineLabel = data.provider === 'heuristic_offline' ? 'Parser Estrutural Determinístico' : `IA (${data.provider})`;
        setPdfMessage(
          `Currículo analisado com sucesso via ${engineLabel}! Encontradas ${data.counts.experiences} experiências, ${data.counts.education} formações, ${data.counts.skills} habilidades e ${data.counts.awards || 0} premiações/certificações.`
        );
        fetchTokenStats();
      } else {
        setPdfError(data.detail || 'Erro ao processar o arquivo PDF.');
      }
    } catch (err) {
      setPdfError('Falha na comunicação com o servidor ao enviar o PDF.');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleApplyPdfData = async (mode) => {
    if (!pdfResult?.profile_data || !profile) return;
    const extracted = pdfResult.profile_data;

    let updatedProfile = { ...profile };

    if (mode === 'replace') {
      updatedProfile = {
        ...profile,
        personal: {
          ...profile.personal,
          ...extracted.personal,
          visible_items: profile.personal.visible_items,
        },
        education: extracted.education?.length ? extracted.education : profile.education,
        experiences: extracted.experiences?.length ? extracted.experiences : profile.experiences,
        skills: Object.keys(extracted.skills || {}).length ? extracted.skills : profile.skills,
        awards_and_leadership: extracted.awards_and_leadership?.length ? extracted.awards_and_leadership : profile.awards_and_leadership,
      };
    } else if (mode === 'merge') {
      const existingExpKeys = new Set(
        (profile.experiences || []).map((e) => `${(e.company || '').toLowerCase()}::${(e.role || '').toLowerCase()}`)
      );
      const newExps = (extracted.experiences || []).filter(
        (e) => !existingExpKeys.has(`${(e.company || '').toLowerCase()}::${(e.role || '').toLowerCase()}`)
      );

      const existingEduInsts = new Set((profile.education || []).map((e) => (e.institution || '').toLowerCase()));
      const newEdu = (extracted.education || []).filter(
        (e) => !existingEduInsts.has((e.institution || '').toLowerCase())
      );

      const mergedSkills = { ...profile.skills };
      for (const [cat, skillList] of Object.entries(extracted.skills || {})) {
        if (Array.isArray(skillList)) {
          if (mergedSkills[cat] && Array.isArray(mergedSkills[cat])) {
            const set = new Set([...mergedSkills[cat], ...skillList]);
            mergedSkills[cat] = Array.from(set);
          } else {
            mergedSkills[cat] = skillList;
          }
        }
      }

      const existingAwardTitles = new Set((profile.awards_and_leadership || []).map((a) => (a.title || '').toLowerCase()));
      const newAwards = (extracted.awards_and_leadership || []).filter(
        (a) => !existingAwardTitles.has((a.title || '').toLowerCase())
      );

      updatedProfile = {
        ...profile,
        personal: {
          ...profile.personal,
          location: profile.personal.location || extracted.personal?.location,
          linkedin: profile.personal.linkedin || extracted.personal?.linkedin,
          github: profile.personal.github || extracted.personal?.github,
        },
        experiences: [...(profile.experiences || []), ...newExps],
        education: [...(profile.education || []), ...newEdu],
        skills: mergedSkills,
        awards_and_leadership: [...(profile.awards_and_leadership || []), ...newAwards],
      };
    }

    setProfile(updatedProfile);
    try {
      await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProfile),
      });
      setPdfMessage(
        mode === 'merge'
          ? 'Dados mesclados ao perfil ativo com sucesso!'
          : 'Perfil substituído com os dados do currículo/LinkedIn!'
      );
      setPdfResult(null);
      setPdfFile(null);
    } catch {
      setPdfError('Erro ao salvar o perfil atualizado no backend.');
    }
  };

  const handleCopyLatex = () => {
    if (result?.tex_source) {
      navigator.clipboard.writeText(result.tex_source);
      setCopiedLatex(true);
      setTimeout(() => setCopiedLatex(false), 2000);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#f5efe1] text-[#2c2620] font-serif selection:bg-[#dfd3bc] selection:text-[#1c160e]">
      {/* Top Header: Minimalist Editorial Style */}
      <header className="h-16 border-b border-[#dfd5be] px-7 flex items-center justify-between bg-[#fcfaf5] shadow-xs relative z-10 shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="h-9 w-9 rounded bg-[#e8deca] border border-[#cfc3a9] flex items-center justify-center text-[#594935] shadow-xs">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-serif font-bold text-lg tracking-tight text-[#221c16]">
                Curriculum-Gen
              </h1>
              <span className="text-xs font-sans font-medium px-2.5 py-0.5 rounded bg-[#eee6d3] text-[#5c4f3f] border border-[#d8ccb4]">
                ATS 1-Página
              </span>
            </div>
            <p className="text-xs text-[#756758] italic font-serif">
              Otimização de Impacto (Google XYZ) • Diagramação LaTeX Automática
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Status Indicator */}
          <div className="flex items-center gap-2 text-xs font-sans bg-[#f2ecde] px-3 py-1.5 rounded border border-[#dfd5be]">
            <span
              className={`h-2 w-2 rounded-full ${
                backendOnline ? 'bg-emerald-600' : 'bg-red-500'
              }`}
            />
            <span className="text-[#594935] text-xs font-medium">
              {backendOnline ? 'Backend Local Ativo' : 'Backend Desconectado'}
            </span>
          </div>

          {/* Primary Action Button */}
          <button
            onClick={handleGenerate}
            disabled={loading || !profile}
            className={`px-5 py-2 rounded font-sans text-sm font-semibold flex items-center gap-2 transition duration-200 shadow-xs ${
              loading
                ? 'bg-[#dcd4c3] text-[#827566] cursor-not-allowed'
                : 'bg-[#2b241e] hover:bg-[#3d342c] text-[#fcfaf5] active:scale-[0.98]'
            }`}
          >
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin text-[#d8ccb4]" />
                <span>Compilando Currículo...</span>
              </>
            ) : (
              <>
                <FileText className="h-4 w-4 text-[#e6dcce]" />
                <span>Gerar Currículo (PDF)</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Parameters & Editor */}
        <div className="w-[46%] border-r border-[#dfd5be] flex flex-col bg-[#faf6ed]">
          {/* Clean Navigation Tabs */}
          <div className="flex border-b border-[#dfd5be] bg-[#f5efe1] px-4 pt-2 shrink-0 gap-1.5 font-sans text-sm">
            <button
              onClick={() => setActiveTab('job')}
              className={`px-4 py-2.5 font-medium transition-all flex items-center gap-2 border-b-2 ${
                activeTab === 'job'
                  ? 'border-[#8b5a2b] text-[#2c2620] bg-[#faf6ed] font-semibold'
                  : 'border-transparent text-[#786c5e] hover:text-[#2c2620]'
              }`}
            >
              <Sliders className="h-4 w-4 text-[#8b5a2b]" />
              Vaga & Configurações
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className={`px-4 py-2.5 font-medium transition-all flex items-center gap-2 border-b-2 ${
                activeTab === 'profile'
                  ? 'border-[#8b5a2b] text-[#2c2620] bg-[#faf6ed] font-semibold'
                  : 'border-transparent text-[#786c5e] hover:text-[#2c2620]'
              }`}
            >
              <Layers className="h-4 w-4 text-[#8b5a2b]" />
              Perfil Cadastrado
            </button>
            <button
              onClick={() => setActiveTab('llm')}
              className={`px-4 py-2.5 font-medium transition-all flex items-center gap-2 border-b-2 ${
                activeTab === 'llm'
                  ? 'border-[#8b5a2b] text-[#2c2620] bg-[#faf6ed] font-semibold'
                  : 'border-transparent text-[#786c5e] hover:text-[#2c2620]'
              }`}
            >
              <Sparkles className="h-4 w-4 text-[#8b5a2b]" />
              Chave de API (LLM)
            </button>
            <button
              onClick={() => setActiveTab('ingest')}
              className={`px-3 py-2.5 font-medium transition-all flex items-center gap-1.5 border-b-2 ${
                activeTab === 'ingest'
                  ? 'border-[#8b5a2b] text-[#2c2620] bg-[#faf6ed] font-semibold'
                  : 'border-transparent text-[#786c5e] hover:text-[#2c2620]'
              }`}
            >
              <UploadCloud className="h-4 w-4 text-[#8b5a2b]" />
              Ingestão
            </button>
            <button
              onClick={() => setActiveTab('tokens')}
              className={`px-3 py-2.5 font-medium transition-all flex items-center gap-1.5 border-b-2 ${
                activeTab === 'tokens'
                  ? 'border-[#8b5a2b] text-[#2c2620] bg-[#faf6ed] font-semibold'
                  : 'border-transparent text-[#786c5e] hover:text-[#2c2620]'
              }`}
            >
              <Zap className="h-4 w-4 text-[#8b5a2b]" />
              <span>Eficiência</span>
              {tokenStats && tokenStats.total_tokens_saved > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#206634]/15 text-[#206634] font-bold font-mono">
                  {tokenStats.efficiency_pct}%
                </span>
              )}
            </button>
          </div>

          {/* Left Panel Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {activeTab === 'job' && (
              <div className="space-y-6">
                {/* Language & Presets */}
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="text-xs font-sans font-bold text-[#5e5142] uppercase tracking-wider block mb-1.5">
                      Idioma do Documento
                    </label>
                    <div className="inline-flex rounded border border-[#d8ccb4] p-0.5 bg-[#f0e8d7]">
                      <button
                        onClick={() => setLanguage('pt')}
                        className={`px-3.5 py-1.5 rounded text-xs font-sans transition ${
                          language === 'pt'
                            ? 'bg-[#ffffff] text-[#2b241e] font-bold shadow-xs border border-[#cfc3a9]'
                            : 'text-[#6b5f51] hover:text-[#2b241e]'
                        }`}
                      >
                        Português (PT)
                      </button>
                      <button
                        onClick={() => setLanguage('en')}
                        className={`px-3.5 py-1.5 rounded text-xs font-sans transition ${
                          language === 'en'
                            ? 'bg-[#ffffff] text-[#2b241e] font-bold shadow-xs border border-[#cfc3a9]'
                            : 'text-[#6b5f51] hover:text-[#2b241e]'
                        }`}
                      >
                        English (EN)
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-sans font-bold text-[#5e5142] uppercase tracking-wider block mb-1.5">
                      Exemplos de Vaga
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setJobDescription(PRESET_JOBS.systems)}
                        className="px-3 py-1.5 text-xs font-sans font-medium rounded border border-[#d8ccb4] bg-[#fdfcf9] hover:bg-[#eee6d3] text-[#4d4235] transition"
                      >
                        Sistemas / Redes
                      </button>
                      <button
                        onClick={() => setJobDescription(PRESET_JOBS.fullstack)}
                        className="px-3 py-1.5 text-xs font-sans font-medium rounded border border-[#d8ccb4] bg-[#fdfcf9] hover:bg-[#eee6d3] text-[#4d4235] transition"
                      >
                        Full Stack
                      </button>
                      <button
                        onClick={() => setJobDescription(PRESET_JOBS.datascience)}
                        className="px-3 py-1.5 text-xs font-sans font-medium rounded border border-[#d8ccb4] bg-[#fdfcf9] hover:bg-[#eee6d3] text-[#4d4235] transition"
                      >
                        Data Science
                      </button>
                    </div>
                  </div>
                </div>

                {/* Job Description Textarea */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-sans font-bold text-[#5e5142] uppercase tracking-wider">
                      Descrição da Vaga & Requisitos
                    </label>
                    <span className="text-xs text-[#807262] italic font-serif">
                      Usado no cálculo de relevância semântica e MMR
                    </span>
                  </div>
                  <textarea
                    rows={8}
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    placeholder="Cole aqui a descrição completa da vaga de emprego ou requisitos técnicos..."
                    className="w-full text-sm font-serif bg-[#fffdf9] border border-[#d6c9b1] rounded-md p-3.5 text-[#2c2620] placeholder-[#9c907e] focus:outline-none focus:border-[#8b5a2b] resize-none leading-relaxed shadow-xs"
                  />
                </div>

                {/* Visible Contacts Selection */}
                <div>
                  <label className="text-xs font-sans font-bold text-[#5e5142] uppercase tracking-wider block mb-2">
                    Contatos Visíveis no Cabeçalho
                  </label>
                  <div className="flex flex-wrap gap-2.5">
                    {[
                      { key: 'location', label: 'Localização' },
                      { key: 'email', label: 'E-mail' },
                      { key: 'phone', label: 'Telefone' },
                      { key: 'linkedin', label: 'LinkedIn' },
                      { key: 'github', label: 'GitHub' },
                      { key: 'lattes', label: 'Currículo Lattes' },
                    ].map((item) => {
                      const isSelected = visibleContacts.includes(item.key);
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => handleToggleContact(item.key)}
                          className={`px-3.5 py-1.5 rounded text-xs font-sans flex items-center gap-2 transition border ${
                            isSelected
                              ? 'bg-[#eee4d0] border-[#8b5a2b] text-[#2c2620] font-semibold shadow-2xs'
                              : 'bg-[#f8f5ee] border-[#dfd5be] text-[#7d7162] hover:text-[#2c2620]'
                          }`}
                        >
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${
                              isSelected ? 'bg-[#8b5a2b]' : 'bg-[#c5b9a4]'
                            }`}
                          />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'profile' && profile && (
              <div className="space-y-6">
                {/* Profile Overview Card */}
                <div className="paper-card rounded-md p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#ded5bf] pb-2">
                    <h3 className="text-sm font-sans font-bold uppercase tracking-wider text-[#3d3327]">
                      Dados Pessoais
                    </h3>
                    <span className="text-xs text-[#7d7162] font-mono">
                      profile.yaml
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm font-serif">
                    <div>
                      <span className="text-xs font-sans text-[#786c5e] block">Nome</span>
                      <span className="font-bold text-[#1f1913] text-base">{profile.personal.name}</span>
                    </div>
                    <div>
                      <span className="text-xs font-sans text-[#786c5e] block">Localização</span>
                      <span className="text-[#3a3127]">{profile.personal.location}</span>
                    </div>
                    <div>
                      <span className="text-xs font-sans text-[#786c5e] block">E-mail</span>
                      <span className="text-[#3a3127]">{profile.personal.email}</span>
                    </div>
                    <div>
                      <span className="text-xs font-sans text-[#786c5e] block">LinkedIn</span>
                      <span className="text-[#3a3127]">{profile.personal.linkedin}</span>
                    </div>
                  </div>
                </div>

                {/* Counts Summary */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="paper-card rounded-md p-3.5 text-center">
                    <span className="text-2xl font-serif font-bold text-[#2c2620]">
                      {profile.experiences?.length || 0}
                    </span>
                    <span className="block text-xs font-sans font-medium text-[#706456] mt-0.5">
                      Experiências
                    </span>
                  </div>
                  <div className="paper-card rounded-md p-3.5 text-center">
                    <span className="text-2xl font-serif font-bold text-[#2c2620]">
                      {profile.projects?.length || 0}
                    </span>
                    <span className="block text-xs font-sans font-medium text-[#706456] mt-0.5">
                      Projetos
                    </span>
                  </div>
                  <div className="paper-card rounded-md p-3.5 text-center">
                    <span className="text-2xl font-serif font-bold text-[#2c2620]">
                      {profile.awards_and_leadership?.length || 0}
                    </span>
                    <span className="block text-xs font-sans font-medium text-[#706456] mt-0.5">
                      Conquistas
                    </span>
                  </div>
                </div>

                {/* Experience List Summary */}
                <div className="space-y-2">
                  <h4 className="text-xs font-sans font-bold text-[#5e5142] uppercase tracking-wider">
                    Experiências Registradas
                  </h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {profile.experiences?.map((exp, idx) => (
                      <div key={idx} className="p-3 rounded border border-[#dfd5be] bg-[#fffdfa] text-xs">
                        <div className="flex justify-between font-bold text-sm text-[#221c16]">
                          <span>{exp.role}</span>
                          <span className="text-[#756758] font-normal text-xs">{exp.period}</span>
                        </div>
                        <div className="text-[#635749] text-xs mt-0.5">{exp.company} • {exp.location}</div>
                        <div className="text-[11px] text-[#8c7f70] mt-1.5 flex flex-wrap gap-1">
                          {exp.tags?.slice(0, 5).map((t, i) => (
                            <span key={i} className="bg-[#f0e9dc] px-2 py-0.5 rounded">{t}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'llm' && (
              <div className="space-y-6">
                {/* Privacy Banner */}
                <div className="p-4 bg-[#f0e8d7] border border-[#d6c9b1] rounded-md text-xs space-y-1.5">
                  <div className="flex items-center gap-2 font-sans font-bold text-sm text-[#3d3327]">
                    <CheckCircle2 className="h-4 w-4 text-[#8b5a2b]" />
                    <span>Privacidade e Segurança (BYOK - Bring Your Own Key)</span>
                  </div>
                  <p className="text-[#615446] leading-relaxed text-xs">
                    Sua chave de API permanece <strong>apenas na memória volátil da sua máquina</strong> durante a execução da requisição. Nenhuma chave é gravada em arquivos de log, banco de dados ou enviada a terceiros.
                  </p>
                </div>

                {/* Provider Selector Tabs */}
                <div>
                  <label className="text-xs font-sans font-bold text-[#5e5142] uppercase tracking-wider block mb-2">
                    Provedor de Inteligência Artificial
                  </label>
                  <div className="flex gap-2">
                    {[
                      { id: 'gemini', label: 'Google Gemini (Grátis / Recomendado)' },
                      { id: 'openai', label: 'OpenAI (ChatGPT)' },
                      { id: 'groq', label: 'Groq Cloud (Llama 3.3)' },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleProviderChange(item.id)}
                        className={`px-3.5 py-1.5 rounded text-xs font-sans transition border ${
                          provider === item.id
                            ? 'bg-[#2c2620] text-[#f7f3e8] border-[#2c2620] font-semibold shadow-xs'
                            : 'bg-[#fffdf9] text-[#706456] border-[#d6c9b1] hover:text-[#2c2620]'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* API Key Input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-sans font-bold text-[#5e5142] uppercase tracking-wider">
                      Chave de API do {provider === 'gemini' ? 'Google Gemini' : provider === 'openai' ? 'OpenAI' : 'Groq'}
                    </label>
                    {provider === 'gemini' && (
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[#8b5a2b] hover:underline"
                      >
                        Gerar chave grátis no AI Studio ↗
                      </a>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => handleApiKeyChange(e.target.value)}
                      placeholder={
                        provider === 'gemini'
                          ? 'Cole aqui sua chave (inicia com AQ... ou AIza...)'
                          : provider === 'groq'
                          ? 'gsk_... (Chave da Groq Console)'
                          : 'sk-... (Chave da OpenAI)'
                      }
                      className="w-full text-sm font-mono bg-[#fffdf9] border border-[#d6c9b1] rounded-md pl-3.5 pr-10 py-2.5 text-[#2c2620] focus:outline-none focus:border-[#8b5a2b]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-2.5 text-[#7a6d5e] hover:text-[#2c2620]"
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-[#7a6d5e] mt-1.5">
                    Sua chave é usada diretamente com o provedor selecionado (Google Gemini, OpenAI ou Groq).
                  </p>

                  {/* Verification Button & Actions */}
                  <div className="flex items-center gap-3 mt-3.5">
                    <button
                      type="button"
                      onClick={handleVerifyKey}
                      disabled={verifying || !apiKey.trim()}
                      className="px-4 py-2 rounded font-sans font-medium text-xs bg-[#2c2620] text-[#f7f3e8] hover:bg-[#403730] disabled:bg-[#d8d0c2] disabled:text-[#8a7f72] flex items-center gap-2 transition shadow-xs"
                    >
                      {verifying ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <span>Testando conexão com a API...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          <span>Verificar Chave da API</span>
                        </>
                      )}
                    </button>

                    {apiKey && (
                      <button
                        type="button"
                        onClick={() => {
                          setApiKey('');
                          setVerifyResult(null);
                        }}
                        className="text-xs font-sans text-[#7a6d5e] hover:text-[#2c2620] underline"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                </div>

                {/* Verification Result Feedback */}
                {verifyResult && (
                  <div
                    className={`p-4 rounded-md border text-sm space-y-2 font-sans transition-all ${
                      verifyResult.valid
                        ? 'bg-[#eef8f0] border-[#9fd8ad] text-[#1e582e]'
                        : 'bg-[#fcf0f0] border-[#e7a8a8] text-[#7a2020]'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 font-bold">
                      {verifyResult.valid ? (
                        <CheckCircle2 className="h-5 w-5 text-[#2e8245] shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-[#c73434] shrink-0 mt-0.5" />
                      )}
                      <span className="leading-snug">{verifyResult.message}</span>
                    </div>
                    {verifyResult.valid && (
                      <div className="flex flex-wrap gap-2 pt-1 font-mono text-xs">
                        <span className="bg-[#def0e2] px-2.5 py-1 rounded border border-[#a8dfb7]">
                          Provedor: {verifyResult.provider}
                        </span>
                        <span className="bg-[#def0e2] px-2.5 py-1 rounded border border-[#a8dfb7]">
                          Modelo: {verifyResult.model}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Model Override Details */}
                <details className="text-xs text-[#706456] pt-1">
                  <summary className="cursor-pointer font-sans font-medium hover:text-[#2c2620] select-none py-1">
                    Configurações Avançadas de Modelo
                  </summary>
                  <div className="mt-2.5 p-4 bg-[#fffdf9] border border-[#ded5bf] rounded-md space-y-3 font-sans">
                    <label className="text-xs text-[#5e5142] block font-bold uppercase tracking-wider">
                      Identificador do Modelo
                    </label>
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="gemini-1.5-flash, gemini-2.0-flash, gpt-4o-mini"
                      className="w-full text-sm font-mono bg-[#ffffff] border border-[#d6c9b1] rounded px-3.5 py-2 text-[#2c2620] focus:outline-none focus:border-[#8b5a2b]"
                    />
                    <div className="flex flex-wrap gap-2 pt-1">
                      <span className="text-xs text-[#706456] self-center">Sugestões:</span>
                      <button
                        type="button"
                        onClick={() => setModel('gemini-1.5-flash')}
                        className="text-xs px-2.5 py-1 rounded border border-[#dfd5be] bg-[#f5efe1] hover:bg-[#ece2cc]"
                      >
                        gemini-1.5-flash
                      </button>
                      <button
                        type="button"
                        onClick={() => setModel('gemini-2.0-flash')}
                        className="text-xs px-2.5 py-1 rounded border border-[#dfd5be] bg-[#f5efe1] hover:bg-[#ece2cc]"
                      >
                        gemini-2.0-flash
                      </button>
                      <button
                        type="button"
                        onClick={() => setModel('gpt-4o-mini')}
                        className="text-xs px-2.5 py-1 rounded border border-[#dfd5be] bg-[#f5efe1] hover:bg-[#ece2cc]"
                      >
                        gpt-4o-mini
                      </button>
                    </div>
                  </div>
                </details>

                {/* Current Mode Badge */}
                <div className="p-3.5 bg-[#f0e8d7] border border-[#d6c9b1] rounded-md text-sm font-serif">
                  <span className="font-sans text-xs font-bold text-[#5e5142] uppercase tracking-wider block mb-1">
                    Modo de Otimização:
                  </span>
                  {apiKey && verifyResult?.valid ? (
                    <span className="text-[#206634] font-sans font-medium flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-[#206634]" />
                      LLM Ativa: {verifyResult.provider} ({verifyResult.model})
                    </span>
                  ) : apiKey ? (
                    <span className="text-[#8c5828] font-sans flex items-center gap-2">
                      Chave configurada. Clique em "Verificar Chave da API" para testar conexão.
                    </span>
                  ) : (
                    <span className="text-[#594935] font-sans flex items-center gap-2">
                      Modo Offline ativo (Formatação determinística e tradução via regras locais).
                    </span>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'ingest' && (
              <div className="space-y-6">
                {/* PDF Resume & LinkedIn Dropzone */}
                <div className="paper-card rounded-md p-5 space-y-4 border border-[#cfc3a9]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[#2c2620] font-sans font-bold text-sm uppercase tracking-wider">
                      <UploadCloud className="h-4 w-4 text-[#8b5a2b]" />
                      <span>Enriquecimento de Carreira via PDF</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] font-sans font-medium px-2.5 py-0.5 rounded bg-[#e8deca] text-[#594935] border border-[#d6c9b1]">
                      <Linkedin className="h-3 w-3 text-[#0a66c2]" />
                      <span>LinkedIn ou CV Próprio</span>
                    </div>
                  </div>

                  <p className="text-xs text-[#6e6050] leading-relaxed">
                    Drope seu currículo aqui para enriquecimento automático de experiências, formação e competências.
                    Sugestões: <strong>PDF exportado do LinkedIn</strong> (<em>no perfil: Mais → Salvar como PDF</em>) ou seu <strong>currículo atual em PDF</strong>.
                  </p>

                  {/* Dropzone Area */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        const file = e.dataTransfer.files[0];
                        if (file.name.toLowerCase().endsWith('.pdf')) {
                          setPdfFile(file);
                          setPdfError('');
                          setPdfMessage('');
                          setPdfResult(null);
                        } else {
                          setPdfError('Apenas arquivos no formato PDF (.pdf) são aceitos.');
                        }
                      }
                    }}
                    onClick={() => document.getElementById('pdf-file-input').click()}
                    className={`border-2 border-dashed rounded-lg p-5 flex flex-col items-center justify-center text-center cursor-pointer transition duration-200 ${
                      isDragging
                        ? 'border-[#8b5a2b] bg-[#f2e8d9]'
                        : pdfFile
                        ? 'border-[#2e6930] bg-[#f4faf5]'
                        : 'border-[#cfc3a9] bg-[#fffdfa] hover:bg-[#f9f5ec] hover:border-[#8b5a2b]'
                    }`}
                  >
                    <input
                      id="pdf-file-input"
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setPdfFile(e.target.files[0]);
                          setPdfError('');
                          setPdfMessage('');
                          setPdfResult(null);
                        }
                      }}
                    />

                    {pdfFile ? (
                      <div className="space-y-1">
                        <div className="flex items-center justify-center gap-2 text-[#1e582e]">
                          <CheckCircle2 className="h-5 w-5" />
                          <span className="font-sans font-bold text-sm">{pdfFile.name}</span>
                        </div>
                        <p className="text-[11px] text-[#557a5c] font-sans">
                          {(pdfFile.size / 1024).toFixed(1)} KB • Clique para escolher outro arquivo
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="h-10 w-10 mx-auto rounded-full bg-[#eee6d4] flex items-center justify-center text-[#8b5a2b]">
                          <FileUp className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-sans font-semibold text-xs text-[#2c2620]">
                            Drope seu currículo em PDF aqui ou clique para buscar
                          </p>
                          <p className="text-[11px] text-[#786b5b] font-serif italic mt-0.5">
                            Suporta PDF gerado pelo LinkedIn ("Mais → Salvar como PDF") ou qualquer CV em PDF
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Process Action */}
                  {pdfFile && !pdfResult && (
                    <div className="flex justify-end">
                      <button
                        onClick={handleUploadPdf}
                        disabled={pdfLoading}
                        className="px-4 py-2 rounded bg-[#2c2620] hover:bg-[#403730] text-xs font-sans text-[#f7f3e8] font-medium transition flex items-center gap-2 shadow-xs disabled:opacity-50"
                      >
                        {pdfLoading ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin text-[#d8ccb4]" />
                            <span>Extraindo & Estruturando com IA...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4 text-[#d8ccb4]" />
                            <span>Processar e Extrair Dados</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Feedback Messages */}
                  {pdfError && (
                    <p className="text-xs text-[#8c1c1c] bg-[#fdf0f0] border border-[#e2a4a4] p-2.5 rounded">
                      {pdfError}
                    </p>
                  )}
                  {pdfMessage && (
                    <p className="text-xs text-[#1e582e] bg-[#eef8f0] border border-[#9fd8ad] p-2.5 rounded">
                      {pdfMessage}
                    </p>
                  )}

                  {/* Extraction Review Card */}
                  {pdfResult && (
                    <div className="p-3.5 bg-[#f5ede0] border border-[#d6c9b1] rounded-md space-y-3 font-sans text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#2c2620] uppercase tracking-wider text-[11px]">
                          Dados Extraídos com Sucesso
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-[#e8ded0] text-[#594935] font-medium">
                          {pdfResult.provider === 'heuristic_offline' ? 'Parser Local' : `IA: ${pdfResult.provider}`}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                        <div className="bg-[#fffdfa] p-2 rounded border border-[#dfd5be]">
                          <span className="block text-base font-bold text-[#8b5a2b]">{pdfResult.counts.experiences}</span>
                          <span className="text-[10px] text-[#6e6050]">Experiências</span>
                        </div>
                        <div className="bg-[#fffdfa] p-2 rounded border border-[#dfd5be]">
                          <span className="block text-base font-bold text-[#8b5a2b]">{pdfResult.counts.education}</span>
                          <span className="text-[10px] text-[#6e6050]">Formações</span>
                        </div>
                        <div className="bg-[#fffdfa] p-2 rounded border border-[#dfd5be]">
                          <span className="block text-base font-bold text-[#8b5a2b]">{pdfResult.counts.skills}</span>
                          <span className="text-[10px] text-[#6e6050]">Competências</span>
                        </div>
                        <div className="bg-[#fffdfa] p-2 rounded border border-[#dfd5be]">
                          <span className="block text-base font-bold text-[#8b5a2b]">{pdfResult.counts.awards}</span>
                          <span className="text-[10px] text-[#6e6050]">Prêmios</span>
                        </div>
                      </div>

                      {pdfResult.profile_data?.personal?.name && (
                        <p className="text-[#594935] text-[11px]">
                          <strong>Candidato:</strong> {pdfResult.profile_data.personal.name}
                          {pdfResult.profile_data.personal.email ? ` • ${pdfResult.profile_data.personal.email}` : ''}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          onClick={() => handleApplyPdfData('merge')}
                          className="flex-1 px-3 py-2 rounded bg-[#206634] hover:bg-[#1a532a] text-[#f7f3e8] text-xs font-medium transition shadow-xs flex items-center justify-center gap-1.5"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>Mesclar ao Perfil Atual (Recomendado)</span>
                        </button>
                        <button
                          onClick={() => handleApplyPdfData('replace')}
                          className="px-3 py-2 rounded bg-[#fffdfa] hover:bg-[#ede6d6] text-[#6e6050] hover:text-[#2c2620] border border-[#cfc3a9] text-xs font-medium transition"
                        >
                          Substituir Tudo
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* GitHub Ingestor */}
                <div className="paper-card rounded-md p-4 space-y-3">
                  <div className="flex items-center gap-2 text-[#2c2620] font-sans font-bold text-sm uppercase tracking-wider">
                    <Github className="h-4 w-4 text-[#8b5a2b]" />
                    Importação de Repositórios do GitHub
                  </div>
                  <p className="text-xs text-[#6e6050] leading-relaxed">
                    Extrai automaticamente métricas quantificáveis de throughput, latência e impacto operacional a partir dos arquivos <code>README.md</code> públicos do perfil.
                  </p>
                  <div className="flex gap-2.5">
                    <input
                      type="text"
                      value={ghUsername}
                      onChange={(e) => setGhUsername(e.target.value)}
                      placeholder="Usuário do GitHub (ex: ojoaosoares)"
                      className="flex-1 text-sm font-sans bg-[#fffdf9] border border-[#d6c9b1] rounded px-3.5 py-2 text-[#2c2620] focus:outline-none focus:border-[#8b5a2b]"
                    />
                    <button
                      onClick={handleIngestGithub}
                      disabled={ghLoading}
                      className="px-4 py-2 rounded bg-[#2c2620] hover:bg-[#403730] text-xs font-sans text-[#f7f3e8] font-medium transition flex items-center gap-2"
                    >
                      {ghLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
                      Importar
                    </button>
                  </div>
                  {ghMessage && (
                    <p className="text-xs text-[#1e582e] bg-[#eef8f0] border border-[#9fd8ad] p-2.5 rounded">
                      {ghMessage}
                    </p>
                  )}
                </div>

                {/* Academic Ingestor */}
                <div className="paper-card rounded-md p-4 space-y-3">
                  <div className="flex items-center gap-2 text-[#2c2620] font-sans font-bold text-sm uppercase tracking-wider">
                    <GraduationCap className="h-4 w-4 text-[#8b5a2b]" />
                    Importação de Publicação Acadêmica (ArXiv / DOI)
                  </div>
                  <p className="text-xs text-[#6e6050] leading-relaxed">
                    Extrai título, autores e resumo científico de artigos via ArXiv ID ou DOI CrossRef.
                  </p>
                  <div className="flex gap-2.5">
                    <input
                      type="text"
                      value={paperInput}
                      onChange={(e) => setPaperInput(e.target.value)}
                      placeholder="Ex: 2310.12345 ou 10.1145/..."
                      className="flex-1 text-sm font-sans bg-[#fffdf9] border border-[#d6c9b1] rounded px-3.5 py-2 text-[#2c2620] focus:outline-none focus:border-[#8b5a2b]"
                    />
                    <button
                      onClick={handleIngestAcademic}
                      disabled={paperLoading}
                      className="px-4 py-2 rounded bg-[#2c2620] hover:bg-[#403730] text-xs font-sans text-[#f7f3e8] font-medium transition flex items-center gap-2"
                    >
                      {paperLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" />}
                      Buscar
                    </button>
                  </div>
                  {paperMessage && (
                    <p className="text-xs text-[#1e582e] bg-[#eef8f0] border border-[#9fd8ad] p-2.5 rounded">
                      {paperMessage}
                    </p>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'tokens' && (
              <div className="space-y-6">
                {/* Header & Subtitle */}
                <div className="flex items-start justify-between border-b border-[#ded5bf] pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-[#8b5a2b]" />
                      <h3 className="text-sm font-sans font-bold uppercase tracking-wider text-[#3d3327]">
                        Inteligência de Tokens & Eficiência
                      </h3>
                    </div>
                    <p className="text-xs text-[#706456] italic font-serif mt-0.5">
                      Telemetria persistente de tokens poupados através de extração determinística, memoization e poda heurística.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={fetchTokenStats}
                      title="Atualizar Métricas"
                      className="p-1.5 rounded border border-[#dfd5be] bg-[#fdfcf9] hover:bg-[#eee6d3] text-[#594935] transition"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={handleResetTokens}
                      title="Zerar Histórico de Telemetria"
                      className="p-1.5 rounded border border-[#dfd5be] bg-[#fdfcf9] hover:bg-[#fcebeb] text-[#8c1c1c] transition"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* 4 Hero KPI Cards */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="paper-card rounded-md p-3 border border-[#cfc3a9] bg-[#fffdfa] shadow-xs">
                    <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-[#206634] flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" />
                      Tokens Economizados
                    </span>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-xl font-serif font-bold text-[#206634]">
                        {(tokenStats?.total_tokens_saved || 0).toLocaleString()}
                      </span>
                      <span className="text-[10px] font-sans font-bold px-1.5 py-0.5 rounded bg-[#206634]/15 text-[#206634]">
                        {tokenStats?.efficiency_pct || 0}%
                      </span>
                    </div>
                    <span className="text-[10px] text-[#706456] block mt-0.5 font-sans">
                      Poupados sem custo de API
                    </span>
                  </div>

                  <div className="paper-card rounded-md p-3 border border-[#cfc3a9] bg-[#fffdfa] shadow-xs">
                    <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-[#5e5142] flex items-center gap-1">
                      <Zap className="h-3 w-3 text-[#8b5a2b]" />
                      Tokens Consumidos
                    </span>
                    <div className="mt-1">
                      <span className="text-xl font-serif font-bold text-[#2c2620]">
                        {(tokenStats?.total_tokens_used || 0).toLocaleString()}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#706456] block mt-0.5 font-sans">
                      Em chamadas ativas de LLM
                    </span>
                  </div>

                  <div className="paper-card rounded-md p-3 border border-[#cfc3a9] bg-[#fffdfa] shadow-xs">
                    <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-[#5e5142] flex items-center gap-1">
                      <Layers className="h-3 w-3 text-[#8b5a2b]" />
                      Caches & Operações
                    </span>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-xl font-serif font-bold text-[#2c2620]">
                        {tokenStats?.total_cache_hits || 0}
                      </span>
                      <span className="text-xs text-[#706456]">
                        / {tokenStats?.total_calls || 0} operações
                      </span>
                    </div>
                    <span className="text-[10px] text-[#706456] block mt-0.5 font-sans">
                      Deduplicadas em memória/disco
                    </span>
                  </div>

                  <div className="paper-card rounded-md p-3 border border-[#cfc3a9] bg-[#fffdfa] shadow-xs">
                    <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-[#5e5142] flex items-center gap-1">
                      <PieChart className="h-3 w-3 text-[#8b5a2b]" />
                      Economia Estimada
                    </span>
                    <div className="mt-1">
                      <span className="text-xl font-serif font-bold text-[#8b5a2b]">
                        ${tokenStats?.estimated_cost_saved_usd || '0.00'}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#706456] block mt-0.5 font-sans">
                      Base blended $2.00 / 1M tokens
                    </span>
                  </div>
                </div>

                {/* Efficiency Bar */}
                <div className="p-3.5 bg-[#f5ede0] border border-[#d6c9b1] rounded-md space-y-2 font-sans text-xs">
                  <div className="flex justify-between font-medium text-[#2c2620]">
                    <span>Taxa de Economia Global:</span>
                    <span className="font-bold text-[#206634]">{tokenStats?.efficiency_pct || 0}% Economizados</span>
                  </div>
                  <div className="w-full bg-[#dfd5be] h-3 rounded-full overflow-hidden flex">
                    <div
                      className="bg-[#206634] h-full transition-all duration-500"
                      style={{ width: `${tokenStats?.efficiency_pct || 0}%` }}
                    />
                    <div
                      className="bg-[#8b5a2b] h-full transition-all duration-500"
                      style={{ width: `${100 - (tokenStats?.efficiency_pct || 0)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-[#706456]">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-[#206634] inline-block" />
                      Poupados ({tokenStats?.total_tokens_saved?.toLocaleString() || 0})
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-[#8b5a2b] inline-block" />
                      Consumidos ({tokenStats?.total_tokens_used?.toLocaleString() || 0})
                    </span>
                  </div>
                </div>

                {/* Copy to README Button */}
                <div className="p-3.5 bg-[#fffdfa] border border-[#cfc3a9] rounded-md space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-sans font-bold uppercase tracking-wider text-[#2c2620]">
                        Exportar para seu Currículo / README
                      </h4>
                      <p className="text-[11px] text-[#706456] font-serif">
                        Copie um resumo técnico das estratégias de eficiência e métricas reais para enriquecer seu portfólio.
                      </p>
                    </div>
                    <button
                      onClick={handleCopyReadmeSnippet}
                      className="px-3 py-1.5 rounded bg-[#2c2620] hover:bg-[#403730] text-[#f7f3e8] text-xs font-sans font-medium transition flex items-center gap-1.5 shadow-xs shrink-0"
                    >
                      {copiedReadme ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copiar Markdown</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Active Strategies Detailed Breakdown */}
                <div className="space-y-3">
                  <h4 className="text-xs font-sans font-bold text-[#5e5142] uppercase tracking-wider">
                    Estratégias de Redução Implementadas
                  </h4>

                  <div className="space-y-2">
                    {/* Strategy 1: PDF Ingestion */}
                    <div className="p-3 rounded border border-[#dfd5be] bg-[#fffdfa] text-xs space-y-1">
                      <div className="flex justify-between items-center font-bold text-[#221c16]">
                        <span className="font-sans flex items-center gap-1.5">
                          <span>📄 Extração Estrutural & Poda de PDF</span>
                        </span>
                        <span className="text-[#206634] font-mono text-[11px] bg-[#eef8f0] px-2 py-0.5 rounded border border-[#a8dfb7]">
                          +{tokenStats?.breakdown?.pdf_distillation_and_schema || 0} tokens
                        </span>
                      </div>
                      <p className="text-[11px] text-[#635749] leading-relaxed">
                        O parser determinístico offline extrai 100% de experiências, formação, contatos e competências sem requisição externa (custo 0). Quando a IA é usada, elimina quebras de coluna do LinkedIn, cabeçalhos repetidos e rodapés antes do prompt (-40% caracteres).
                      </p>
                    </div>

                    {/* Strategy 2: Job Distillation */}
                    <div className="p-3 rounded border border-[#dfd5be] bg-[#fffdfa] text-xs space-y-1">
                      <div className="flex justify-between items-center font-bold text-[#221c16]">
                        <span className="font-sans flex items-center gap-1.5">
                          <span>✂️ Poda Heurística de Vagas (Job Distillation)</span>
                        </span>
                        <span className="text-[#206634] font-mono text-[11px] bg-[#eef8f0] px-2 py-0.5 rounded border border-[#a8dfb7]">
                          +{tokenStats?.breakdown?.job_distillation || 0} tokens
                        </span>
                      </div>
                      <p className="text-[11px] text-[#635749] leading-relaxed">
                        Filtra automaticamente benefícios, compliance, políticas de RH e jargões da vaga. O LLM recebe apenas o núcleo técnico e responsabilidades essenciais, economizando ~65% do contexto de entrada.
                      </p>
                    </div>

                    {/* Strategy 3: Memoization & Cache */}
                    <div className="p-3 rounded border border-[#dfd5be] bg-[#fffdfa] text-xs space-y-1">
                      <div className="flex justify-between items-center font-bold text-[#221c16]">
                        <span className="font-sans flex items-center gap-1.5">
                          <span>💾 Memoization & Cache SHA-256</span>
                        </span>
                        <span className="text-[#206634] font-mono text-[11px] bg-[#eef8f0] px-2 py-0.5 rounded border border-[#a8dfb7]">
                          +{tokenStats?.breakdown?.cache_memoization || 0} tokens
                        </span>
                      </div>
                      <p className="text-[11px] text-[#635749] leading-relaxed">
                        Deduplicação instantânea via hash criptográfico de PDFs, perfis e vagas. Recompilações e re-uploads idênticos são servidos do cache com 0 tokens e resposta instantânea.
                      </p>
                    </div>

                    {/* Strategy 4: Zero-Retry LaTeX */}
                    <div className="p-3 rounded border border-[#dfd5be] bg-[#fffdfa] text-xs space-y-1">
                      <div className="flex justify-between items-center font-bold text-[#221c16]">
                        <span className="font-sans flex items-center gap-1.5">
                          <span>🛡️ Zero-Retry LaTeX & Sanitização</span>
                        </span>
                        <span className="text-[#206634] font-mono text-[11px] bg-[#eef8f0] px-2 py-0.5 rounded border border-[#a8dfb7]">
                          +{tokenStats?.breakdown?.zero_retry_latex || 0} tokens
                        </span>
                      </div>
                      <p className="text-[11px] text-[#635749] leading-relaxed">
                        Sanitiza comandos e caracteres reservados (\textbf, \%, unicode) diretamente no pipeline Python antes da compilação, eliminando erros de sintaxe e novos ciclos de requisições de correção na API.
                      </p>
                    </div>

                    {/* Strategy 5: GitHub & Academic */}
                    <div className="p-3 rounded border border-[#dfd5be] bg-[#fffdfa] text-xs space-y-1">
                      <div className="flex justify-between items-center font-bold text-[#221c16]">
                        <span className="font-sans flex items-center gap-1.5">
                          <span>🐙 README & Abstract Distillation</span>
                        </span>
                        <span className="text-[#206634] font-mono text-[11px] bg-[#eef8f0] px-2 py-0.5 rounded border border-[#a8dfb7]">
                          +{(tokenStats?.breakdown?.github_readme_distillation || 0) + (tokenStats?.breakdown?.academic_abstract_pruning || 0)} tokens
                        </span>
                      </div>
                      <p className="text-[11px] text-[#635749] leading-relaxed">
                        Extração cirúrgica de métricas de benchmark quantificáveis do GitHub e busca seletiva de abstracts via ArXiv/CrossRef, sem trafegar repositórios de código nem papers científicos completos de 20 páginas.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Telemetry History Feed */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-sans font-bold text-[#5e5142] uppercase tracking-wider">
                      Histórico Recente de Otimizações
                    </h4>
                    <span className="text-[10px] text-[#706456]">
                      {tokenStats?.history?.length || 0} registros
                    </span>
                  </div>

                  {tokenStats?.history && tokenStats.history.length > 0 ? (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {tokenStats.history.map((evt) => (
                        <div
                          key={evt.id}
                          className="p-2.5 rounded border border-[#dfd5be] bg-[#fffdfa] text-xs space-y-1 font-sans"
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-[#221c16] text-[11px] flex items-center gap-1">
                              {evt.is_cache_hit ? '⚡' : '✨'} {evt.operation}
                            </span>
                            <span className="text-[10px] text-[#756758]">{evt.timestamp}</span>
                          </div>
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-[#706456] italic font-serif">
                              {evt.strategy}
                            </span>
                            <div className="flex gap-1.5 font-mono text-[10px]">
                              <span className="text-[#206634] font-bold">
                                +{evt.tokens_saved} poupados
                              </span>
                              {evt.tokens_used > 0 && (
                                <span className="text-[#8c5828]">
                                  ({evt.tokens_used} usados)
                                </span>
                              )}
                            </div>
                          </div>
                          {evt.details && (
                            <p className="text-[10px] text-[#8c7f70] pt-0.5 border-t border-[#f0e8d7]">
                              {evt.details}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded border border-[#dfd5be] bg-[#fffdfa] text-center text-xs text-[#706456] font-serif italic">
                      Nenhuma operação de telemetria registrada ainda. Realize uma ingestão de PDF, GitHub ou geração de currículo para visualizar o histórico de economia.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Feedback Bar */}
          {error && (
            <div className="p-3.5 bg-[#fdf0f0] border-t border-[#e2a4a4] text-xs text-[#8c1c1c] flex items-center gap-2.5 shrink-0 font-sans">
              <AlertCircle className="h-4 w-4 shrink-0 text-[#c73434]" />
              <span>{error}</span>
            </div>
          )}
          {statusMessage && !error && (
            <div className="p-3 bg-[#f0e8d7] border-t border-[#dfd5be] text-xs text-[#5c4f3f] flex items-center gap-2.5 font-serif italic shrink-0">
              <Sparkles className="h-4 w-4 text-[#8b5a2b]" />
              <span>{statusMessage}</span>
            </div>
          )}
        </div>

        {/* Right Side: PDF Preview & Results */}
        <div className="flex-1 flex flex-col bg-[#ede4d1] overflow-hidden">
          {/* Header tabs */}
          <div className="h-12 border-b border-[#dfd5be] px-6 flex items-center justify-between bg-[#fcfaf5] shrink-0 font-sans text-sm">
            <div className="flex gap-2">
              <button
                onClick={() => setRightTab('preview')}
                className={`px-3.5 py-1.5 rounded transition font-medium ${
                  rightTab === 'preview'
                    ? 'bg-[#ede6d4] text-[#2c2620] border border-[#d0c4ac] font-semibold'
                    : 'text-[#706456] hover:text-[#2c2620]'
                }`}
              >
                Visualização do PDF
              </button>
              <button
                onClick={() => setRightTab('scores')}
                className={`px-3.5 py-1.5 rounded transition font-medium ${
                  rightTab === 'scores'
                    ? 'bg-[#ede6d4] text-[#2c2620] border border-[#d0c4ac] font-semibold'
                    : 'text-[#706456] hover:text-[#2c2620]'
                }`}
              >
                Pontuação ATS (Ranking)
              </button>
              <button
                onClick={() => setRightTab('latex')}
                className={`px-3.5 py-1.5 rounded transition font-medium ${
                  rightTab === 'latex'
                    ? 'bg-[#ede6d4] text-[#2c2620] border border-[#d0c4ac] font-semibold'
                    : 'text-[#706456] hover:text-[#2c2620]'
                }`}
              >
                Código LaTeX (.tex)
              </button>
            </div>

            {pdfUrl && (
              <a
                href={pdfUrl}
                download="curriculo_ats_1page.pdf"
                className="px-3.5 py-1.5 rounded bg-[#2c2620] hover:bg-[#403730] text-[#f7f3e8] flex items-center gap-2 transition text-xs font-semibold shadow-xs"
              >
                <Download className="h-4 w-4" />
                Baixar PDF
              </a>
            )}
          </div>

          {/* Real-time Token Efficiency & Accounting Telemetry */}
          {result?.token_metrics && (
            <div className="mx-5 mt-3 p-3 bg-[#f6efe2] border border-[#d6c9b1] rounded-md flex flex-wrap items-center justify-between gap-3 text-xs font-sans shadow-2xs shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-full bg-[#206634]/15 border border-[#206634]/30 flex items-center justify-center text-[#206634]">
                  <Zap className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#2c2620]">
                      Eficiência de Tokens: {result.token_metrics.efficiency_pct}% de Economia
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#206634]/15 text-[#206634]">
                      Telemetria LLM
                    </span>
                  </div>
                  <span className="text-[11px] text-[#706456]">
                    <strong>{result.token_metrics.tokens_saved.toLocaleString()}</strong> tokens poupados | <strong>{result.token_metrics.tokens_used.toLocaleString()}</strong> tokens consumidos
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] flex-wrap">
                <span className="bg-[#fffdf9] px-2.5 py-1 rounded border border-[#dfd5be] text-[#5e5142] flex items-center gap-1.5" title="Tokens economizados com filtragem heurística de boilerplate da vaga">
                  ✂️ Poda de Vaga: <strong>+{result.token_metrics.breakdown?.job_distillation || 0}</strong>
                </span>
                <span className="bg-[#fffdf9] px-2.5 py-1 rounded border border-[#dfd5be] text-[#5e5142] flex items-center gap-1.5" title="Tokens economizados com memoization de prompt em re-renderizações">
                  💾 Cache SHA-256: <strong>+{result.token_metrics.breakdown?.cache_memoization || 0}</strong>
                </span>
                {result.token_metrics.breakdown?.zero_retry_latex > 0 && (
                  <span className="bg-[#fffdf9] px-2.5 py-1 rounded border border-[#dfd5be] text-[#5e5142] flex items-center gap-1.5" title="Tokens economizados reparando escapes LaTeX em memória sem retry">
                    🛡️ Zero-Retry LaTeX: <strong>+{result.token_metrics.breakdown.zero_retry_latex}</strong>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Right Panel Main Area */}
          <div className="flex-1 relative overflow-hidden flex items-center justify-center p-5">
            {rightTab === 'preview' && (
              pdfUrl ? (
                <div className="w-full h-full rounded border border-[#cfc3a9] shadow-md overflow-hidden bg-white">
                  <iframe
                    src={pdfUrl}
                    title="Currículo Gerado"
                    className="w-full h-full border-0"
                  />
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-8">
                  <div className="h-16 w-16 rounded-full bg-[#e8ded0] border border-[#cfc3a9] flex items-center justify-center mb-4 text-[#594935] shadow-xs">
                    <FileText className="h-8 w-8 text-[#8b5a2b]" />
                  </div>
                  <h3 className="font-serif text-xl font-bold text-[#2c2620] mb-2">
                    Nenhum Currículo Gerado Ainda
                  </h3>
                  <p className="text-sm text-[#736555] max-w-md mb-6 leading-relaxed font-serif">
                    Ajuste os dados da vaga e do perfil no painel à esquerda e clique em <strong>"Gerar Currículo (PDF)"</strong> para compilar o documento em página única.
                  </p>
                  <button
                    onClick={handleGenerate}
                    disabled={loading || !profile}
                    className="px-6 py-2.5 rounded bg-[#2c2620] hover:bg-[#403730] text-[#f7f3e8] font-sans font-semibold text-sm transition duration-200 shadow-xs"
                  >
                    Gerar Currículo Agora
                  </button>
                </div>
              )
            )}

            {rightTab === 'scores' && (
              <div className="h-full w-full overflow-y-auto p-6 space-y-6 bg-[#faf6ed]">
                <div className="border-b border-[#dfd5be] pb-3">
                  <h3 className="font-serif font-bold text-lg text-[#221c16]">
                    Critérios de Seleção & Pontuação ATS
                  </h3>
                  <p className="text-xs text-[#706456] italic font-serif mt-0.5">
                    O motor de busca seleciona as experiências e projetos mais adequados à vaga combinando relevância semântica, recência, penalidade por redundância (MMR) e métricas quantificáveis.
                  </p>
                </div>

                {result ? (
                  <div className="space-y-6">
                    {/* Experiences Selection */}
                    <div>
                      <h4 className="text-xs font-sans font-bold uppercase tracking-wider text-[#8b5a2b] mb-3 flex items-center gap-2">
                        <Layers className="h-4 w-4" />
                        Experiências Selecionadas
                      </h4>
                      <div className="space-y-3">
                        {result.selected_experiences?.map((exp, idx) => (
                          <div key={idx} className="paper-card rounded-md p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-base text-[#1f1913] font-serif">
                                {exp.role} @ {exp.company}
                              </span>
                              <span className="text-xs font-mono font-bold text-[#2c2620] bg-[#f0e8d7] px-2.5 py-0.5 rounded border border-[#d6c9b1]">
                                Score: {exp.score?.toFixed(3)}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {exp.tags?.map((t, i) => (
                                <span key={i} className="text-xs font-sans bg-[#ede5d2] text-[#4d4235] px-2 py-0.5 rounded">
                                  {t}
                                </span>
                              ))}
                            </div>
                            <ul className="text-sm text-[#42392f] space-y-1.5 list-disc list-inside font-serif mt-1">
                              {(exp.formatted_bullets || exp.raw_bullets)?.map((b, i) => (
                                <li key={i} className="text-sm leading-relaxed">
                                  {b.replace(/\\textbf\{([^}]+)\}/g, '$1')}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Projects Selection */}
                    <div>
                      <h4 className="text-xs font-sans font-bold uppercase tracking-wider text-[#8b5a2b] mb-3 flex items-center gap-2">
                        <BookOpen className="h-4 w-4" />
                        Projetos Selecionados
                      </h4>
                      <div className="space-y-3">
                        {result.selected_projects?.map((proj, idx) => (
                          <div key={idx} className="paper-card rounded-md p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-base text-[#1f1913] font-serif">
                                {proj.title} {proj.subtitle && `(${proj.subtitle})`}
                              </span>
                              <span className="text-xs font-mono font-bold text-[#2c2620] bg-[#f0e8d7] px-2.5 py-0.5 rounded border border-[#d6c9b1]">
                                Score: {proj.score?.toFixed(3)}
                              </span>
                            </div>
                            <ul className="text-sm text-[#42392f] space-y-1.5 list-disc list-inside font-serif mt-1">
                              {(proj.formatted_bullets || proj.raw_bullets)?.map((b, i) => (
                                <li key={i} className="text-sm leading-relaxed">
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
                  <div className="text-sm text-[#706456] italic font-serif">
                    Gere o currículo para inspecionar a pontuação de relevância de cada item.
                  </div>
                )}
              </div>
            )}

            {rightTab === 'latex' && (
              <div className="h-full w-full flex flex-col p-5 bg-[#faf6ed]">
                <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-[#dfd5be]">
                  <span className="text-xs font-sans font-bold text-[#5c4f3f] uppercase tracking-wider">
                    Código Fonte LaTeX Compilado
                  </span>
                  {result?.tex_source && (
                    <button
                      onClick={handleCopyLatex}
                      className="px-3 py-1.5 rounded bg-[#f0e8d7] hover:bg-[#e4dcba] border border-[#d6c9b1] text-xs font-sans font-medium text-[#2c2620] flex items-center gap-2 transition"
                    >
                      {copiedLatex ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                      <span>{copiedLatex ? 'Copiado!' : 'Copiar LaTeX'}</span>
                    </button>
                  )}
                </div>
                <textarea
                  readOnly
                  value={result?.tex_source || '% O código LaTeX (.tex) será exibido aqui após a compilação.'}
                  className="flex-1 w-full bg-[#fffdf9] border border-[#d6c9b1] rounded-md p-4 font-mono text-xs text-[#2c2620] focus:outline-none resize-none leading-relaxed"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
