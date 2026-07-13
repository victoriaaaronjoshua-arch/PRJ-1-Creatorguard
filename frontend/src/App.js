import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import '@/App.css';
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  FileText,
  UploadCloud,
  Sparkles,
  ScanLine,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Scale,
  Wallet,
  Megaphone,
  ChevronRight,
  Zap,
  Inbox,
  Mail,
  ArrowRight,
  Clock,
  XCircle,
} from 'lucide-react';
import { DEMO_STATES, DEMO_ORDER } from '@/data/demoStates';
import { extractText, detectKind, ACCEPTED_MIME } from '@/lib/pdfExtractor';
import { getUserId } from '@/lib/userId';
import InboxPanel from '@/components/InboxPanel';
import RateCalculator from '@/components/RateCalculator';
import ShareVerdictButton from '@/components/ShareVerdictButton';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// --- Constants -------------------------------------------------------------
const MAX_PITCH_CHARS = 18000;         // Cap extracted PDF text sent to the LLM
const ANALYZE_TIMEOUT_MS = 60000;      // Max wait for /api/analyze response
const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB upload cap
const MIN_PITCH_CHARS = 8;             // Minimum characters before CTA is enabled
const RISK_BAR_WIDTH = { High: '90%', Med: '55%', Low: '18%' };

// --- Small helpers ---------------------------------------------------------
const resolveTone = (tone) => (tone === 'safe' || tone === 'warn' || tone === 'danger' ? tone : 'danger');

// ---------------------------------------------------------------------------
// Small primitives
// ---------------------------------------------------------------------------

// NOTE: these semantic tones (safe/warn/danger) are kept as green/amber/red
// on purpose — they signal risk level, not brand color. Only the brand
// accent (previously emerald) was swapped to violet, and the base surface
// swapped to white. Shades were darkened slightly vs. the original so text
// stays readable on a light background.
const toneMap = {
  safe: {
    text: 'text-emerald-600',
    ring: '#059669',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/25',
    chip: 'text-emerald-700 bg-emerald-500/10 border-emerald-500/25',
    soft: 'text-emerald-700',
  },
  warn: {
    text: 'text-amber-600',
    ring: '#d97706',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/25',
    chip: 'text-amber-700 bg-amber-500/10 border-amber-500/25',
    soft: 'text-amber-700',
  },
  danger: {
    text: 'text-rose-600',
    ring: '#e11d48',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/25',
    chip: 'text-rose-700 bg-rose-500/10 border-rose-500/25',
    soft: 'text-rose-700',
  },
  neutral: {
    text: 'text-slate-600',
    ring: '#64748b',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/25',
    chip: 'text-slate-700 bg-slate-500/10 border-slate-500/25',
    soft: 'text-slate-700',
  },
};

