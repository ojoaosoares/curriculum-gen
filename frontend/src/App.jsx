import React, { useState, useEffect, useMemo } from 'react';
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
  X,
  Pencil,
  Plus,
  Award,
  AlertTriangle,
  Edit3,
  GitMerge,
  Tag,
} from 'lucide-react';

const extractErrorMessage = (errData, defaultMsg = 'Ocorreu um erro na operação.') => {
  if (!errData) return defaultMsg;
  const detail = errData.detail || errData.message || errData;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && item.msg) {
          const loc = Array.isArray(item.loc)
            ? item.loc.filter((x) => x !== 'body').join(' -> ')
            : '';
          return loc ? `${loc}: ${item.msg}` : item.msg;
        }
        return JSON.stringify(item);
      })
      .join('; ');
  }
  if (typeof detail === 'object') {
    return detail.msg || detail.message || JSON.stringify(detail);
  }
  return String(detail);
};

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

const isProfileEmpty = (p) => {
  if (!p || typeof p !== 'object') return true;
  const hasName = Boolean(p.personal?.name && p.personal.name.trim().length > 0);
  const hasExps = Array.isArray(p.experiences) && p.experiences.length > 0;
  const hasProjs = Array.isArray(p.projects) && p.projects.length > 0;
  const hasAwards = Array.isArray(p.awards_and_leadership) && p.awards_and_leadership.length > 0;
  const hasEdu = Array.isArray(p.education) && p.education.length > 0;
  const hasSkills = p.skills && Object.keys(p.skills).length > 0;
  return !hasName && !hasExps && !hasProjs && !hasAwards && !hasEdu && !hasSkills;
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

  // Profile data with local persistence fallback
  const [profile, setProfile] = useState(() => {
    try {
      const cached = localStorage.getItem('curriculum_gen_active_profile');
      if (!cached) return null;
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      return null;
    }
    return null;
  });
  const [jobDescription, setJobDescription] = useState(
    () => localStorage.getItem('curriculum_gen_job_description') || PRESET_JOBS.systems
  );
  const [language, setLanguage] = useState(
    () => localStorage.getItem('curriculum_gen_language') || 'en'
  );
  const [visibleContacts, setVisibleContacts] = useState(() => {
    try {
      const cached = localStorage.getItem('curriculum_gen_visible_contacts');
      if (cached) return JSON.parse(cached);
    } catch {}
    return [
      'location',
      'email',
      'phone',
      'linkedin',
      'github',
      'lattes',
    ];
  });

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
  const [ghUsername, setGhUsername] = useState('');
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

  // Profile Item Editor Modal State
  const [editingItem, setEditingItem] = useState(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [aiSuggestionState, setAiSuggestionState] = useState(null);

  // Skill Management & Association State
  const [newSkillInput, setNewSkillInput] = useState('');
  const [activeSkillDetail, setActiveSkillDetail] = useState(null);
  const [newCategorySkillInputs, setNewCategorySkillInputs] = useState({});
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Awards Fusion Modal State
  const [fusionModalOpen, setFusionModalOpen] = useState(false);
  const [fusionSelectedAwardIndices, setFusionSelectedAwardIndices] = useState([]);
  const [isFusing, setIsFusing] = useState(false);
  const [fusedResult, setFusedResult] = useState(null);

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
    if (jobDescription) {
      localStorage.setItem('curriculum_gen_job_description', jobDescription);
    }
  }, [jobDescription]);

  useEffect(() => {
    if (language) {
      localStorage.setItem('curriculum_gen_language', language);
    }
  }, [language]);

  useEffect(() => {
    if (visibleContacts && Array.isArray(visibleContacts)) {
      localStorage.setItem('curriculum_gen_visible_contacts', JSON.stringify(visibleContacts));
    }
  }, [visibleContacts]);

  useEffect(() => {
    if (profile && !isProfileEmpty(profile)) {
      try {
        localStorage.setItem('curriculum_gen_active_profile', JSON.stringify(profile));
      } catch (e) {
        console.warn('Falha ao sincronizar perfil com localStorage:', e);
      }
    }
  }, [profile]);

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

  const applyVisibleContacts = (data) => {
    if (data?.personal?.visible_items) {
      const rawItems = Array.isArray(data.personal.visible_items) ? data.personal.visible_items : [];
      const cleanItems = rawItems
        .map((c) => (typeof c === 'object' && c ? (c.key || c.id || String(c)) : String(c)))
        .filter(Boolean);
      if (cleanItems.length > 0) {
        setVisibleContacts(cleanItems);
      }
    }
  };

  const loadProfile = async () => {
    let localProf = null;
    try {
      const cached = localStorage.getItem('curriculum_gen_active_profile');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') {
          localProf = parsed;
        }
      }
    } catch (e) {
      console.warn('Falha ao ler localStorage:', e);
    }

    try {
      const res = await fetch('/api/profile');
      if (res.ok) {
        const backendData = await res.json();
        const backendEmpty = isProfileEmpty(backendData);
        const localEmpty = isProfileEmpty(localProf);

        if (!localEmpty && backendEmpty) {
          // Local storage has the user's filled profile, but backend was empty.
          // Preserve the user's local profile AND sync it to backend!
          setProfile(localProf);
          persistProfile(localProf).catch(() => {});
          applyVisibleContacts(localProf);
          return;
        }

        if (!backendEmpty) {
          setProfile(backendData);
          try {
            localStorage.setItem('curriculum_gen_active_profile', JSON.stringify(backendData));
          } catch {}
          applyVisibleContacts(backendData);
          return;
        }

        // Both are empty
        setProfile(backendData);
        applyVisibleContacts(backendData);
      } else if (localProf && !isProfileEmpty(localProf)) {
        setProfile(localProf);
        applyVisibleContacts(localProf);
      }
    } catch (err) {
      console.error('Falha ao carregar perfil:', err);
      if (localProf && !isProfileEmpty(localProf)) {
        setProfile(localProf);
        applyVisibleContacts(localProf);
      }
    }
  };

  const persistProfile = async (newProfile) => {
    if (!newProfile) return;
    try {
      localStorage.setItem('curriculum_gen_active_profile', JSON.stringify(newProfile));
    } catch (e) {
      console.error('Falha ao salvar no localStorage:', e);
    }

    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProfile),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(extractErrorMessage(errData, 'Erro ao salvar o perfil no servidor.'));
      }
      return await res.json();
    } catch (err) {
      console.error('Falha na persistência remota do perfil:', err);
      throw err;
    }
  };

  const handleResetProfile = async () => {
    if (!window.confirm('Deseja restaurar o perfil padrão inicial (vazio)? Quaisquer dados atuais serão redefinidos.')) return;
    try {
      const res = await fetch('/api/profile/reset', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        const prof = data.profile;
        setProfile(prof);
        try {
          localStorage.removeItem('curriculum_gen_active_profile');
        } catch {}
        applyVisibleContacts(prof);
      }
    } catch (err) {
      console.error('Falha ao resetar perfil:', err);
    }
  };

  const handleOpenAdd = (type) => {
    setAiSuggestionState(null);
    setNewSkillInput('');
    if (type === 'experience') {
      setEditingItem({
        type,
        index: null,
        form: { role: '', company: '', period: '', location: '', tags: [], raw_bullets: '' },
      });
    } else if (type === 'project') {
      setEditingItem({
        type,
        index: null,
        form: { title: '', subtitle: '', period: '', tags: [], raw_bullets: '' },
      });
    } else if (type === 'award') {
      setEditingItem({
        type,
        index: null,
        form: { title: '', period_or_date: '', description: '', tags: [] },
      });
    }
  };

  const handleOpenEdit = (type, index, item) => {
    setAiSuggestionState(null);
    setNewSkillInput('');
    if (type === 'personal') {
      setEditingItem({
        type,
        index: null,
        form: {
          name: profile?.personal?.name || '',
          location: profile?.personal?.location || '',
          email: profile?.personal?.email || '',
          phone: profile?.personal?.phone || '',
          linkedin: profile?.personal?.linkedin || '',
          github: profile?.personal?.github || '',
          lattes: profile?.personal?.lattes || '',
        },
      });
    } else if (type === 'experience') {
      const currentTags = Array.isArray(item.tags)
        ? [...item.tags]
        : (typeof item.tags === 'string' && item.tags
            ? item.tags.split(',').map((t) => t.trim()).filter(Boolean)
            : []);
      setEditingItem({
        type,
        index,
        form: {
          role: item.role || '',
          company: item.company || '',
          period: item.period || '',
          location: item.location || '',
          tags: currentTags,
          raw_bullets: (item.raw_bullets || []).join('\n'),
        },
      });
    } else if (type === 'project') {
      const currentTags = Array.isArray(item.tags)
        ? [...item.tags]
        : (typeof item.tags === 'string' && item.tags
            ? item.tags.split(',').map((t) => t.trim()).filter(Boolean)
            : []);
      setEditingItem({
        type,
        index,
        form: {
          title: item.title || '',
          subtitle: item.subtitle || '',
          period: item.period || '',
          tags: currentTags,
          raw_bullets: (item.raw_bullets || []).join('\n'),
        },
      });
    } else if (type === 'award') {
      const currentTags = Array.isArray(item.tags)
        ? [...item.tags]
        : (typeof item.tags === 'string' && item.tags
            ? item.tags.split(',').map((t) => t.trim()).filter(Boolean)
            : []);
      setEditingItem({
        type,
        index,
        form: {
          title: item.title || '',
          period_or_date: item.period_or_date || '',
          description: item.description || '',
          tags: currentTags,
        },
      });
    }
  };

  const allProfileSkills = useMemo(() => {
    if (!profile?.skills) return [];
    const set = new Set();
    Object.values(profile.skills).forEach((items) => {
      const arr = Array.isArray(items) ? items : [items];
      arr.forEach((s) => {
        if (typeof s === 'string' && s.trim()) set.add(s.trim());
      });
    });
    return Array.from(set).sort();
  }, [profile?.skills]);

  const getSkillAssociations = useMemo(() => {
    if (!profile) return () => ({ experiences: [], projects: [], awards: [], total: 0 });
    return (skillName) => {
      if (!skillName) return { experiences: [], projects: [], awards: [], total: 0 };
      const q = skillName.trim().toLowerCase();
      const exps = (profile.experiences || []).filter((e) =>
        (e.tags || []).some((t) => t.toLowerCase() === q)
      );
      const projs = (profile.projects || []).filter((p) =>
        (p.tags || []).some((t) => t.toLowerCase() === q)
      );
      const awards = (profile.awards_and_leadership || []).filter((a) =>
        (a.tags || []).some((t) => t.toLowerCase() === q)
      );
      return {
        experiences: exps,
        projects: projs,
        awards: awards,
        total: exps.length + projs.length + awards.length,
      };
    };
  }, [profile]);

  const handleAddTagToEditingItem = (tag) => {
    if (!tag || !editingItem) return;
    const clean = tag.trim();
    if (!clean) return;
    const currentTags = Array.isArray(editingItem.form.tags)
      ? editingItem.form.tags
      : (typeof editingItem.form.tags === 'string' && editingItem.form.tags
          ? editingItem.form.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : []);
    if (!currentTags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      setEditingItem({
        ...editingItem,
        form: {
          ...editingItem.form,
          tags: [...currentTags, clean],
        },
      });
    }
    setNewSkillInput('');
  };

  const handleRemoveTagFromEditingItem = (tagToRemove) => {
    if (!editingItem) return;
    const currentTags = Array.isArray(editingItem.form.tags)
      ? editingItem.form.tags
      : (typeof editingItem.form.tags === 'string' && editingItem.form.tags
          ? editingItem.form.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : []);
    setEditingItem({
      ...editingItem,
      form: {
        ...editingItem.form,
        tags: currentTags.filter((t) => t.toLowerCase() !== tagToRemove.toLowerCase()),
      },
    });
  };

  const handleToggleTagInEditingItem = (tag) => {
    if (!editingItem) return;
    const currentTags = Array.isArray(editingItem.form.tags)
      ? editingItem.form.tags
      : (typeof editingItem.form.tags === 'string' && editingItem.form.tags
          ? editingItem.form.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : []);
    if (currentTags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      handleRemoveTagFromEditingItem(tag);
    } else {
      handleAddTagToEditingItem(tag);
    }
  };

  const handleAutoDetectSkills = () => {
    if (!editingItem) return;
    const f = editingItem.form;
    let fullText = '';
    if (editingItem.type === 'experience') {
      fullText = `${f.role || ''} ${f.company || ''} ${f.raw_bullets || ''}`;
    } else if (editingItem.type === 'project') {
      fullText = `${f.title || ''} ${f.subtitle || ''} ${f.raw_bullets || ''}`;
    } else if (editingItem.type === 'award') {
      fullText = `${f.title || ''} ${f.period_or_date || ''} ${f.description || ''}`;
    }
    const lower = fullText.toLowerCase();

    const detected = new Set();
    allProfileSkills.forEach((sk) => {
      const escaped = sk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(^|[^a-zA-Z0-9_#+])${escaped}([^a-zA-Z0-9_#+]|$)`, 'i');
      if (regex.test(lower)) {
        detected.add(sk);
      }
    });

    const commonTechs = [
      'Python', 'C', 'C++', 'Rust', 'Go', 'JavaScript', 'TypeScript', 'eBPF', 'XDP',
      'Linux', 'Kernel', 'Docker', 'Kubernetes', 'FastAPI', 'React', 'NestJS', 'PostgreSQL',
      'MySQL', 'Redis', 'DNS', 'ns-3', 'GPU', 'CUDA', 'Git', 'CI/CD', 'Playwright',
      'Redes', 'Sistemas Embarcados'
    ];
    commonTechs.forEach((tech) => {
      const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(^|[^a-zA-Z0-9_#+])${escaped}([^a-zA-Z0-9_#+]|$)`, 'i');
      if (regex.test(lower)) {
        detected.add(tech);
      }
    });

    const currentTags = Array.isArray(f.tags)
      ? f.tags
      : (typeof f.tags === 'string' && f.tags
          ? f.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : []);

    const merged = [...currentTags];
    detected.forEach((d) => {
      if (!merged.some((m) => m.toLowerCase() === d.toLowerCase())) {
        merged.push(d);
      }
    });

    setEditingItem({
      ...editingItem,
      form: {
        ...editingItem.form,
        tags: merged,
      },
    });
  };

  const handleAddSkillToCategory = async (category, skillName) => {
    if (!profile || !skillName || !skillName.trim()) return;
    const clean = skillName.trim();
    const updatedSkills = { ...(profile.skills || {}) };
    const currentList = Array.isArray(updatedSkills[category]) ? [...updatedSkills[category]] : [];
    if (!currentList.some((s) => s.toLowerCase() === clean.toLowerCase())) {
      currentList.push(clean);
      updatedSkills[category] = currentList;
      const updatedProfile = { ...profile, skills: updatedSkills };
      setProfile(updatedProfile);
      setNewCategorySkillInputs((prev) => ({ ...prev, [category]: '' }));
      try {
        await persistProfile(updatedProfile);
      } catch (err) {
        console.error('Erro ao adicionar habilidade:', err);
      }
    }
  };

  const handleRemoveSkillFromCategory = async (category, skillToRemove) => {
    if (!profile) return;
    const updatedSkills = { ...(profile.skills || {}) };
    if (!updatedSkills[category]) return;
    const currentList = Array.isArray(updatedSkills[category]) ? updatedSkills[category] : [];
    updatedSkills[category] = currentList.filter(
      (s) => s.toLowerCase() !== skillToRemove.toLowerCase()
    );
    if (updatedSkills[category].length === 0) {
      delete updatedSkills[category];
    }
    const updatedProfile = { ...profile, skills: updatedSkills };
    setProfile(updatedProfile);
    try {
      await persistProfile(updatedProfile);
    } catch (err) {
      console.error('Erro ao remover habilidade:', err);
    }
  };

  const handleCreateCategory = async (categoryName) => {
    if (!profile || !categoryName || !categoryName.trim()) return;
    const cleanCat = categoryName.trim();
    const updatedSkills = { ...(profile.skills || {}) };
    if (!updatedSkills[cleanCat]) {
      updatedSkills[cleanCat] = [];
      const updatedProfile = { ...profile, skills: updatedSkills };
      setProfile(updatedProfile);
      setShowAddCategory(false);
      setNewCategoryName('');
      try {
        await persistProfile(updatedProfile);
      } catch (err) {
        console.error('Erro ao criar categoria:', err);
      }
    }
  };

  const handleOpenEditById = (type, id, fallbackItem = null) => {
    if (!profile) return;
    let list = [];
    if (type === 'experience') list = profile.experiences || [];
    else if (type === 'project') list = profile.projects || [];
    else if (type === 'award') list = profile.awards_and_leadership || [];

    const idx = list.findIndex(
      (x) =>
        (id && x.id === id) ||
        (x.title && fallbackItem?.title && x.title.toLowerCase().trim() === fallbackItem.title.toLowerCase().trim()) ||
        (x.company && fallbackItem?.company && x.company.toLowerCase().trim() === fallbackItem.company.toLowerCase().trim())
    );

    if (idx !== -1) {
      handleOpenEdit(type, idx, list[idx]);
    } else if (fallbackItem) {
      handleOpenEdit(type, null, fallbackItem);
    }
  };

  const handleSuggestDescription = async (
    itemType,
    title,
    subtitleOrOrg,
    currentDesc,
    mode = 'generate',
    targetProjectId = null
  ) => {
    if (!title && !subtitleOrOrg && !currentDesc) return;
    setIsSuggesting(true);
    setAiSuggestionState(null);
    try {
      const res = await fetch('/api/suggest-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_type: itemType,
          title: title || '',
          subtitle_or_org: subtitleOrOrg || '',
          current_description: currentDesc || '',
          job_description: jobDescription || '',
          language: language || 'pt',
          profile_context: profile,
          mode: mode,
          target_project_id_or_title: targetProjectId || null,
          api_key: apiKey || null,
          provider: provider || null,
          model: model || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.suggestion || data.text) {
          const suggestedText = data.suggestion || data.text;
          setAiSuggestionState({
            text: suggestedText,
            tokens_used: data.tokens_used || 0,
            tokens_saved: data.tokens_saved || 0,
            provider: data.provider || 'offline_heuristic',
            strategy: data.strategy || 'Síntese Contextual',
            mode: mode,
            cross_refs: data.cross_refs || [],
            itemType: itemType,
          });
          // Update live telemetry counters immediately
          fetchTokenStats();
        }
      }
    } catch (err) {
      console.error('Erro ao sugerir descrição:', err);
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleApplyAiSuggestion = (applyMode = 'replace') => {
    if (!aiSuggestionState?.text || !editingItem) return;
    const { itemType, text } = aiSuggestionState;

    if (itemType === 'award') {
      setEditingItem((prev) => ({
        ...prev,
        form: {
          ...prev.form,
          description:
            applyMode === 'append' && prev.form.description
              ? `${prev.form.description} ${text}`
              : text,
        },
      }));
    } else {
      setEditingItem((prev) => {
        const prevBullets = prev.form.raw_bullets ? prev.form.raw_bullets.trim() : '';
        const newBullets =
          applyMode === 'append' && prevBullets ? `${prevBullets}\n${text}` : text;
        return {
          ...prev,
          form: { ...prev.form, raw_bullets: newBullets },
        };
      });
    }
    setAiSuggestionState(null);
  };

  const handleDismissAiSuggestion = () => {
    setAiSuggestionState(null);
  };

  const handleOpenFusionModal = () => {
    const awards = profile?.awards_and_leadership || [];
    if (awards.length < 2) return;
    const preselected = [];
    awards.forEach((aw, idx) => {
      const t = (aw.title || '').toLowerCase();
      if (
        t.includes('sbesc') ||
        t.includes('symposium') ||
        t.includes('ufmg') ||
        t.includes('conhecimento') ||
        t.includes('atesn')
      ) {
        preselected.push(idx);
      }
    });
    setFusionSelectedAwardIndices(preselected.length >= 2 ? preselected : [0, 1]);
    setFusedResult(null);
    setFusionModalOpen(true);
  };

  const handleToggleFusionAward = (idx) => {
    setFusionSelectedAwardIndices((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  const handleRunFusion = async () => {
    const awards = profile?.awards_and_leadership || [];
    const selectedItems = fusionSelectedAwardIndices.map((i) => awards[i]).filter(Boolean);
    if (selectedItems.length < 2) return;

    setIsFusing(true);
    try {
      const res = await fetch('/api/suggest-fusion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selectedItems,
          profile_context: profile,
          language: language || 'pt',
          job_description: jobDescription || '',
          api_key: apiKey || null,
          provider: provider || null,
          model: model || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setFusedResult(data);
        fetchTokenStats();
      }
    } catch (err) {
      console.error('Erro ao sintetizar fusão:', err);
    } finally {
      setIsFusing(false);
    }
  };

  const handleApplyFusion = async () => {
    if (!fusedResult?.fused_item || !profile) return;
    const { title, period_or_date, description } = fusedResult.fused_item;
    const currentAwards = [...(profile.awards_and_leadership || [])];

    const remainingAwards = currentAwards.filter(
      (_, idx) => !fusionSelectedAwardIndices.includes(idx)
    );

    const fusedEntry = {
      id: `award-fused-${Date.now()}`,
      title: title || 'Apresentações & Distinções Científicas',
      period_or_date: period_or_date || '2025',
      description: description || '',
      score: 0.0,
    };

    const insertIdx = Math.min(...fusionSelectedAwardIndices, 0);
    remainingAwards.splice(insertIdx, 0, fusedEntry);

    const updatedProfile = {
      ...profile,
      awards_and_leadership: remainingAwards,
    };

    setProfile(updatedProfile);
    try {
      localStorage.setItem('curriculum_gen_active_profile', JSON.stringify(updatedProfile));
      await persistProfile(updatedProfile);
    } catch {}

    setFusionModalOpen(false);
    setFusedResult(null);
    setFusionSelectedAwardIndices([]);
  };

  const handleSaveItem = async (e) => {
    e.preventDefault();
    if (!editingItem || !profile) return;
    const { type, index, form } = editingItem;

    let updated = { ...profile };

    const cleanTags = Array.isArray(form.tags)
      ? form.tags.map((t) => t.trim()).filter(Boolean)
      : (typeof form.tags === 'string' && form.tags
          ? form.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : []);

    if (type === 'personal') {
      updated = {
        ...profile,
        personal: {
          ...profile.personal,
          name: form.name?.trim() || profile.personal.name,
          location: form.location?.trim() || null,
          email: form.email?.trim() || null,
          phone: form.phone?.trim() || null,
          linkedin: form.linkedin?.trim() || null,
          github: form.github?.trim() || null,
          lattes: form.lattes?.trim() || null,
        },
      };
    } else if (type === 'experience') {
      const exp = {
        id: index !== null ? profile.experiences[index]?.id : `exp-custom-${Date.now()}`,
        role: form.role?.trim() || 'Cargo',
        company: form.company?.trim() || 'Empresa',
        period: form.period?.trim() || '',
        location: form.location?.trim() || null,
        tags: cleanTags,
        raw_bullets: form.raw_bullets ? form.raw_bullets.split('\n').map((b) => b.trim()).filter(Boolean) : [],
        formatted_bullets: [],
        metrics: [],
        score: index !== null ? (profile.experiences[index]?.score || 0.0) : 0.0,
      };
      let exps = [...(profile.experiences || [])];
      if (index !== null) {
        exps[index] = { ...exps[index], ...exp };
      } else {
        exps = [exp, ...exps];
      }
      updated.experiences = exps;
    } else if (type === 'project') {
      const proj = {
        id: index !== null ? profile.projects[index]?.id : `proj-custom-${Date.now()}`,
        title: form.title?.trim() || 'Projeto',
        subtitle: form.subtitle?.trim() || null,
        period: form.period?.trim() || null,
        tags: cleanTags,
        raw_bullets: form.raw_bullets ? form.raw_bullets.split('\n').map((b) => b.trim()).filter(Boolean) : [],
        formatted_bullets: [],
        metrics: [],
        score: index !== null ? (profile.projects[index]?.score || 0.0) : 0.0,
      };
      let projs = [...(profile.projects || [])];
      if (index !== null) {
        projs[index] = { ...projs[index], ...proj };
      } else {
        projs = [proj, ...projs];
      }
      updated.projects = projs;
    } else if (type === 'award') {
      const aw = {
        id: index !== null ? profile.awards_and_leadership[index]?.id : `award-custom-${Date.now()}`,
        title: form.title?.trim() || 'Conquista',
        period_or_date: form.period_or_date?.trim() || 'N/A',
        description: form.description?.trim() || '',
        tags: cleanTags,
        score: index !== null ? (profile.awards_and_leadership[index]?.score || 0.0) : 0.0,
      };
      let aws = [...(profile.awards_and_leadership || [])];
      if (index !== null) {
        aws[index] = { ...aws[index], ...aw };
      } else {
        aws = [aw, ...aws];
      }
      updated.awards_and_leadership = aws;
    }

    // Auto-sync newly added tags to profile.skills
    if (cleanTags.length > 0) {
      const currentSkills = { ...(updated.skills || {}) };
      const currentRegistered = new Set();
      Object.values(currentSkills).forEach((items) => {
        const arr = Array.isArray(items) ? items : [items];
        arr.forEach((s) => currentRegistered.add(s.toLowerCase()));
      });

      const newSkillsToRegister = cleanTags.filter(
        (t) => !currentRegistered.has(t.toLowerCase())
      );
      if (newSkillsToRegister.length > 0) {
        const targetCat = currentSkills['Tecnologias']
          ? 'Tecnologias'
          : (Object.keys(currentSkills)[0] || 'Tecnologias');
        currentSkills[targetCat] = [...(currentSkills[targetCat] || []), ...newSkillsToRegister];
        updated.skills = currentSkills;
      }
    }

    setProfile(updated);
    try {
      await persistProfile(updated);
      setEditingItem(null);
    } catch (err) {
      alert(extractErrorMessage(err, 'Erro ao salvar alterações no perfil.'));
    }
  };

  const handleDeleteItem = async (type, index) => {
    if (!profile) return;
    const typeLabel = type === 'experience' ? 'experiência' : type === 'project' ? 'projeto' : 'conquista';
    if (!window.confirm(`Deseja realmente excluir esta ${typeLabel}?`)) return;

    let updated = { ...profile };
    if (type === 'experience') {
      updated.experiences = (profile.experiences || []).filter((_, i) => i !== index);
    } else if (type === 'project') {
      updated.projects = (profile.projects || []).filter((_, i) => i !== index);
    } else if (type === 'award') {
      updated.awards_and_leadership = (profile.awards_and_leadership || []).filter((_, i) => i !== index);
    }

    setProfile(updated);
    try {
      await persistProfile(updated);
    } catch (err) {
      alert(extractErrorMessage(err, 'Erro ao salvar remoção no perfil.'));
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
            message: extractErrorMessage(data, `Erro HTTP ${res.status}: Não foi possível autenticar a chave.`),
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
    const key = typeof item === 'object' && item ? (item.key || item.id || String(item)) : String(item);
    let next;
    if (visibleContacts.includes(key)) {
      next = visibleContacts.filter((c) => c !== key);
    } else {
      next = [...visibleContacts, key];
    }
    setVisibleContacts(next);
    if (profile) {
      const updated = {
        ...profile,
        personal: {
          ...profile.personal,
          visible_items: next,
        },
      };
      setProfile(updated);
      persistProfile(updated).catch(() => {});
    }
  };

  const handleGenerate = async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);
    setStatusMessage('Processando correspondência e compilando currículo...');

    try {
      const cleanVisibleContacts = (Array.isArray(visibleContacts) ? visibleContacts : [])
        .map((c) => (typeof c === 'object' && c ? (c.key || c.id || String(c)) : String(c)))
        .filter(Boolean);

      const payload = {
        profile: {
          ...profile,
          personal: {
            ...profile.personal,
            visible_items: cleanVisibleContacts,
          },
        },
        job_description: jobDescription,
        language: language,
        visible_contacts: cleanVisibleContacts,
        api_key: apiKey.trim() ? apiKey.trim().replace(/^["']|["']$/g, '') : null,
        provider: provider,
        model: model,
        max_exps: 2,
        max_projs: 2,
        max_awards: 2,
      };

      // Ensure current active profile is preserved locally and on disk
      persistProfile(payload.profile).catch(() => {});

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(extractErrorMessage(errData, 'Falha ao compilar currículo'));
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
      setError(extractErrorMessage(err.message || err, 'Falha ao compilar currículo.'));
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
          const existingTitles = new Set((profile.projects || []).map((p) => (p.title || '').toLowerCase()));
          const added = newProjects.filter((p) => !existingTitles.has((p.title || '').toLowerCase()));
          const updatedProfile = {
            ...profile,
            projects: [...(profile.projects || []), ...added],
          };
          setProfile(updatedProfile);
          await persistProfile(updatedProfile);
          setGhMessage(`${added.length} novos projetos importados e salvos com sucesso.`);
          fetchTokenStats();
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setGhMessage(extractErrorMessage(err, 'Erro ao consultar repositórios do GitHub.'));
      }
    } catch (err) {
      setGhMessage(extractErrorMessage(err, 'Falha ao conectar com o serviço de ingestão.'));
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
          const updatedProfile = {
            ...profile,
            projects: [...(profile.projects || []), data.paper],
          };
          setProfile(updatedProfile);
          await persistProfile(updatedProfile);
          setPaperMessage(`Artigo "${data.paper.title}" importado e salvo com sucesso.`);
          fetchTokenStats();
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setPaperMessage(extractErrorMessage(err, 'Não foi possível extrair os dados da publicação.'));
      }
    } catch (err) {
      setPaperMessage(extractErrorMessage(err, 'Falha na conexão com o servidor de ingestão acadêmica.'));
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
        setPdfError(extractErrorMessage(data, 'Erro ao processar o arquivo PDF.'));
      }
    } catch (err) {
      setPdfError('Falha na comunicação com o servidor ao enviar o PDF.');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleApplyPdfData = async (mode) => {
    if (!pdfResult?.profile_data) return;
    const extracted = pdfResult.profile_data;

    const baseProfile = profile || {
      personal: {},
      education: [],
      experiences: [],
      projects: [],
      awards_and_leadership: [],
      skills: {},
    };

    let updatedProfile = { ...baseProfile };

    if (mode === 'replace') {
      updatedProfile = {
        ...baseProfile,
        personal: {
          ...baseProfile.personal,
          name: extracted.personal?.name || baseProfile.personal?.name || '',
          location: extracted.personal?.location || baseProfile.personal?.location,
          email: extracted.personal?.email || baseProfile.personal?.email,
          phone: extracted.personal?.phone || baseProfile.personal?.phone,
          linkedin: extracted.personal?.linkedin || baseProfile.personal?.linkedin,
          github: extracted.personal?.github || baseProfile.personal?.github,
          website: extracted.personal?.website || baseProfile.personal?.website,
          visible_items: baseProfile.personal?.visible_items || [
            'location',
            'email',
            'phone',
            'linkedin',
            'github',
            'lattes',
          ],
        },
        education: extracted.education?.length ? extracted.education : baseProfile.education || [],
        experiences: extracted.experiences?.length ? extracted.experiences : baseProfile.experiences || [],
        projects: extracted.projects?.length ? extracted.projects : baseProfile.projects || [],
        skills: Object.keys(extracted.skills || {}).length ? extracted.skills : baseProfile.skills || {},
        awards_and_leadership: extracted.awards_and_leadership?.length
          ? extracted.awards_and_leadership
          : baseProfile.awards_and_leadership || [],
      };
    } else if (mode === 'merge') {
      const existingExpKeys = new Set(
        (baseProfile.experiences || []).map((e) => `${(e.company || '').toLowerCase()}::${(e.role || '').toLowerCase()}`)
      );
      const newExps = (extracted.experiences || []).filter(
        (e) => !existingExpKeys.has(`${(e.company || '').toLowerCase()}::${(e.role || '').toLowerCase()}`)
      );

      const existingProjTitles = new Set(
        (baseProfile.projects || []).map((p) => (p.title || '').toLowerCase())
      );
      const newProjects = (extracted.projects || []).filter(
        (p) => !existingProjTitles.has((p.title || '').toLowerCase())
      );

      const existingEduInsts = new Set((baseProfile.education || []).map((e) => (e.institution || '').toLowerCase()));
      const newEdu = (extracted.education || []).filter(
        (e) => !existingEduInsts.has((e.institution || '').toLowerCase())
      );

      const mergedSkills = { ...(baseProfile.skills || {}) };
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

      const existingAwardTitles = new Set(
        (baseProfile.awards_and_leadership || []).map((a) => (a.title || '').toLowerCase())
      );
      const newAwards = (extracted.awards_and_leadership || []).filter(
        (a) => !existingAwardTitles.has((a.title || '').toLowerCase())
      );

      updatedProfile = {
        ...baseProfile,
        personal: {
          ...baseProfile.personal,
          name: extracted.personal?.name || baseProfile.personal?.name || '',
          location: extracted.personal?.location || baseProfile.personal?.location,
          email: extracted.personal?.email || baseProfile.personal?.email,
          phone: extracted.personal?.phone || baseProfile.personal?.phone,
          linkedin: extracted.personal?.linkedin || baseProfile.personal?.linkedin,
          github: extracted.personal?.github || baseProfile.personal?.github,
        },
        experiences: [...(baseProfile.experiences || []), ...newExps],
        projects: [...(baseProfile.projects || []), ...newProjects],
        education: [...(baseProfile.education || []), ...newEdu],
        skills: mergedSkills,
        awards_and_leadership: [...(baseProfile.awards_and_leadership || []), ...newAwards],
      };
    }

    setProfile(updatedProfile);
    try {
      localStorage.setItem('curriculum_gen_active_profile', JSON.stringify(updatedProfile));
      await persistProfile(updatedProfile);
      setPdfMessage(
        mode === 'merge'
          ? 'Dados mesclados ao perfil ativo e salvos localmente e no servidor!'
          : 'Perfil substituído e salvo localmente e no servidor com os dados do currículo/LinkedIn!'
      );
      setPdfResult(null);
      setPdfFile(null);
    } catch (err) {
      setPdfError(extractErrorMessage(err, 'Erro ao salvar o perfil atualizado no backend.'));
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
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[#7d7162] font-mono bg-[#ece4d2] px-2 py-0.5 rounded">
                        Ativo: data/active_profile.yaml
                      </span>
                      <button
                        onClick={() => handleOpenEdit('personal')}
                        className="text-[11px] font-sans font-medium text-[#2c2620] hover:text-[#8b5a2b] flex items-center gap-1 border border-[#cfc3a9] bg-[#fffdfa] px-2 py-0.5 rounded transition"
                        title="Editar informações pessoais"
                      >
                        <Pencil className="h-3 w-3 text-[#8b5a2b]" />
                        <span>Editar</span>
                      </button>
                      <button
                        onClick={handleResetProfile}
                        className="text-[11px] font-sans font-medium text-[#8b5a2b] hover:text-[#5e3814] hover:underline"
                        title="Restaurar perfil inicial padrão (vazio)"
                      >
                        Restaurar Padrão
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm font-serif">
                    <div>
                      <span className="text-xs font-sans text-[#786c5e] block">Nome</span>
                      <span className="font-bold text-[#1f1913] text-base">
                        {profile.personal?.name?.trim() ? (
                          profile.personal.name
                        ) : (
                          <span className="text-[#8c7f70] italic font-normal font-sans text-xs">
                            (Não informado)
                          </span>
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs font-sans text-[#786c5e] block">Localização</span>
                      <span className="text-[#3a3127]">{profile.personal?.location || '-'}</span>
                    </div>
                    <div>
                      <span className="text-xs font-sans text-[#786c5e] block">E-mail</span>
                      <span className="text-[#3a3127]">{profile.personal?.email || '-'}</span>
                    </div>
                    <div>
                      <span className="text-xs font-sans text-[#786c5e] block">LinkedIn</span>
                      <span className="text-[#3a3127] truncate block">{profile.personal?.linkedin || '-'}</span>
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
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-sans font-bold text-[#5e5142] uppercase tracking-wider">
                      Experiências Registradas ({profile.experiences?.length || 0})
                    </h4>
                    <button
                      onClick={() => handleOpenAdd('experience')}
                      className="text-xs font-sans font-medium text-[#206634] hover:text-[#144221] bg-[#eef8f0] border border-[#a2d8b0] px-2.5 py-1 rounded flex items-center gap-1 transition"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Nova Experiência</span>
                    </button>
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {profile.experiences && profile.experiences.length > 0 ? (
                      profile.experiences.map((exp, idx) => (
                        <div key={idx} className="p-3 rounded border border-[#dfd5be] bg-[#fffdfa] text-xs space-y-1">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="font-bold text-sm text-[#221c16] block">{exp.role}</span>
                              <span className="text-[#635749] text-xs">{exp.company} {exp.location ? `• ${exp.location}` : ''}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[#756758] font-normal text-xs mr-1">{exp.period}</span>
                              <button
                                onClick={() => handleOpenEdit('experience', idx, exp)}
                                className="p-1 rounded text-[#756758] hover:text-[#2c2620] hover:bg-[#eee6d4] transition"
                                title="Editar experiência"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteItem('experience', idx)}
                                className="p-1 rounded text-[#993333] hover:text-[#771111] hover:bg-[#fce8e8] transition"
                                title="Excluir experiência"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          {exp.tags && exp.tags.length > 0 && (
                            <div className="text-[11px] text-[#8c7f70] pt-1 flex flex-wrap gap-1">
                              {exp.tags.slice(0, 6).map((t, i) => (
                                <span key={i} className="bg-[#f0e9dc] px-2 py-0.5 rounded">{t}</span>
                              ))}
                            </div>
                          )}
                          {exp.raw_bullets && exp.raw_bullets.length > 0 ? (
                            <p className="text-[11px] text-[#5e5142] italic line-clamp-2 pt-0.5">
                              "{exp.raw_bullets[0]}"
                            </p>
                          ) : (
                            <div className="pt-1 flex items-center gap-1.5 text-[10px] text-[#b45309]">
                              <AlertTriangle className="h-3 w-3" />
                              <span className="font-mono">Sem descrição/bullets cadastrados</span>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="p-4 bg-[#fffdfa] rounded border border-[#dfd5be] text-xs text-[#756758] italic font-serif text-center">
                        Nenhuma experiência cadastrada. Clique em "Nova Experiência" ou importe um currículo/LinkedIn em PDF.
                      </div>
                    )}
                  </div>
                </div>

                {/* Projects Summary */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-sans font-bold text-[#5e5142] uppercase tracking-wider">
                      Projetos Registrados ({profile.projects?.length || 0})
                    </h4>
                    <button
                      onClick={() => handleOpenAdd('project')}
                      className="text-xs font-sans font-medium text-[#206634] hover:text-[#144221] bg-[#eef8f0] border border-[#a2d8b0] px-2.5 py-1 rounded flex items-center gap-1 transition"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Novo Projeto</span>
                    </button>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {(profile.projects || []).length > 0 ? (
                      profile.projects.map((proj, idx) => (
                        <div key={idx} className="p-3 rounded border border-[#dfd5be] bg-[#fffdfa] text-xs space-y-1">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="font-bold text-sm text-[#221c16] block">{proj.title}</span>
                              {proj.subtitle && <span className="text-[#635749] text-xs">{proj.subtitle}</span>}
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[#756758] font-normal text-xs mr-1">{proj.period || proj.start_year || ''}</span>
                              <button
                                onClick={() => handleOpenEdit('project', idx, proj)}
                                className="p-1 rounded text-[#756758] hover:text-[#2c2620] hover:bg-[#eee6d4] transition"
                                title="Editar projeto"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteItem('project', idx)}
                                className="p-1 rounded text-[#993333] hover:text-[#771111] hover:bg-[#fce8e8] transition"
                                title="Excluir projeto"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          {proj.tags && proj.tags.length > 0 && (
                            <div className="text-[11px] text-[#8c7f70] pt-1 flex flex-wrap gap-1">
                              {proj.tags.slice(0, 6).map((t, i) => (
                                <span key={i} className="bg-[#f0e9dc] px-2 py-0.5 rounded">{t}</span>
                              ))}
                            </div>
                          )}
                          {proj.raw_bullets && proj.raw_bullets.length > 0 ? (
                            <p className="text-[11px] text-[#5e5142] italic line-clamp-2 pt-0.5">
                              "{proj.raw_bullets[0]}"
                            </p>
                          ) : (
                            <div className="pt-1 flex items-center gap-1.5 text-[10px] text-[#b45309]">
                              <AlertTriangle className="h-3 w-3" />
                              <span className="font-mono">Sem descrição técnica detalhada</span>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="p-4 bg-[#fffdfa] rounded border border-[#dfd5be] text-xs text-[#756758] italic font-serif text-center">
                        Nenhum projeto cadastrado. Clique em "Novo Projeto" ou importe repositórios do GitHub.
                      </div>
                    )}
                  </div>
                </div>

                {/* Awards Summary */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-sans font-bold text-[#5e5142] uppercase tracking-wider">
                      Conquistas & Certificações ({profile.awards_and_leadership?.length || 0})
                    </h4>
                    <div className="flex items-center gap-1.5">
                      {(profile.awards_and_leadership || []).length >= 2 && (
                        <button
                          type="button"
                          onClick={handleOpenFusionModal}
                          className="text-xs font-sans font-medium text-[#8b5a2b] hover:text-[#5c3c1a] bg-[#f8f1e3] border border-[#e2d0b6] px-2.5 py-1 rounded flex items-center gap-1 transition shadow-2xs"
                          title="Fundir 2 ou mais conquistas relacionadas em uma única entrada com IA"
                        >
                          <GitMerge className="h-3.5 w-3.5" />
                          <span>Fundir Conquistas</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenAdd('award')}
                        className="text-xs font-sans font-medium text-[#206634] hover:text-[#144221] bg-[#eef8f0] border border-[#a2d8b0] px-2.5 py-1 rounded flex items-center gap-1 transition"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Nova Conquista</span>
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {(profile.awards_and_leadership || []).length > 0 ? (
                      profile.awards_and_leadership.map((aw, idx) => (
                        <div key={idx} className="p-2.5 rounded border border-[#dfd5be] bg-[#fffdfa] text-xs">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="font-bold text-xs text-[#221c16] block">{aw.title}</span>
                              {aw.description ? (
                                <span className="text-[#635749] text-[11px] mt-0.5 block">{aw.description}</span>
                              ) : (
                                <div className="mt-1 flex items-center gap-1 text-[10px] text-[#b45309]">
                                  <AlertTriangle className="h-3 w-3" />
                                  <span className="font-mono">Sem descrição detalhada</span>
                                </div>
                              )}
                              {aw.tags && aw.tags.length > 0 && (
                                <div className="text-[11px] text-[#8c7f70] pt-1 flex flex-wrap gap-1">
                                  {aw.tags.map((t, ti) => (
                                    <span key={ti} className="bg-[#f0e9dc] text-[#4d4235] px-2 py-0.5 rounded text-[10px]">
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0 ml-2">
                              <span className="text-[#756758] font-normal text-[11px] mr-1">{aw.period_or_date}</span>
                              <button
                                onClick={() => handleOpenEdit('award', idx, aw)}
                                className="p-1 rounded text-[#756758] hover:text-[#2c2620] hover:bg-[#eee6d4] transition"
                                title="Editar conquista"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteItem('award', idx)}
                                className="p-1 rounded text-[#993333] hover:text-[#771111] hover:bg-[#fce8e8] transition"
                                title="Excluir conquista"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 bg-[#fffdfa] rounded border border-[#dfd5be] text-xs text-[#756758] italic font-serif text-center">
                        Nenhuma conquista cadastrada. Clique em "Nova Conquista" para adicionar.
                      </div>
                    )}
                  </div>
                </div>

                {/* Skills Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-sans font-bold text-[#5e5142] uppercase tracking-wider">
                      Competências Registradas por Categoria
                    </h4>
                    <button
                      type="button"
                      onClick={() => setShowAddCategory(!showAddCategory)}
                      className="text-xs font-sans font-medium text-[#206634] hover:text-[#144221] bg-[#eef8f0] border border-[#a2d8b0] px-2.5 py-0.5 rounded flex items-center gap-1 transition"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Nova Categoria</span>
                    </button>
                  </div>

                  {showAddCategory && (
                    <div className="flex items-center gap-2 p-2 bg-[#f9f5ee] border border-[#d8ccb4] rounded-md">
                      <input
                        type="text"
                        placeholder="Nome da categoria (ex: Cloud & DevOps, Ferramentas)..."
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCreateCategory(newCategoryName);
                          }
                        }}
                        className="bg-white border border-[#cfc3a9] rounded px-2.5 py-1 text-xs text-[#2c2620] flex-1 placeholder:text-[#9e907e]"
                      />
                      <button
                        type="button"
                        onClick={() => handleCreateCategory(newCategoryName)}
                        disabled={!newCategoryName.trim()}
                        className="px-3 py-1 bg-[#206634] hover:bg-[#164b25] text-white rounded text-xs font-semibold disabled:opacity-40 transition"
                      >
                        Criar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddCategory(false);
                          setNewCategoryName('');
                        }}
                        className="p-1 text-[#756758] hover:text-[#2c2620] rounded"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {profile.skills && Object.keys(profile.skills).length > 0 ? (
                    <div className="space-y-2">
                      {Object.entries(profile.skills).map(([category, items], idx) => (
                        <div key={idx} className="p-3 rounded border border-[#dfd5be] bg-[#fffdfa] text-xs space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[#3d3327] uppercase text-[11px] tracking-wider block">
                              {category} ({(Array.isArray(items) ? items : [items]).length})
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {(Array.isArray(items) ? items : [items]).map((sk, i) => {
                              const assoc = getSkillAssociations(sk);
                              const isDetailActive = activeSkillDetail === sk;
                              return (
                                <div key={i} className="inline-flex items-center group">
                                  <button
                                    type="button"
                                    onClick={() => setActiveSkillDetail(isDetailActive ? null : sk)}
                                    className={`px-2 py-0.5 rounded text-[11px] border transition flex items-center gap-1 ${
                                      isDetailActive
                                        ? 'bg-[#2c2620] text-white border-[#2c2620]'
                                        : 'bg-[#f0e9dc] hover:bg-[#e4dcce] text-[#4d4235] border-[#d8ccb4]'
                                    }`}
                                    title="Clique para inspecionar experiências, projetos e conquistas vinculados"
                                  >
                                    <span>{sk}</span>
                                    {assoc.total > 0 && (
                                      <span
                                        className={`ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                                          isDetailActive
                                            ? 'bg-white/20 text-white'
                                            : 'bg-[#d8eed0] text-[#1c6434] border border-[#a2d8b0]'
                                        }`}
                                      >
                                        ✓ {assoc.total}
                                      </span>
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveSkillFromCategory(category, sk)}
                                    className="opacity-0 group-hover:opacity-100 p-0.5 text-[#993333] hover:text-[#771111] hover:bg-[#fce8e8] rounded transition ml-0.5"
                                    title={`Remover ${sk} de ${category}`}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>

                          {/* Quick add skill to this category */}
                          <div className="flex items-center gap-1.5 pt-1.5 border-t border-[#f4ede0]">
                            <input
                              type="text"
                              placeholder={`+ Habilidade em ${category}...`}
                              value={newCategorySkillInputs[category] || ''}
                              onChange={(e) =>
                                setNewCategorySkillInputs({ ...newCategorySkillInputs, [category]: e.target.value })
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddSkillToCategory(category, newCategorySkillInputs[category]);
                                }
                              }}
                              className="bg-white border border-[#d8ccb4] rounded px-2 py-1 text-xs text-[#2c2620] w-56 placeholder:text-[#9e907e]"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddSkillToCategory(category, newCategorySkillInputs[category])}
                              disabled={!newCategorySkillInputs[category]?.trim()}
                              className="px-2.5 py-1 bg-[#f5ede0] hover:bg-[#ebdcc8] text-[#5e5142] border border-[#d8ccb4] rounded text-xs font-semibold disabled:opacity-40 transition"
                            >
                              Adicionar
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Active Skill Associations Detail Inspector */}
                      {activeSkillDetail && (() => {
                        const assoc = getSkillAssociations(activeSkillDetail);
                        return (
                          <div className="p-3 bg-[#fdfcf9] border-2 border-[#8b5a2b]/40 rounded-md shadow-xs space-y-2 animate-fadeIn">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <Tag className="h-4 w-4 text-[#8b5a2b]" />
                                <span className="font-bold text-xs text-[#2c2620]">
                                  Itens Vinculados à Habilidade: <span className="text-[#8b5a2b] font-mono uppercase">{activeSkillDetail}</span>
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setActiveSkillDetail(null)}
                                className="p-1 text-[#756758] hover:text-[#2c2620] rounded"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            {assoc.total === 0 ? (
                              <p className="text-[11px] text-[#756758] italic">
                                Nenhuma experiência, projeto ou conquista está associada a esta competência ainda. Edite um item para vinculá-la!
                              </p>
                            ) : (
                              <div className="space-y-1.5 text-xs">
                                {assoc.experiences.length > 0 && (
                                  <div>
                                    <span className="font-semibold text-[11px] text-[#3d3327] block">
                                      Experiências ({assoc.experiences.length}):
                                    </span>
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                      {assoc.experiences.map((exp, i) => (
                                        <span key={i} className="px-2 py-0.5 bg-[#eef8f0] text-[#1c6434] border border-[#a2d8b0] rounded text-[11px]">
                                          {exp.role} @ {exp.company}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {assoc.projects.length > 0 && (
                                  <div>
                                    <span className="font-semibold text-[11px] text-[#3d3327] block">
                                      Projetos ({assoc.projects.length}):
                                    </span>
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                      {assoc.projects.map((proj, i) => (
                                        <span key={i} className="px-2 py-0.5 bg-[#f0f4fe] text-[#1a56db] border border-[#a4bcfd] rounded text-[11px]">
                                          {proj.title}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {assoc.awards.length > 0 && (
                                  <div>
                                    <span className="font-semibold text-[11px] text-[#3d3327] block">
                                      Conquistas & Certificados ({assoc.awards.length}):
                                    </span>
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                      {assoc.awards.map((aw, i) => (
                                        <span key={i} className="px-2 py-0.5 bg-[#fef6ee] text-[#b45309] border border-[#fbd38d] rounded text-[11px]">
                                          {aw.title}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="p-4 bg-[#fffdfa] rounded border border-[#dfd5be] text-xs text-[#756758] italic font-serif text-center">
                      Nenhuma competência registrada. Importe um currículo em PDF ou adicione uma nova categoria acima.
                    </div>
                  )}
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
                      placeholder="Usuário do GitHub (ex: torvalds)"
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
            <div className="p-3.5 bg-[#fdf0f0] border-t border-[#e2a4a4] text-xs text-[#8c1c1c] flex items-center justify-between gap-2.5 shrink-0 font-sans">
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <AlertCircle className="h-4 w-4 shrink-0 text-[#c73434]" />
                <span className="break-words leading-relaxed">{typeof error === 'string' ? error : extractErrorMessage(error)}</span>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-[#8c1c1c] hover:text-[#501313] p-1 rounded hover:bg-[#fae2e2] transition shrink-0"
                title="Fechar mensagem"
              >
                <X className="h-3.5 w-3.5" />
              </button>
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
                className={`px-3.5 py-1.5 rounded transition font-medium flex items-center gap-2 ${
                  rightTab === 'scores'
                    ? 'bg-[#ede6d4] text-[#2c2620] border border-[#d0c4ac] font-semibold'
                    : 'text-[#706456] hover:text-[#2c2620]'
                }`}
              >
                <span>Diagnóstico ATS & Ranking</span>
                {result?.ats_diagnostics && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                    result.ats_diagnostics.score_pct >= 70
                      ? 'bg-[#206634]/15 text-[#206634] border border-[#206634]/30'
                      : 'bg-[#8b5a2b]/15 text-[#8b5a2b] border border-[#8b5a2b]/30'
                  }`}>
                    {result.ats_diagnostics.score_pct}% Match
                  </span>
                )}
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
                    {/* ATS Diagnostics Card */}
                    {result.ats_diagnostics && (
                      <div className="paper-card rounded-md p-4 space-y-4 border-l-4 border-l-[#8b5a2b]">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <span className="text-xs font-sans font-bold uppercase tracking-wider text-[#8b5a2b] block">
                              Diagnóstico de Aderência ATS
                            </span>
                            <div className="flex items-baseline gap-2 mt-0.5">
                              <span className="text-3xl font-serif font-bold text-[#221c16]">
                                {result.ats_diagnostics.score_pct}%
                              </span>
                              <span className={`text-xs font-sans font-medium px-2 py-0.5 rounded-full ${
                                result.ats_diagnostics.score_pct >= 75
                                  ? 'bg-[#eef8f0] text-[#1e582e] border border-[#a2d8b0]'
                                  : result.ats_diagnostics.score_pct >= 50
                                  ? 'bg-[#fef9ee] text-[#8b5a2b] border border-[#d6c9b1]'
                                  : 'bg-[#fdf0f0] text-[#8c1c1c] border border-[#e2a4a4]'
                              }`}>
                                {result.ats_diagnostics.score_pct >= 75
                                  ? 'Alta Compatibilidade'
                                  : result.ats_diagnostics.score_pct >= 50
                                  ? 'Compatibilidade Moderada'
                                  : 'Baixa Aderência'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 text-xs font-sans text-[#706456]">
                            <div className="text-center">
                              <span className="block text-base font-bold text-[#1e582e]">
                                {result.ats_diagnostics.matched_keywords?.length || 0}
                              </span>
                              <span className="text-[10px]">Identificadas</span>
                            </div>
                            <div className="text-center">
                              <span className="block text-base font-bold text-[#8c1c1c]">
                                {result.ats_diagnostics.missing_keywords?.length || 0}
                              </span>
                              <span className="text-[10px]">Ausentes</span>
                            </div>
                            <div className="text-center">
                              <span className="block text-base font-bold text-[#221c16]">
                                {result.ats_diagnostics.total_job_keywords || 0}
                              </span>
                              <span className="text-[10px]">Total na Vaga</span>
                            </div>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-[#e8ded0] h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 rounded-full ${
                              result.ats_diagnostics.score_pct >= 75
                                ? 'bg-[#206634]'
                                : result.ats_diagnostics.score_pct >= 50
                                ? 'bg-[#8b5a2b]'
                                : 'bg-[#a33]'
                            }`}
                            style={{ width: `${Math.min(100, result.ats_diagnostics.score_pct)}%` }}
                          />
                        </div>

                        {/* Matched Keywords */}
                        {result.ats_diagnostics.matched_keywords && result.ats_diagnostics.matched_keywords.length > 0 && (
                          <div className="space-y-1.5">
                            <span className="text-[11px] font-sans font-bold text-[#1e582e] flex items-center gap-1.5 uppercase">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Palavras-Chave Encontradas no Currículo ({result.ats_diagnostics.matched_keywords.length})
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {result.ats_diagnostics.matched_keywords.map((kw, i) => (
                                <span
                                  key={i}
                                  className="text-xs font-mono bg-[#eef8f0] text-[#1e582e] border border-[#a2d8b0] px-2 py-0.5 rounded"
                                >
                                  ✓ {kw}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Missing Keywords */}
                        {result.ats_diagnostics.missing_keywords && result.ats_diagnostics.missing_keywords.length > 0 && (
                          <div className="space-y-1.5">
                            <span className="text-[11px] font-sans font-bold text-[#8b5a2b] flex items-center gap-1.5 uppercase">
                              <AlertCircle className="h-3.5 w-3.5 text-[#8b5a2b]" />
                              Palavras-Chave da Vaga Ausentes no Documento ({result.ats_diagnostics.missing_keywords.length})
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {result.ats_diagnostics.missing_keywords.slice(0, 20).map((kw, i) => (
                                <span
                                  key={i}
                                  className="text-xs font-mono bg-[#fdf8ed] text-[#785324] border border-[#e5d5be] px-2 py-0.5 rounded"
                                >
                                  + {kw}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Incomplete Items Alert Banner */}
                        {result.ats_diagnostics.incomplete_items && result.ats_diagnostics.incomplete_items.length > 0 && (
                          <div className="p-3.5 bg-[#fef7ee] rounded-md border border-[#f3d19e] space-y-2.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-[#c05621] shrink-0" />
                                <span className="font-bold text-xs font-sans text-[#7b341e] uppercase tracking-wider">
                                  Itens Selecionados com Descrição Incompleta ({result.ats_diagnostics.incomplete_items.length})
                                </span>
                              </div>
                              <span className="text-[10px] font-mono bg-[#fbd38d] text-[#744210] px-2 py-0.5 rounded font-bold">
                                Ação Necessária
                              </span>
                            </div>
                            <p className="text-xs text-[#7b341e] font-serif leading-relaxed">
                              O algoritmo ATS ranqueou estes itens como ideais para a vaga, mas eles possuem descrições curtas ou ausentes no perfil. Complete-os para valorizar suas competências e pontuar nos filtros:
                            </p>
                            <div className="space-y-2 pt-1">
                              {result.ats_diagnostics.incomplete_items.map((item, idx) => (
                                <div key={idx} className="bg-white p-2.5 rounded border border-[#ebd2b2] flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 shadow-2xs">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] uppercase font-bold font-mono px-1.5 py-0.5 rounded bg-[#f3ebd8] text-[#6b583f]">
                                        {item.type_label}
                                      </span>
                                      <span className="font-bold text-xs text-[#1f1913] truncate">
                                        {item.title}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-[#8b5a2b] mt-0.5">
                                      {item.reason} — <span className="italic">{item.suggestion}</span>
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditById(item.type, item.id, item)}
                                    className="shrink-0 flex items-center gap-1.5 text-xs font-sans font-bold bg-[#8b5a2b] hover:bg-[#724a23] text-white px-3 py-1.5 rounded transition-colors shadow-2xs"
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                    Completar Descrição
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Recommendations */}
                        {result.ats_diagnostics.recommendations && result.ats_diagnostics.recommendations.length > 0 && (
                          <div className="p-3 bg-[#fdfcf9] rounded border border-[#dfd5be] space-y-1 text-xs">
                            <span className="font-bold text-[#3d3327] block text-[11px] uppercase tracking-wider">
                              Recomendações Acionáveis
                            </span>
                            <ul className="list-disc list-inside space-y-1 text-[#615446] font-serif">
                              {result.ats_diagnostics.recommendations.map((rec, i) => (
                                <li key={i}>{rec}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Experiences Selection */}
                    <div>
                      <h4 className="text-xs font-sans font-bold uppercase tracking-wider text-[#8b5a2b] mb-3 flex items-center gap-2">
                        <Layers className="h-4 w-4" />
                        Experiências Selecionadas
                      </h4>
                      <div className="space-y-3">
                        {result.selected_experiences?.map((exp, idx) => {
                          const bullets = exp.formatted_bullets || exp.raw_bullets || [];
                          const isUnderDescribed = !bullets || bullets.length === 0 || bullets.join(' ').trim().length < 30;
                          return (
                            <div key={idx} className="paper-card rounded-md p-4 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-base text-[#1f1913] font-serif">
                                  {exp.role} @ {exp.company}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-bold text-[#2c2620] bg-[#f0e8d7] px-2.5 py-0.5 rounded border border-[#d6c9b1]">
                                    Score: {exp.score?.toFixed(3)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditById('experience', exp.id, exp)}
                                    title="Editar esta experiência no perfil"
                                    className="p-1 hover:bg-[#ede5d2] rounded text-[#756758] hover:text-[#2c2620] transition"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {exp.tags?.map((t, i) => (
                                  <span key={i} className="text-xs font-sans bg-[#ede5d2] text-[#4d4235] px-2 py-0.5 rounded">
                                    {t}
                                  </span>
                                ))}
                              </div>
                              {isUnderDescribed ? (
                                <div className="flex items-center justify-between p-2.5 bg-[#fdf5eb] rounded border border-[#f3d19e] text-xs text-[#8b5a2b]">
                                  <span className="flex items-center gap-1.5 font-medium">
                                    <AlertTriangle className="h-3.5 w-3.5 text-[#c05621] shrink-0" />
                                    Experiência selecionada com poucos ou nenhum tópico descritivo.
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditById('experience', exp.id, exp)}
                                    className="flex items-center gap-1 text-[11px] font-bold text-[#8b5a2b] hover:text-[#5c3c1a] bg-white px-2 py-1 rounded border border-[#dfcaa7] shrink-0 shadow-2xs"
                                  >
                                    <Edit3 className="h-3 w-3" />
                                    Completar
                                  </button>
                                </div>
                              ) : (
                                <ul className="text-sm text-[#42392f] space-y-1.5 list-disc list-inside font-serif mt-1">
                                  {bullets.map((b, i) => (
                                    <li key={i} className="text-sm leading-relaxed">
                                      {b.replace(/\\textbf\{([^}]+)\}/g, '$1')}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Projects Selection */}
                    <div>
                      <h4 className="text-xs font-sans font-bold uppercase tracking-wider text-[#8b5a2b] mb-3 flex items-center gap-2">
                        <BookOpen className="h-4 w-4" />
                        Projetos Selecionados
                      </h4>
                      <div className="space-y-3">
                        {result.selected_projects?.map((proj, idx) => {
                          const bullets = proj.formatted_bullets || proj.raw_bullets || [];
                          const isUnderDescribed = !bullets || bullets.length === 0 || bullets.join(' ').trim().length < 30;
                          return (
                            <div key={idx} className="paper-card rounded-md p-4 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-base text-[#1f1913] font-serif">
                                  {proj.title} {proj.subtitle && `(${proj.subtitle})`}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-bold text-[#2c2620] bg-[#f0e8d7] px-2.5 py-0.5 rounded border border-[#d6c9b1]">
                                    Score: {proj.score?.toFixed(3)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditById('project', proj.id, proj)}
                                    title="Editar este projeto no perfil"
                                    className="p-1 hover:bg-[#ede5d2] rounded text-[#756758] hover:text-[#2c2620] transition"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                              {isUnderDescribed ? (
                                <div className="flex items-center justify-between p-2.5 bg-[#fdf5eb] rounded border border-[#f3d19e] text-xs text-[#8b5a2b]">
                                  <span className="flex items-center gap-1.5 font-medium">
                                    <AlertTriangle className="h-3.5 w-3.5 text-[#c05621] shrink-0" />
                                    Projeto selecionado sem descrição técnica ou resultados detalhados.
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditById('project', proj.id, proj)}
                                    className="flex items-center gap-1 text-[11px] font-bold text-[#8b5a2b] hover:text-[#5c3c1a] bg-white px-2 py-1 rounded border border-[#dfcaa7] shrink-0 shadow-2xs"
                                  >
                                    <Edit3 className="h-3 w-3" />
                                    Completar
                                  </button>
                                </div>
                              ) : (
                                <ul className="text-sm text-[#42392f] space-y-1.5 list-disc list-inside font-serif mt-1">
                                  {bullets.map((b, i) => (
                                    <li key={i} className="text-sm leading-relaxed">
                                      {b.replace(/\\textbf\{([^}]+)\}/g, '$1')}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Awards Selection */}
                    <div>
                      <h4 className="text-xs font-sans font-bold uppercase tracking-wider text-[#8b5a2b] mb-3 flex items-center gap-2">
                        <Award className="h-4 w-4" />
                        Conquistas & Reconhecimentos Selecionados ({result.selected_awards?.length || 0})
                      </h4>
                      {result.selected_awards && result.selected_awards.length > 0 ? (
                        <div className="space-y-3">
                          {result.selected_awards.map((aw, idx) => (
                            <div key={idx} className="paper-card rounded-md p-4 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-base text-[#1f1913] font-serif">
                                  {aw.title}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-sans text-[#756758]">{aw.period_or_date}</span>
                                  <span className="text-xs font-mono font-bold text-[#2c2620] bg-[#f0e8d7] px-2.5 py-0.5 rounded border border-[#d6c9b1]">
                                    Score: {aw.score?.toFixed(3)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditById('award', aw.id, aw)}
                                    title="Editar esta conquista no perfil"
                                    className="p-1 hover:bg-[#ede5d2] rounded text-[#756758] hover:text-[#2c2620] transition"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                              {!aw.description?.trim() ? (
                                <div className="flex items-center justify-between p-2.5 bg-[#fdf5eb] rounded border border-[#f3d19e] text-xs text-[#8b5a2b]">
                                  <span className="flex items-center gap-1.5 font-medium">
                                    <AlertTriangle className="h-3.5 w-3.5 text-[#c05621] shrink-0" />
                                    Descrição ausente — informe o escopo ou tecnologias desta conquista/certificado.
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditById('award', aw.id, aw)}
                                    className="flex items-center gap-1 text-[11px] font-bold text-[#8b5a2b] hover:text-[#5c3c1a] bg-white px-2 py-1 rounded border border-[#dfcaa7] shrink-0 shadow-2xs"
                                  >
                                    <Edit3 className="h-3 w-3" />
                                    Completar
                                  </button>
                                </div>
                              ) : (
                                <p className="text-sm text-[#42392f] font-serif leading-relaxed">
                                  {aw.description}
                                </p>
                              )}
                              {aw.tags && aw.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {aw.tags.map((t, i) => (
                                    <span key={i} className="text-xs font-sans bg-[#ede5d2] text-[#4d4235] px-2 py-0.5 rounded">
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-3.5 bg-[#fdfcf9] rounded border border-[#dfd5be] text-xs text-[#756758] italic font-serif">
                          Nenhuma conquista ou premiação selecionada para o orçamento de 1 página desta vaga.
                        </div>
                      )}
                    </div>

                    {/* Categorized Skills Breakdown */}
                    <div>
                      <h4 className="text-xs font-sans font-bold uppercase tracking-wider text-[#8b5a2b] mb-3 flex items-center gap-2">
                        <GraduationCap className="h-4 w-4" />
                        Competências & Habilidades no Currículo (Por Categoria)
                      </h4>
                      <div className="space-y-3">
                        {Object.entries(result.skills || profile?.skills || {}).map(([category, items], idx) => {
                          const skillList = Array.isArray(items) ? items : [items];
                          const matchedSet = new Set(
                            (result.ats_diagnostics?.matched_keywords || []).map((k) => k.toLowerCase())
                          );
                          const matchedCount = skillList.filter((s) =>
                            matchedSet.has(s.toLowerCase()) ||
                            s.toLowerCase().split(/\s+/).some((part) => matchedSet.has(part))
                          ).length;

                          return (
                            <div key={idx} className="paper-card rounded-md p-4 space-y-2">
                              <div className="flex items-center justify-between border-b border-[#ded5bf] pb-1.5">
                                <span className="font-bold text-xs uppercase tracking-wider text-[#3d3327]">
                                  {category}
                                </span>
                                <span className="text-[11px] font-sans text-[#706456]">
                                  {matchedCount > 0 ? (
                                    <span className="text-[#1e582e] font-semibold">
                                      ✓ {matchedCount} {matchedCount === 1 ? 'termo aderente' : 'termos aderentes'} à vaga
                                    </span>
                                  ) : (
                                    <span>{skillList.length} itens</span>
                                  )}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {skillList.map((sk, i) => {
                                  const isMatched =
                                    matchedSet.has(sk.toLowerCase()) ||
                                    sk.toLowerCase().split(/\s+/).some((part) => matchedSet.has(part));

                                  return (
                                    <span
                                      key={i}
                                      className={`text-xs font-sans px-2.5 py-1 rounded flex items-center gap-1 transition ${
                                        isMatched
                                          ? 'bg-[#eef8f0] text-[#1e582e] border border-[#9fd8ad] font-semibold shadow-2xs'
                                          : 'bg-[#ede5d2] text-[#4d4235] border border-transparent'
                                      }`}
                                    >
                                      {isMatched && <Check className="h-3 w-3 text-[#1e582e]" />}
                                      <span>{sk}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
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

      {/* Profile Item Editor Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-[#2c2620]/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#fdfbf7] border border-[#cfc3a9] rounded-lg max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#ded5bf] pb-3">
              <h3 className="font-serif font-bold text-base text-[#221c16]">
                {editingItem.type === 'personal'
                  ? 'Editar Dados Pessoais'
                  : editingItem.index !== null
                  ? `Editar ${editingItem.type === 'experience' ? 'Experiência' : editingItem.type === 'project' ? 'Projeto' : 'Conquista'}`
                  : `Nova ${editingItem.type === 'experience' ? 'Experiência' : editingItem.type === 'project' ? 'Projeto' : 'Conquista'}`}
              </h3>
              <button
                onClick={() => setEditingItem(null)}
                className="p-1 rounded text-[#756758] hover:text-[#221c16] hover:bg-[#ede5d2] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-4 text-xs font-sans">
              {editingItem.type === 'personal' && (
                <>
                  <div>
                    <label className="block text-[11px] font-bold text-[#5e5142] uppercase mb-1">Nome Completo *</label>
                    <input
                      type="text"
                      required
                      value={editingItem.form.name || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, form: { ...editingItem.form, name: e.target.value } })}
                      className="w-full bg-[#fffdfa] border border-[#d8ccb4] rounded px-3 py-1.5 text-xs text-[#2c2620]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-[#5e5142] uppercase mb-1">Localização</label>
                      <input
                        type="text"
                        value={editingItem.form.location || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, form: { ...editingItem.form, location: e.target.value } })}
                        placeholder="Cidade, Estado, País"
                        className="w-full bg-[#fffdfa] border border-[#d8ccb4] rounded px-3 py-1.5 text-xs text-[#2c2620]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#5e5142] uppercase mb-1">E-mail</label>
                      <input
                        type="email"
                        value={editingItem.form.email || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, form: { ...editingItem.form, email: e.target.value } })}
                        className="w-full bg-[#fffdfa] border border-[#d8ccb4] rounded px-3 py-1.5 text-xs text-[#2c2620]"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-[#5e5142] uppercase mb-1">LinkedIn (URL)</label>
                      <input
                        type="text"
                        value={editingItem.form.linkedin || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, form: { ...editingItem.form, linkedin: e.target.value } })}
                        className="w-full bg-[#fffdfa] border border-[#d8ccb4] rounded px-3 py-1.5 text-xs text-[#2c2620]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#5e5142] uppercase mb-1">GitHub (URL)</label>
                      <input
                        type="text"
                        value={editingItem.form.github || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, form: { ...editingItem.form, github: e.target.value } })}
                        className="w-full bg-[#fffdfa] border border-[#d8ccb4] rounded px-3 py-1.5 text-xs text-[#2c2620]"
                      />
                    </div>
                  </div>
                </>
              )}

              {editingItem.type === 'experience' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-[#5e5142] uppercase mb-1">Cargo / Função *</label>
                      <input
                        type="text"
                        required
                        value={editingItem.form.role || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, form: { ...editingItem.form, role: e.target.value } })}
                        placeholder="Ex: Engenheiro de Software"
                        className="w-full bg-[#fffdfa] border border-[#d8ccb4] rounded px-3 py-1.5 text-xs text-[#2c2620]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#5e5142] uppercase mb-1">Empresa *</label>
                      <input
                        type="text"
                        required
                        value={editingItem.form.company || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, form: { ...editingItem.form, company: e.target.value } })}
                        placeholder="Ex: Google, UFMG, Startup"
                        className="w-full bg-[#fffdfa] border border-[#d8ccb4] rounded px-3 py-1.5 text-xs text-[#2c2620]"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-[#5e5142] uppercase mb-1">Período</label>
                      <input
                        type="text"
                        value={editingItem.form.period || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, form: { ...editingItem.form, period: e.target.value } })}
                        placeholder="Ex: Jan 2024 - Presente"
                        className="w-full bg-[#fffdfa] border border-[#d8ccb4] rounded px-3 py-1.5 text-xs text-[#2c2620]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#5e5142] uppercase mb-1">Localização</label>
                      <input
                        type="text"
                        value={editingItem.form.location || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, form: { ...editingItem.form, location: e.target.value } })}
                        placeholder="Ex: Belo Horizonte, MG"
                        className="w-full bg-[#fffdfa] border border-[#d8ccb4] rounded px-3 py-1.5 text-xs text-[#2c2620]"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[11px] font-bold text-[#5e5142] uppercase">
                        Bullets de Impacto (um por linha)
                      </label>
                      <div className="flex items-center gap-1">
                        {editingItem.form.raw_bullets && editingItem.form.raw_bullets.trim().length > 0 ? (
                          <>
                            <button
                              type="button"
                              disabled={isSuggesting}
                              onClick={() =>
                                handleSuggestDescription(
                                  'experience',
                                  `${editingItem.form.role} @ ${editingItem.form.company}`,
                                  editingItem.form.location,
                                  editingItem.form.raw_bullets,
                                  'improve'
                                )
                              }
                              className="text-[11px] font-sans font-bold text-[#8b5a2b] hover:text-[#5c3c1a] bg-[#f8f1e3] border border-[#e2d0b6] px-2 py-0.5 rounded flex items-center gap-1 transition disabled:opacity-50"
                              title="Refina os bullets atuais para frases completas de alto impacto"
                            >
                              <Sparkles className="h-3 w-3" />
                              <span>{isSuggesting ? 'Processando...' : 'Melhorar Texto'}</span>
                            </button>
                            <button
                              type="button"
                              disabled={isSuggesting}
                              onClick={() =>
                                handleSuggestDescription(
                                  'experience',
                                  `${editingItem.form.role} @ ${editingItem.form.company}`,
                                  editingItem.form.location,
                                  editingItem.form.raw_bullets,
                                  'cross_ref'
                                )
                              }
                              className="text-[11px] font-sans font-bold text-[#206634] hover:text-[#144221] bg-[#eef8f0] border border-[#a2d8b0] px-2 py-0.5 rounded flex items-center gap-1 transition disabled:opacity-50"
                              title="Cruza detalhes com projetos e métricas do perfil"
                            >
                              <BookOpen className="h-3 w-3" />
                              <span>Enriquecer c/ Projetos</span>
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={isSuggesting}
                            onClick={() =>
                              handleSuggestDescription(
                                'experience',
                                `${editingItem.form.role} @ ${editingItem.form.company}`,
                                editingItem.form.location,
                                '',
                                'generate'
                              )
                            }
                            className="text-[11px] font-sans font-bold text-[#8b5a2b] hover:text-[#5c3c1a] bg-[#f8f1e3] border border-[#e2d0b6] px-2 py-0.5 rounded flex items-center gap-1 transition disabled:opacity-50"
                          >
                            <Sparkles className="h-3 w-3" />
                            <span>{isSuggesting ? 'Sugerindo...' : 'Sugerir Bullets IA'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                    <textarea
                      rows={4}
                      value={editingItem.form.raw_bullets || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, form: { ...editingItem.form, raw_bullets: e.target.value } })}
                      placeholder="Descreva realizações com verbos de ação e métricas..."
                      className="w-full bg-[#fffdfa] border border-[#d8ccb4] rounded p-2 text-xs text-[#2c2620] resize-y leading-relaxed"
                    />
                  </div>
                </>
              )}

              {editingItem.type === 'project' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-[#5e5142] uppercase mb-1">Título do Projeto *</label>
                      <input
                        type="text"
                        required
                        value={editingItem.form.title || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, form: { ...editingItem.form, title: e.target.value } })}
                        placeholder="Ex: AtesN-DS"
                        className="w-full bg-[#fffdfa] border border-[#d8ccb4] rounded px-3 py-1.5 text-xs text-[#2c2620]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#5e5142] uppercase mb-1">Subtítulo / Stack</label>
                      <input
                        type="text"
                        value={editingItem.form.subtitle || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, form: { ...editingItem.form, subtitle: e.target.value } })}
                        placeholder="Ex: eBPF, XDP, C, Linux Kernel"
                        className="w-full bg-[#fffdfa] border border-[#d8ccb4] rounded px-3 py-1.5 text-xs text-[#2c2620]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[#5e5142] uppercase mb-1">Período / Ano</label>
                    <input
                      type="text"
                      value={editingItem.form.period || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, form: { ...editingItem.form, period: e.target.value } })}
                      placeholder="Ex: 2025"
                      className="w-full bg-[#fffdfa] border border-[#d8ccb4] rounded px-3 py-1.5 text-xs text-[#2c2620]"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[11px] font-bold text-[#5e5142] uppercase">
                        Bullets de Descrição & Métricas (um por linha)
                      </label>
                      <div className="flex items-center gap-1">
                        {editingItem.form.raw_bullets && editingItem.form.raw_bullets.trim().length > 0 ? (
                          <>
                            <button
                              type="button"
                              disabled={isSuggesting}
                              onClick={() =>
                                handleSuggestDescription(
                                  'project',
                                  editingItem.form.title,
                                  editingItem.form.subtitle,
                                  editingItem.form.raw_bullets,
                                  'improve'
                                )
                              }
                              className="text-[11px] font-sans font-bold text-[#8b5a2b] hover:text-[#5c3c1a] bg-[#f8f1e3] border border-[#e2d0b6] px-2 py-0.5 rounded flex items-center gap-1 transition disabled:opacity-50"
                              title="Refina os bullets atuais transformando em frases completas e autoritativas"
                            >
                              <Sparkles className="h-3 w-3" />
                              <span>{isSuggesting ? 'Processando...' : 'Melhorar Texto'}</span>
                            </button>
                            <button
                              type="button"
                              disabled={isSuggesting}
                              onClick={() =>
                                handleSuggestDescription(
                                  'project',
                                  editingItem.form.title,
                                  editingItem.form.subtitle,
                                  editingItem.form.raw_bullets,
                                  'cross_ref'
                                )
                              }
                              className="text-[11px] font-sans font-bold text-[#206634] hover:text-[#144221] bg-[#eef8f0] border border-[#a2d8b0] px-2 py-0.5 rounded flex items-center gap-1 transition disabled:opacity-50"
                              title="Enriquece com outras pesquisas e publicações do perfil"
                            >
                              <BookOpen className="h-3 w-3" />
                              <span>Enriquecer c/ Perfil</span>
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={isSuggesting}
                            onClick={() =>
                              handleSuggestDescription(
                                'project',
                                editingItem.form.title,
                                editingItem.form.subtitle,
                                '',
                                'generate'
                              )
                            }
                            className="text-[11px] font-sans font-bold text-[#8b5a2b] hover:text-[#5c3c1a] bg-[#f8f1e3] border border-[#e2d0b6] px-2 py-0.5 rounded flex items-center gap-1 transition disabled:opacity-50"
                          >
                            <Sparkles className="h-3 w-3" />
                            <span>{isSuggesting ? 'Sugerindo...' : 'Sugerir Bullets IA'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                    <textarea
                      rows={3}
                      value={editingItem.form.raw_bullets || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, form: { ...editingItem.form, raw_bullets: e.target.value } })}
                      placeholder="Descreva as soluções e impactos alcançados..."
                      className="w-full bg-[#fffdfa] border border-[#d8ccb4] rounded p-2 text-xs text-[#2c2620] resize-y leading-relaxed"
                    />
                  </div>
                </>
              )}

              {editingItem.type === 'award' && (
                <>
                  <div>
                    <label className="block text-[11px] font-bold text-[#5e5142] uppercase mb-1">Título da Conquista / Certificação *</label>
                    <input
                      type="text"
                      required
                      value={editingItem.form.title || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, form: { ...editingItem.form, title: e.target.value } })}
                      placeholder="Ex: Relevância Acadêmica na Semana do Conhecimento UFMG 2025"
                      className="w-full bg-[#fffdfa] border border-[#d8ccb4] rounded px-3 py-1.5 text-xs text-[#2c2620]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[#5e5142] uppercase mb-1">Data / Ano / Tipo</label>
                    <input
                      type="text"
                      value={editingItem.form.period_or_date || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, form: { ...editingItem.form, period_or_date: e.target.value } })}
                      placeholder="Ex: 2025 ou Certificação"
                      className="w-full bg-[#fffdfa] border border-[#d8ccb4] rounded px-3 py-1.5 text-xs text-[#2c2620]"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[11px] font-bold text-[#5e5142] uppercase">
                        Descrição / Detalhes
                      </label>
                      <div className="flex items-center gap-1">
                        {editingItem.form.description && editingItem.form.description.trim().length > 0 ? (
                          <>
                            <button
                              type="button"
                              disabled={isSuggesting}
                              onClick={() =>
                                handleSuggestDescription(
                                  'award',
                                  editingItem.form.title,
                                  editingItem.form.period_or_date,
                                  editingItem.form.description,
                                  'improve'
                                )
                              }
                              className="text-[11px] font-sans font-bold text-[#8b5a2b] hover:text-[#5c3c1a] bg-[#f8f1e3] border border-[#e2d0b6] px-2 py-0.5 rounded flex items-center gap-1 transition disabled:opacity-50"
                              title="Refina o texto atual transformando em frases completas e autoritativas"
                            >
                              <Sparkles className="h-3 w-3" />
                              <span>{isSuggesting ? 'Processando...' : 'Melhorar Texto'}</span>
                            </button>
                            <button
                              type="button"
                              disabled={isSuggesting}
                              onClick={() =>
                                handleSuggestDescription(
                                  'award',
                                  editingItem.form.title,
                                  editingItem.form.period_or_date,
                                  editingItem.form.description,
                                  'cross_ref'
                                )
                              }
                              className="text-[11px] font-sans font-bold text-[#206634] hover:text-[#144221] bg-[#eef8f0] border border-[#a2d8b0] px-2 py-0.5 rounded flex items-center gap-1 transition disabled:opacity-50"
                              title="Enriquece a conquista com métricas reais dos seus projetos (ex: AtesN-DS, eBPF, 51% latência)"
                            >
                              <BookOpen className="h-3 w-3" />
                              <span>Enriquecer c/ Projetos</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={isSuggesting}
                              onClick={() =>
                                handleSuggestDescription(
                                  'award',
                                  editingItem.form.title,
                                  editingItem.form.period_or_date,
                                  '',
                                  'generate'
                                )
                              }
                              className="text-[11px] font-sans font-bold text-[#8b5a2b] hover:text-[#5c3c1a] bg-[#f8f1e3] border border-[#e2d0b6] px-2 py-0.5 rounded flex items-center gap-1 transition disabled:opacity-50"
                            >
                              <Sparkles className="h-3 w-3" />
                              <span>{isSuggesting ? 'Sugerindo...' : 'Sugerir com IA'}</span>
                            </button>
                            <button
                              type="button"
                              disabled={isSuggesting}
                              onClick={() =>
                                handleSuggestDescription(
                                  'award',
                                  editingItem.form.title,
                                  editingItem.form.period_or_date,
                                  '',
                                  'cross_ref'
                                )
                              }
                              className="text-[11px] font-sans font-bold text-[#206634] hover:text-[#144221] bg-[#eef8f0] border border-[#a2d8b0] px-2 py-0.5 rounded flex items-center gap-1 transition disabled:opacity-50"
                              title="Sintetiza usando detalhes do projeto relacionado (ex: AtesN-DS)"
                            >
                              <BookOpen className="h-3 w-3" />
                              <span>Vincular ao Projeto</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <textarea
                      rows={2}
                      value={editingItem.form.description || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, form: { ...editingItem.form, description: e.target.value } })}
                      placeholder="Ex: Apresentação técnica do projeto AtesN-DS ou premiação acadêmica..."
                      className="w-full bg-[#fffdfa] border border-[#d8ccb4] rounded p-2 text-xs text-[#2c2620] resize-y"
                    />
                  </div>
                </>
              )}

              {/* Componente Universal de Associação de Habilidades para Experiências, Projetos e Conquistas */}
              {editingItem.type !== 'personal' && (
                <div className="space-y-2 pt-2 border-t border-[#ebdcc8]">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-bold text-[#5e5142] uppercase flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5 text-[#8b5a2b]" />
                      <span>Habilidades & Tecnologias Associadas ({Array.isArray(editingItem.form.tags) ? editingItem.form.tags.length : 0})</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleAutoDetectSkills}
                      className="text-[11px] font-sans font-bold text-[#206634] hover:text-[#144221] bg-[#eef8f0] border border-[#a2d8b0] px-2 py-0.5 rounded flex items-center gap-1 transition shadow-2xs"
                      title="Analisa o texto deste item e vincula automaticamente competências do perfil"
                    >
                      <Sparkles className="h-3 w-3" />
                      <span>Auto-detectar do Texto</span>
                    </button>
                  </div>

                  {/* Active Chips */}
                  <div className="flex flex-wrap gap-1.5 min-h-[34px] p-2 bg-[#fdfcf9] border border-[#d8ccb4] rounded-md items-center">
                    {Array.isArray(editingItem.form.tags) && editingItem.form.tags.length > 0 ? (
                      editingItem.form.tags.map((t, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 bg-[#2c2620] text-[#f7f3e8] px-2 py-0.5 rounded text-[11px] font-medium shadow-2xs"
                        >
                          <span>{t}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveTagFromEditingItem(t)}
                            className="hover:text-[#f87171] text-[#c4b5a0] transition ml-0.5"
                            title={`Desvincular ${t}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-[#8c7f70] italic">
                        Nenhuma habilidade associada ainda. Digite abaixo ou selecione da lista rápida.
                      </span>
                    )}
                  </div>

                  {/* Custom Tag Input */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newSkillInput}
                      onChange={(e) => setNewSkillInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTagToEditingItem(newSkillInput);
                        }
                      }}
                      placeholder="Digitar habilidade (ex: Docker, Rust, eBPF)..."
                      className="flex-1 bg-[#fffdfa] border border-[#d8ccb4] rounded px-3 py-1.5 text-xs text-[#2c2620] placeholder:text-[#9e907e]"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddTagToEditingItem(newSkillInput)}
                      disabled={!newSkillInput.trim()}
                      className="px-3 py-1.5 bg-[#8b5a2b] hover:bg-[#6e441f] text-white rounded text-xs font-semibold disabled:opacity-40 transition flex items-center gap-1 shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Vincular</span>
                    </button>
                  </div>

                  {/* Quick Palette from Profile Skills */}
                  {allProfileSkills.length > 0 && (
                    <div className="pt-1">
                      <span className="text-[10px] font-bold text-[#756758] uppercase tracking-wider block mb-1">
                        Competências do Perfil (clique para alternar vínculo):
                      </span>
                      <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1.5 bg-white border border-[#ebdcc8] rounded">
                        {allProfileSkills.map((sk, idx) => {
                          const isSelected = Array.isArray(editingItem.form.tags) &&
                            editingItem.form.tags.some((t) => t.toLowerCase() === sk.toLowerCase());
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleToggleTagInEditingItem(sk)}
                              className={`text-[11px] px-2 py-0.5 rounded border transition flex items-center gap-1 ${
                                isSelected
                                  ? 'bg-[#206634] text-white border-[#206634] font-medium shadow-2xs'
                                  : 'bg-[#f8f5ee] hover:bg-[#eee6d4] text-[#4d4235] border-[#dfd5be]'
                              }`}
                            >
                              {isSelected && <Check className="h-2.5 w-2.5" />}
                              <span>{sk}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Inline AI Suggestion Preview with Token Accountability */}
              {aiSuggestionState && (
                <div className="p-3 bg-[#fdfcf9] border border-[#c4a478] rounded-md shadow-xs space-y-2 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-[#8b5a2b]" />
                      <span className="text-[11px] font-bold uppercase text-[#5e5142]">
                        Sugestão da IA ({aiSuggestionState.mode === 'improve' ? 'Texto Melhorado' : aiSuggestionState.mode === 'cross_ref' ? 'Enriquecido c/ Perfil' : 'Nova Descrição'})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {aiSuggestionState.tokens_saved > 0 ? (
                        <span className="text-[10px] font-mono bg-[#eef8f0] text-[#1c6434] border border-[#a2d8b0] px-2 py-0.5 rounded flex items-center gap-1 font-semibold">
                          <Zap className="h-2.5 w-2.5" />
                          {aiSuggestionState.tokens_saved} tokens poupados ({aiSuggestionState.provider === 'offline_heuristic' ? 'IA Offline' : 'LLM'})
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono bg-[#fdf5eb] text-[#8b5a2b] border border-[#f0d4b8] px-2 py-0.5 rounded flex items-center gap-1 font-semibold">
                          <Sparkles className="h-2.5 w-2.5" />
                          {aiSuggestionState.tokens_used} tokens consumidos
                        </span>
                      )}
                    </div>
                  </div>

                  {aiSuggestionState.cross_refs && aiSuggestionState.cross_refs.length > 0 && (
                    <div className="text-[10px] text-[#6b583f] bg-[#f7f2e7] px-2 py-1 rounded flex items-center gap-1.5">
                      <BookOpen className="h-3 w-3 text-[#8b5a2b] shrink-0" />
                      <span className="truncate">
                        Fatos e métricas cruzados de: <strong>{aiSuggestionState.cross_refs.map((r) => r.title).join(', ')}</strong>
                      </span>
                    </div>
                  )}

                  <div className="p-2.5 bg-white rounded border border-[#dfd5be] text-xs text-[#2c2620] leading-relaxed whitespace-pre-line font-serif">
                    {aiSuggestionState.text}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleDismissAiSuggestion}
                      className="px-2.5 py-1 text-[11px] text-[#756758] hover:text-[#2c2620] hover:bg-[#ede5d2] rounded transition"
                    >
                      Descartar
                    </button>
                    {editingItem.type !== 'award' && (
                      <button
                        type="button"
                        onClick={() => handleApplyAiSuggestion('append')}
                        className="px-2.5 py-1 text-[11px] font-semibold text-[#8b5a2b] bg-[#f8f1e3] border border-[#e2d0b6] hover:bg-[#ebd9c1] rounded transition"
                      >
                        + Anexar ao Final
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleApplyAiSuggestion('replace')}
                      className="px-3 py-1 text-[11px] font-semibold text-[#f7f3e8] bg-[#206634] hover:bg-[#164b25] rounded transition shadow-xs flex items-center gap-1"
                    >
                      <Check className="h-3 w-3" />
                      <span>Aplicar Sugestão</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#ded5bf]">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 rounded bg-[#fffdfa] hover:bg-[#ede5d2] border border-[#cfc3a9] text-[#5e5142] text-xs font-medium transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-[#206634] hover:bg-[#164b25] text-[#f7f3e8] text-xs font-semibold transition shadow-xs"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Fusão de Conquistas */}
      {fusionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-[#fcfaf7] border border-[#c4a478] rounded-lg shadow-xl max-w-xl w-full p-5 space-y-4 my-8 animate-scaleIn">
            <div className="flex items-center justify-between border-b border-[#ded5bf] pb-3">
              <div className="flex items-center gap-2">
                <GitMerge className="h-5 w-5 text-[#8b5a2b]" />
                <div>
                  <h3 className="font-bold text-sm text-[#2c2620] font-sans">
                    Fundir Conquistas & Apresentações Relacionadas
                  </h3>
                  <p className="text-[11px] text-[#756758] font-serif">
                    Sintetiza 2 ou mais itens em uma única entrada prestigiada para poupar espaço no currículo de 1 página.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setFusionModalOpen(false);
                  setFusedResult(null);
                }}
                className="p-1 rounded text-[#756758] hover:text-[#2c2620] hover:bg-[#ede5d2] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-[#5e5142] uppercase tracking-wider">
                Selecione as Conquistas para Fundir (mínimo 2):
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {(profile?.awards_and_leadership || []).map((aw, idx) => {
                  const isSelected = fusionSelectedAwardIndices.includes(idx);
                  return (
                    <div
                      key={idx}
                      onClick={() => handleToggleFusionAward(idx)}
                      className={`p-2.5 rounded border cursor-pointer transition flex items-start gap-2.5 text-xs ${
                        isSelected
                          ? 'bg-[#f6efe2] border-[#8b5a2b]'
                          : 'bg-[#fffdfa] border-[#dfd5be] hover:bg-[#fcf8f0]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-[#8b5a2b] focus:ring-[#8b5a2b]"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#221c16] truncate">{aw.title}</span>
                          <span className="text-[10px] text-[#756758] ml-2 shrink-0">{aw.period_or_date}</span>
                        </div>
                        {aw.description && (
                          <p className="text-[11px] text-[#635749] mt-0.5 line-clamp-1">{aw.description}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-[#756758]">
                {fusionSelectedAwardIndices.length} item(ns) selecionado(s)
              </span>
              <button
                type="button"
                disabled={fusionSelectedAwardIndices.length < 2 || isFusing}
                onClick={handleRunFusion}
                className="px-3.5 py-1.5 rounded bg-[#8b5a2b] hover:bg-[#6e441e] text-white text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-50 shadow-xs"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>{isFusing ? 'Sintetizando Fusão...' : 'Sintetizar com IA'}</span>
              </button>
            </div>

            {fusedResult && (
              <div className="p-3.5 bg-[#fffdfa] border border-[#a2d8b0] rounded-md space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#206634] uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" />
                    Resultado da Fusão Sintética
                  </span>
                  {fusedResult.tokens_saved > 0 ? (
                    <span className="text-[10px] font-mono bg-[#eef8f0] text-[#1c6434] border border-[#a2d8b0] px-2 py-0.5 rounded font-bold">
                      ⚡ {fusedResult.tokens_saved} tokens poupados
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono bg-[#fdf5eb] text-[#8b5a2b] border border-[#f0d4b8] px-2 py-0.5 rounded font-bold">
                      ✨ {fusedResult.tokens_used} tokens consumidos
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="block text-[10px] font-bold text-[#5e5142] uppercase mb-0.5">Título Unificado</label>
                    <input
                      type="text"
                      value={fusedResult.fused_item?.title || ''}
                      onChange={(e) =>
                        setFusedResult({
                          ...fusedResult,
                          fused_item: { ...fusedResult.fused_item, title: e.target.value },
                        })
                      }
                      className="w-full bg-white border border-[#d8ccb4] rounded px-2.5 py-1 text-xs text-[#2c2620]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#5e5142] uppercase mb-0.5">Período / Ano</label>
                    <input
                      type="text"
                      value={fusedResult.fused_item?.period_or_date || ''}
                      onChange={(e) =>
                        setFusedResult({
                          ...fusedResult,
                          fused_item: { ...fusedResult.fused_item, period_or_date: e.target.value },
                        })
                      }
                      className="w-full bg-white border border-[#d8ccb4] rounded px-2.5 py-1 text-xs text-[#2c2620]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#5e5142] uppercase mb-0.5">Descrição Coesa de Alto Impacto</label>
                    <textarea
                      rows={3}
                      value={fusedResult.fused_item?.description || ''}
                      onChange={(e) =>
                        setFusedResult({
                          ...fusedResult,
                          fused_item: { ...fusedResult.fused_item, description: e.target.value },
                        })
                      }
                      className="w-full bg-white border border-[#d8ccb4] rounded p-2 text-xs text-[#2c2620] resize-y leading-relaxed"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#dfd5be]">
                  <button
                    type="button"
                    onClick={() => setFusedResult(null)}
                    className="px-3 py-1.5 text-xs text-[#756758] hover:text-[#2c2620] hover:bg-[#ede5d2] rounded transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyFusion}
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-[#206634] hover:bg-[#164b25] rounded transition shadow-xs flex items-center gap-1.5"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Aplicar Fusão no Perfil</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