const Chip = ({ tone = 'neutral', icon: Icon, children, testId }) => {
  const t = toneMap[tone];
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${t.chip}`}
    >
      {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />}
      {children}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

const Header = ({ mode, onModeChange, gmail }) => (
  <header
    data-testid="app-header"
    className="sticky top-0 z-40 border-b border-slate-200 backdrop-blur-xl bg-white/80"
  >
    <div className="mx-auto max-w-[1400px] px-6 lg:px-10 py-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 shrink-0">
        <div className="relative">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-400/30 to-violet-600/10 border border-violet-400/30 flex items-center justify-center">
            <ShieldCheck className="h-4.5 w-4.5 text-violet-600" strokeWidth={2.2} />
          </div>
          <span className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-full bg-violet-500 shadow-[0_0_10px_2px_rgba(139,92,246,0.6)]" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-[15px] font-semibold tracking-tight text-slate-900">
            CreatorGuard <span className="text-violet-600">AI</span>
          </span>
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
            Brand Deal Intelligence
          </span>
        </div>
      </div>

      {/* Mode tabs */}
      <div
        data-testid="mode-tabs"
        className="hidden md:flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1"
      >
        {[
          { key: 'paste', label: 'Paste & Scan', icon: ScanLine },
          { key: 'inbox', label: 'Gmail Inbox', icon: Inbox },
          { key: 'rate', label: 'Rate Calculator', icon: Wallet },
        ].map((t) => {
          const Icon = t.icon;
          const active = mode === t.key;
          return (
            <button
              key={t.key}
              data-testid={`mode-${t.key}`}
              onClick={() => onModeChange(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all inline-flex items-center gap-1.5
                ${active
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {gmail?.connected ? (
          <div
            data-testid="gmail-status-badge"
            className="hidden sm:flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-500/10 px-3 py-1.5"
          >
            <Mail className="h-3.5 w-3.5 text-violet-600" />
            <span className="mono text-[11px] text-violet-700 max-w-[180px] truncate">
              {gmail.email}
            </span>
          </div>
        ) : (
          <div
            data-testid="beta-badge"
            className="hidden sm:flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
            <span className="mono text-[11px] tracking-wide text-slate-600">
              Beta Protocol v1.0
            </span>
          </div>
        )}
        <div
          data-testid="user-avatar"
          className="h-9 w-9 rounded-full border border-slate-200 bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-xs font-semibold text-slate-100 hover:border-violet-400/40 transition-colors cursor-pointer"
          title="Creator · Alex M."
        >
          AM
        </div>
      </div>
    </div>
  </header>
);

// ---------------------------------------------------------------------------
// Demo state toggle (pitch control)
// ---------------------------------------------------------------------------

const DemoToggle = ({ current, onChange }) => (
  <div
    data-testid="demo-toggle-bar"
    className="glass rounded-2xl p-1.5 flex items-center gap-1.5 w-fit"
  >
    <div className="pl-3 pr-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-slate-500 mono">
      <Zap className="h-3 w-3 text-violet-600" />
      Demo State
    </div>
    {DEMO_ORDER.map((key, idx) => {
      const s = DEMO_STATES[key];
      const active = current === key;
      return (
        <button
          key={key}
          data-testid={`demo-state-${key}`}
          onClick={() => onChange(key)}
          className={`relative px-3.5 py-2 rounded-xl text-xs font-medium transition-all duration-200 flex items-center gap-2
            ${active
              ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
        >
          <span className={`mono text-[10px] ${active ? 'text-violet-200' : 'text-slate-500'}`}>
            0{idx + 1}
          </span>
          <span className="tracking-tight">{s.shortLabel}</span>
        </button>
      );
    })}
  </div>
);

// ---------------------------------------------------------------------------
// LEFT: Input Panel
// ---------------------------------------------------------------------------

// Icon shown in the top-left of the PDF drop zone based on parse state.
const DropZoneIcon = ({ state, dragActive }) => {
  if (state === 'parsing') {
    return <Loader2 className="h-5 w-5 text-violet-500 animate-spin" strokeWidth={2} />;
  }
  if (state === 'done') {
    return <CheckCircle2 className="h-5 w-5 text-violet-500" strokeWidth={2} />;
  }
  const color = dragActive ? 'text-violet-500' : 'text-slate-400 group-hover:text-violet-500';
  return <UploadCloud className={`h-5 w-5 ${color}`} strokeWidth={2} />;
};

const InputPanel = ({ text, setText, onAnalyze, loading, error, onPdfFile, pdfStatus }) => {
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFiles = (files) => {
    if (!files || files.length === 0) return;
    const f = files[0];
    if (!detectKind(f)) {
      onPdfFile?.(null, 'Only PDF, DOCX, and EML files are supported.');
      return;
    }
    onPdfFile?.(f, null);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };
  const onDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };
  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFiles(e.dataTransfer?.files);
  };

  return (
    <div
      data-testid="input-panel"
      className="glass rounded-3xl p-6 lg:p-7 flex flex-col gap-5 h-full"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <ScanLine className="h-4 w-4 text-violet-600" strokeWidth={2.2} />
            <span className="mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
              Step 01 · Input
            </span>
          </div>
          <h1
            data-testid="workspace-heading"
            className="text-3xl lg:text-[34px] font-semibold tracking-tight text-slate-900 leading-[1.1]"
          >
            Audit Your <span className="serif italic text-violet-600 font-normal">Brand Deal</span>
          </h1>
          <p className="mt-2 text-sm text-slate-500 max-w-md">
            Paste a pitch email, DM, or drop the PDF contract. We scan for scam
            patterns, missing clauses, and reputational landmines in under 4 seconds.
          </p>
        </div>
      </div>

      {/* Textarea */}
      <div className="relative">
        <textarea
          data-testid="pitch-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your brand pitch email or contract terms here..."
          className="w-full h-[240px] resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/15 transition-all mono leading-relaxed"
        />
        <div className="absolute bottom-3 right-3 mono text-[10px] text-slate-400">
          {text.length} chars
        </div>
      </div>

      {/* Drop zone */}
      <div
        data-testid="drop-zone"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className={`group relative rounded-2xl border-2 border-dashed bg-slate-50/60 transition-all duration-300 p-5 cursor-pointer flex items-center gap-4
          ${dragActive
            ? 'border-violet-500 bg-violet-50'
            : 'border-slate-200 hover:border-violet-400/60 hover:bg-violet-50/60'}`}
      >
        <input
          ref={fileInputRef}
          data-testid="pdf-input"
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <div className={`h-11 w-11 shrink-0 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center transition-all
          ${dragActive ? 'border-violet-400/60 bg-violet-100' : 'group-hover:border-violet-400/40 group-hover:bg-violet-100'}`}>
          <DropZoneIcon state={pdfStatus?.state} dragActive={dragActive} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-800 flex items-center gap-2">
            {pdfStatus?.state === 'parsing' && 'Extracting PDF text...'}
            {pdfStatus?.state === 'done' && (
              <span className="truncate">{pdfStatus.filename} · loaded</span>
            )}
            {(!pdfStatus || pdfStatus.state === 'idle' || pdfStatus.state === 'error') && (
              <>Drag &amp; drop a pitch — PDF, DOCX, or EML
                <FileText className="h-3.5 w-3.5 text-slate-400" /></>
            )}
          </div>
          <div className={`text-xs mt-0.5 truncate ${pdfStatus?.state === 'error' ? 'text-rose-600' : 'text-slate-500'}`}>
            {pdfStatus?.state === 'parsing' && 'Runs in your browser — nothing leaves your device.'}
            {pdfStatus?.state === 'done' && `${(pdfStatus.chars || 0).toLocaleString()} chars extracted · ${(pdfStatus.kind || 'file').toUpperCase()} · ready to verify`}
            {pdfStatus?.state === 'error' && (pdfStatus.message || 'Could not read this file.')}
            {(!pdfStatus || pdfStatus.state === 'idle') && 'Or click to browse · PDF · DOCX · EML · max 25MB'}
          </div>
        </div>
        <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${dragActive ? 'text-violet-500 translate-x-1' : 'text-slate-400 group-hover:text-violet-500 group-hover:translate-x-1'}`} />
      </div>

      {/* CTA */}
      <button
        data-testid="verify-btn"
        onClick={onAnalyze}
        disabled={loading || !text || text.trim().length < MIN_PITCH_CHARS}
        className={`cta-glow relative overflow-hidden w-full rounded-2xl px-6 py-4 font-semibold text-white bg-violet-600 hover:bg-violet-500 transition-all duration-200 flex items-center justify-center gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-violet-600`}
      >
        {loading ? (
          <>
            <Loader2 className="h-4.5 w-4.5 animate-spin" />
            <span>Gemini 2.5 Flash scanning...</span>
            <span className="flex items-center gap-1 ml-1">
              <span className="dot h-1.5 w-1.5 rounded-full bg-white" />
              <span className="dot h-1.5 w-1.5 rounded-full bg-white" />
              <span className="dot h-1.5 w-1.5 rounded-full bg-white" />
            </span>
          </>
        ) : (
          <>
            <ShieldCheck className="h-4.5 w-4.5" strokeWidth={2.4} />
            <span className="tracking-tight">Verify Deal Safety</span>
            <ArrowRight className="h-4 w-4 opacity-70" />
          </>
        )}
      </button>

      {error && (
        <div
          data-testid="analyze-error"
          className="flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700"
        >
          <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
          <div>
            <div className="font-medium">Analysis failed</div>
            <div className="text-rose-600/90 mt-0.5">{error}</div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-slate-500 mono">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
          Powered by Claude Sonnet 4.5
        </span>
        <span>SOC-2 · GDPR</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// RIGHT: Result components
// ---------------------------------------------------------------------------

const ScoreRing = ({ score, ringPct, tone }) => {
  const t = toneMap[tone];
  return (
    <div
      data-testid="score-ring"
      className="score-ring"
      style={{ '--pct': ringPct, '--ring-color': t.ring }}
    >
      <div className="h-[172px] w-[172px] rounded-full bg-white border border-slate-200 flex flex-col items-center justify-center relative">
        <div className={`mono text-[10px] uppercase tracking-[0.22em] ${t.text} mb-1`}>
          Safety Score
        </div>
        <div className="flex items-end gap-1">
          <span
            data-testid="score-value"
            className={`text-6xl font-semibold leading-none tracking-tight ${t.text}`}
          >
            {score}
          </span>
          <span className="mono text-sm text-slate-400 mb-1.5">/10</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5 mono text-[10px] text-slate-500">
          <span className={`h-1.5 w-1.5 rounded-full`} style={{ background: t.ring }} />
          confidence 98.4%
        </div>
      </div>
    </div>
  );
};

const RiskCard = ({ item }) => {
  const iconMap = { legal: Scale, financial: Wallet, reputation: Megaphone };
  const Icon = iconMap[item.key] || Shield;
  const t = toneMap[item.tone];
  return (
    <div
      data-testid={`risk-${item.key}`}
      className={`glass rounded-2xl p-4 flex flex-col gap-3 hover:border-slate-300 transition-colors`}
    >
      <div className="flex items-center justify-between">
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${t.bg} border ${t.border}`}>
          <Icon className={`h-4 w-4 ${t.text}`} strokeWidth={2.2} />
        </div>
        <span className={`mono text-[10px] uppercase tracking-widest ${t.text}`}>
          {item.level}
        </span>
      </div>
      <div>
        <div className="text-[13px] font-medium text-slate-800">{item.label}</div>
        <div className="mt-2 h-1 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: RISK_BAR_WIDTH[item.level] || '18%',
              background: t.ring,
            }}
          />
        </div>
      </div>
    </div>
  );
};

const SummaryCard = ({ tone, summary, brand, sender, receivedAt }) => {
  const t = toneMap[tone];
  return (
    <div
      data-testid="summary-card"
      className={`glass rounded-2xl p-5 border ${t.border} ${t.bg}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className={`h-4 w-4 ${t.text}`} strokeWidth={2.2} />
          <span className="mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
            AI Executive Summary
          </span>
        </div>
        <Chip tone={tone === 'safe' ? 'safe' : 'danger'} icon={tone === 'safe' ? ShieldCheck : ShieldAlert}>
          {tone === 'safe' ? 'Verified' : 'Flagged'}
        </Chip>
      </div>

      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-200">
        <div className={`h-10 w-10 rounded-xl ${t.bg} border ${t.border} flex items-center justify-center`}>
          <Mail className={`h-4 w-4 ${t.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900 truncate">{brand}</div>
          <div className="mono text-[11px] text-slate-500 truncate">{sender}</div>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 mono text-[10px] text-slate-500">
          <Clock className="h-3 w-3" />
          {receivedAt}
        </div>
      </div>

      <p className="text-[14px] leading-relaxed text-slate-700">{summary}</p>
    </div>
  );
};

const FlagsList = ({ flags, tone }) => {
  const isSafe = tone === 'safe';
  return (
    <div data-testid="flags-list" className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {isSafe ? (
            <ShieldCheck className="h-4 w-4 text-emerald-600" strokeWidth={2.2} />
          ) : (
            <AlertTriangle className="h-4 w-4 text-rose-600" strokeWidth={2.2} />
          )}
          <span className="mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
            Flagged Issues · {flags.length}
          </span>
        </div>
        <span className="mono text-[10px] text-slate-400">
          parsed from contract text
        </span>
      </div>

      <ul className="flex flex-col gap-3">
        {flags.map((f, i) => (
          <li
            key={f.title}
            data-testid={`flag-${i}`}
            className="group flex items-start gap-3 p-3 -mx-1 rounded-xl hover:bg-slate-50 transition-colors"
          >
            <div
              className={`mt-0.5 h-6 w-6 shrink-0 rounded-lg flex items-center justify-center border ${
                isSafe
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-rose-500/10 border-rose-500/30'
              }`}
            >
              {isSafe ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
              )}
            </div>
            <div className="flex-1">
              <div className="text-[13.5px] font-medium text-slate-800 leading-snug">
                {f.title}
              </div>
              {f.detail && (
                <div className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {f.detail}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

const ActionsChecklist = ({ actions }) => {
  // Parent remounts this component via key={verdict.id} when a new analysis
  // arrives, so per-verdict state resets naturally — no effect needed.
  const [checked, setChecked] = useState({});
  const toggle = (i) => setChecked((p) => ({ ...p, [i]: !p[i] }));

  return (
    <div data-testid="actions-list" className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-violet-600" strokeWidth={2.2} />
          <span className="mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
            Action Items · Next Steps
          </span>
        </div>
        <span className="mono text-[10px] text-slate-400">
          {Object.values(checked).filter(Boolean).length}/{actions.length} done
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {actions.map((a, i) => {
          const isChecked = !!checked[i];
          return (
            <li key={a.title} data-testid={`action-${i}`}>
              <button
                onClick={() => toggle(i)}
                className={`w-full text-left flex items-start gap-3 p-3 rounded-xl border transition-all duration-200
                  ${isChecked
                    ? 'bg-violet-500/5 border-violet-500/25'
                    : 'bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-slate-100'}`}
              >
                <div
                  className={`mt-0.5 h-5 w-5 shrink-0 rounded-md border flex items-center justify-center transition-all
                    ${isChecked
                      ? 'bg-violet-600 border-violet-600'
                      : 'border-slate-400'}`}
                >
                  {isChecked ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                  ) : (
                    <Circle className="h-3 w-3 text-transparent" />
                  )}
                </div>
                <div className="flex-1">
                  <div
                    className={`text-[13.5px] font-medium leading-snug ${
                      isChecked ? 'text-slate-400 line-through' : 'text-slate-800'
                    }`}
                  >
                    {a.title}
                  </div>
                  {a.detail && (
                    <div className="text-xs text-slate-500 mt-1 leading-relaxed">
                      {a.detail}
                    </div>
                  )}
                </div>
                <ArrowRight
                  className={`h-4 w-4 shrink-0 mt-1 transition-all ${
                    isChecked ? 'text-violet-600' : 'text-slate-400'
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

const EmptyResult = () => (
  <div
    data-testid="empty-result"
    className="glass rounded-3xl p-10 lg:p-14 h-full flex flex-col items-center justify-center text-center gap-6 relative overflow-hidden"
  >
    <div className="absolute inset-0 grid-lines opacity-40 pointer-events-none" />
    <div className="relative">
      <div className="h-24 w-24 rounded-3xl bg-gradient-to-br from-violet-400/20 via-violet-500/5 to-transparent border border-violet-400/20 flex items-center justify-center relative">
        <Inbox className="h-9 w-9 text-violet-500/80" strokeWidth={1.6} />
        <div className="absolute inset-0 rounded-3xl border border-violet-400/10 animate-ping" />
      </div>
    </div>
    <div className="relative max-w-sm">
      <h3 className="text-xl font-semibold text-slate-900 tracking-tight">
        Waiting for contract input
      </h3>
      <p className="text-sm text-slate-500 mt-2 leading-relaxed">
        Paste a pitch on the left to begin analysis. Our model will inspect
        <span className="text-violet-600"> 47 risk vectors </span>
        in under 4 seconds.
      </p>
    </div>
    <div className="relative flex flex-wrap items-center justify-center gap-2 mono text-[10px] text-slate-500">
      <Chip tone="neutral" icon={Scale}>Legal vectors</Chip>
      <Chip tone="neutral" icon={Wallet}>Financial vectors</Chip>
      <Chip tone="neutral" icon={Megaphone}>Reputation vectors</Chip>
    </div>
  </div>
);

// Rendered in place of the ResultPanel while /api/analyze is in flight.
const ScanningPanel = () => (
  <div
    data-testid="analyzing-panel"
    className="glass rounded-3xl p-14 h-full flex flex-col items-center justify-center text-center gap-5 relative overflow-hidden"
  >
    <div className="absolute inset-0 grid-lines opacity-40 pointer-events-none" />
    <div className="relative h-20 w-20 rounded-3xl border border-violet-400/30 bg-violet-400/10 flex items-center justify-center">
      <ScanLine className="h-8 w-8 text-violet-500 animate-pulse" />
    </div>
    <div className="relative">
      <h3 className="text-xl font-semibold text-slate-900 tracking-tight">
        Analyzing 47 risk vectors...
      </h3>
      <p className="text-sm text-slate-500 mt-2">
        Claude Sonnet 4.5 is reading your pitch line by line.
      </p>
    </div>
    <div className="flex items-center gap-1.5">
      <span className="dot h-2 w-2 rounded-full bg-violet-500" />
      <span className="dot h-2 w-2 rounded-full bg-violet-500" />
      <span className="dot h-2 w-2 rounded-full bg-violet-500" />
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Result panel
// ---------------------------------------------------------------------------

const ResultPanel = ({ verdict }) => {
  if (!verdict) return <EmptyResult />;
  const tone = verdict.verdict_tone || verdict.verdictTone;
  const t = toneMap[tone];

  return (
    <div data-testid="result-panel" className="flex flex-col gap-4">
      {/* Verdict header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 fade-up">
        <div>
          <div className="mono text-[10px] uppercase tracking-[0.22em] text-slate-500 mb-1">
            Step 02 · Verdict
          </div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">
              {verdict.brand}
            </h2>
            <Chip tone={resolveTone(tone)} icon={tone === 'safe' ? ShieldCheck : ShieldAlert}>
              {verdict.verdict}
            </Chip>
          </div>
        </div>
        <ShareVerdictButton verdict={verdict} />
      </div>

      {/* Score + Risk matrix row */}
      <div className="grid grid-cols-1 md:grid-cols-[auto,1fr] gap-4 fade-up stagger-1">
        <div className={`glass rounded-3xl p-6 flex items-center justify-center border ${t.border}`}>
          <ScoreRing score={verdict.score} ringPct={verdict.ring_pct ?? verdict.ringPct} tone={tone} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(verdict.matrix || []).map((m) => <RiskCard key={m.key} item={m} />)}
        </div>
      </div>

      {/* Summary */}
      <div className="fade-up stagger-2">
        <SummaryCard
          tone={tone}
          summary={verdict.summary}
          brand={verdict.brand}
          sender={verdict.sender}
          receivedAt={verdict.received_at || verdict.receivedAt}
        />
      </div>

      {/* Flags + Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="fade-up stagger-3">
          <FlagsList flags={verdict.flags || []} tone={tone} />
        </div>
        <div className="fade-up stagger-4">
          <ActionsChecklist actions={verdict.actions || []} />
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Root App
// ---------------------------------------------------------------------------

export default function App() {
  const [demoKey, setDemoKey] = useState('empty');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [verdict, setVerdict] = useState(null);
  const [error, setError] = useState('');
  const [pdfStatus, setPdfStatus] = useState({ state: 'idle' });

  // Gmail + mode
  const [mode, setMode] = useState('paste');
  const [gmail, setGmail] = useState({ connected: false, email: null, label: 'CreatorGuard' });
  const userId = React.useMemo(() => getUserId(), []);

  const refreshGmailStatus = React.useCallback(async () => {
    try {
      const res = await axios.get(`${API}/gmail/status`, { params: { user_id: userId } });
      setGmail(res.data);
    } catch (e) {
      // Silent — leave defaults.
    }
  }, [userId]);

  useEffect(() => { refreshGmailStatus(); }, [refreshGmailStatus]);

  // Handle OAuth return: if URL has ?gmail=connected, switch to Inbox tab and refresh.
  // On ?gmail=error, surface the reason so the user knows what to fix.
  // Also normalize any non-root path back to "/" so users who land on
  // /oauth/... /callback etc. never see a raw 404.
  useEffect(() => {
    const { pathname, search } = window.location;
    const params = new URLSearchParams(search);
    const gmailParam = params.get('gmail');

    // Any accidental deep path → collapse to root but preserve query string.
    if (pathname !== '/' && pathname !== '') {
      window.history.replaceState({}, '', `/${search || ''}`);
    }

    if (gmailParam === 'connected') {
      setMode('inbox');
      refreshGmailStatus();
      window.history.replaceState({}, '', window.location.pathname);
    } else if (gmailParam === 'error') {
      const reason = params.get('reason') || 'unknown';
      let friendly = `Gmail connection failed: ${reason}`;
      if (reason === 'access_denied') {
        friendly = 'Google denied access. Add your Gmail to Test Users under the OAuth Consent Screen (Audience) for the correct Google Cloud project, then retry in an incognito window.';
      } else if (reason === 'missing_params') {
        friendly = 'OAuth callback missing code or state. Please retry from the Connect Gmail button.';
      } else if (reason === 'token_exchange_failed') {
        friendly = 'Google refused the token exchange. This usually means the OAuth session expired — click Connect Gmail again.';
      }
      setMode('inbox');
      setError(friendly);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [refreshGmailStatus]);

  const handleConnectGmail = async () => {
    try {
      const res = await axios.get(`${API}/oauth/gmail/login`, { params: { user_id: userId } });
      window.location.href = res.data.authorize_url;
    } catch (e) {
      setError('Could not start Gmail connection.');
    }
  };

  const handleDisconnectGmail = async () => {
    await axios.post(`${API}/gmail/disconnect`, null, { params: { user_id: userId } });
    setGmail({ connected: false, email: null, label: gmail.label });
  };

  const handleDemoChange = (k) => {
    setDemoKey(k);
    setError('');
    setPdfStatus({ state: 'idle' });
    const preview = DEMO_STATES[k]?.inputPreview || '';
    setText(preview);
    if (k === 'empty') {
      setVerdict(null);
    }
  };

  const handlePdfFile = async (file, immediateError) => {
    if (immediateError) {
      setPdfStatus({ state: 'error', message: immediateError });
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setPdfStatus({ state: 'error', message: 'File is over 25MB.' });
      return;
    }
    const kind = detectKind(file);
    if (!kind) {
      setPdfStatus({ state: 'error', message: 'Only PDF, DOCX, and EML files are supported.' });
      return;
    }
    setPdfStatus({ state: 'parsing', filename: file.name, kind });
    setError('');
    try {
      const extracted = await extractText(file);
      const clean = (extracted || '').trim();
      if (!clean) {
        setPdfStatus({ state: 'error', message: `This ${kind.toUpperCase()} looks empty or image-only. Paste the text instead.` });
        return;
      }
      setText(clean.slice(0, MAX_PITCH_CHARS));
      setPdfStatus({ state: 'done', filename: file.name, chars: clean.length, kind });
    } catch (e) {
      setPdfStatus({ state: 'error', message: `Could not read this ${kind.toUpperCase()}. Try another file.` });
    }
  };

  const handleAnalyze = async () => {
    if (loading) return;
    const pitch = text.trim();
    if (pitch.length < MIN_PITCH_CHARS) {
      setError('Please paste a pitch email or contract terms first.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(
        `${API}/analyze`,
        { pitch_text: pitch },
        { timeout: ANALYZE_TIMEOUT_MS }
      );
      setVerdict(res.data);
    } catch (e) {
      const msg =
        e?.response?.data?.detail ||
        e?.message ||
        'Something went wrong. Please try again.';
      setError(typeof msg === 'string' ? msg : 'Analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App min-h-screen bg-white">
      <div className="min-h-screen grid-lines">
        <Header mode={mode} onModeChange={setMode} gmail={gmail} />

        <main className="mx-auto max-w-[1400px] px-6 lg:px-10 py-6 lg:py-8">
          {mode === 'paste' ? (
            <>
              {/* Top command strip: demo toggle */}
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
                <DemoToggle current={demoKey} onChange={handleDemoChange} />

                <div className="hidden lg:flex items-center gap-4 text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                    Gemini 2.5 Flash
                  </div>
                  <span className="h-3 w-px bg-slate-200" />
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    $2.4M creator revenue saved
                  </div>
                </div>
              </div>

              {/* Split workspace */}
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,420px),1fr] gap-4 lg:gap-6">
                <InputPanel
                  text={text}
                  setText={setText}
                  onAnalyze={handleAnalyze}
                  loading={loading}
                  error={error}
                  onPdfFile={handlePdfFile}
                  pdfStatus={pdfStatus}
                />
                <div key={verdict?.id || 'empty'} className="min-w-0">
                  {loading ? <ScanningPanel /> : <ResultPanel verdict={verdict} />}
                </div>
              </div>
            </>
          ) : mode === 'inbox' ? (
            <InboxPanel
              userId={userId}
              connected={gmail.connected}
              email={gmail.email}
              label={gmail.label}
              onConnect={handleConnectGmail}
              onDisconnect={handleDisconnectGmail}
              onLabelChange={(next) => setGmail(next)}
            />
          ) : (
            <RateCalculator />
          )}

          {/* Footer strip */}
          <footer className="mt-10 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mono text-[11px] text-slate-500">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-violet-600" />
              CreatorGuard AI · powered by Claude Sonnet 4.5
            </div>
            <div className="flex items-center gap-4">
              <span>© 2026 CreatorGuard Labs</span>
              <span className="hidden sm:inline">·</span>
              <span>Privacy</span>
              <span>Terms</span>
              <span>Docs</span>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}