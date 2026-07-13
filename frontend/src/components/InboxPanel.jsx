import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Inbox,
  RefreshCw,
  Mail,
  ShieldCheck,
  ShieldAlert,
  ChevronRight,
  MessageSquareReply,
  CheckCircle2,
  Loader2,
  ExternalLink,
  Info,
  Pencil,
  X as XIcon,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const toneClass = {
  safe: 'text-emerald-400 border-emerald-500/25 bg-emerald-500/10',
  warn: 'text-amber-400 border-amber-500/25 bg-amber-500/10',
  danger: 'text-rose-400 border-rose-500/25 bg-rose-500/10',
};

function ScoreBadge({ score, tone }) {
  return (
    <div
      data-testid="scan-score-badge"
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 mono text-[11px] font-semibold ${toneClass[tone] || toneClass.danger}`}
    >
      {score}/10
    </div>
  );
}

function FilterRecipe({ label }) {
  return (
    <div className="glass rounded-2xl p-5 flex items-start gap-3 border border-emerald-500/15 bg-emerald-500/[0.04]">
      <div className="h-8 w-8 shrink-0 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center">
        <Info className="h-4 w-4 text-emerald-300" />
      </div>
      <div className="text-sm text-slate-300 leading-relaxed">
        <div className="font-medium text-white mb-1">
          Set up your Gmail filter (one-time, 30 seconds)
        </div>
        <ol className="list-decimal ml-4 space-y-0.5 text-slate-400 text-[13px]">
          <li>In Gmail, open any brand-pitch email → click the ⋮ menu → <span className="text-slate-200">Filter messages like these</span>.</li>
          <li>Under <span className="text-slate-200">Apply the label</span> pick or create <span className="mono text-emerald-300">{label}</span>.</li>
          <li>Or forward any suspicious pitch to yourself with the label pre-applied.</li>
        </ol>
        <div className="text-[11px] text-slate-500 mt-2 mono">
          CreatorGuard only reads messages carrying this label — nothing else.
        </div>
      </div>
    </div>
  );
}

function EmptyInbox({ onSync, syncing, label }) {
  return (
    <div
      data-testid="inbox-empty"
      className="glass rounded-3xl p-12 flex flex-col items-center justify-center text-center gap-4"
    >
      <div className="h-20 w-20 rounded-3xl border border-emerald-400/25 bg-emerald-500/10 flex items-center justify-center">
        <Inbox className="h-8 w-8 text-emerald-300" />
      </div>
      <div>
        <h3 className="text-xl font-semibold text-white tracking-tight">
          No scanned pitches yet
        </h3>
        <p className="text-sm text-slate-400 mt-2 max-w-md">
          Label a Gmail message with <span className="mono text-emerald-300">{label}</span>,
          then hit Sync to run Claude Sonnet 4.5 across every labeled email.
        </p>
      </div>
      <button
        data-testid="inbox-first-sync"
        onClick={onSync}
        disabled={syncing}
        className="mt-2 inline-flex items-center gap-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-semibold px-4 py-2.5 disabled:opacity-60"
      >
        {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {syncing ? 'Syncing...' : 'Sync now'}
      </button>
    </div>
  );
}

export default function InboxPanel({ userId, connected, email, label, onConnect, onDisconnect, onLabelChange }) {
  const [messages, setMessages] = useState([]);
  const [selected, setSelected] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(label);
  const [labelSaving, setLabelSaving] = useState(false);
  const [deliveryPref, setDeliveryPref] = useState(() => {
    return window.localStorage.getItem('cg_delivery_pref') || 'dashboard';
  });
  const [replyStatus, setReplyStatus] = useState({}); // {scan_id: 'sending' | 'sent' | 'error'}

  useEffect(() => {
    window.localStorage.setItem('cg_delivery_pref', deliveryPref);
  }, [deliveryPref]);

  useEffect(() => { setLabelDraft(label); }, [label]);

  const saveLabel = async () => {
    const clean = (labelDraft || '').trim();
    if (!clean || clean === label) {
      setEditingLabel(false);
      setLabelDraft(label);
      return;
    }
    setLabelSaving(true);
    try {
      const res = await axios.post(`${API}/gmail/settings`, { label: clean }, { params: { user_id: userId } });
      onLabelChange?.(res.data);
      setEditingLabel(false);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not update label.');
    } finally {
      setLabelSaving(false);
    }
  };

  const loadMessages = React.useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/gmail/messages`, { params: { user_id: userId } });
      setMessages(res.data || []);
    } catch (e) {
      setError('Could not load scanned messages.');
    } finally {
      setLoading(false);
    }
  }, [connected, userId]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setError('');
    try {
      const res = await axios.post(`${API}/gmail/sync`, null, { params: { user_id: userId } });
      await loadMessages();

      // Auto-reply if user picked "reply" delivery mode
      if (deliveryPref === 'reply' && res.data.new > 0) {
        // send replies for the newly scanned messages
        const fresh = await axios.get(`${API}/gmail/messages`, { params: { user_id: userId } });
        const toReply = (fresh.data || []).filter((m) => !m.replied).slice(0, res.data.new);
        await Promise.all(toReply.map((m) => handleReply(m.id, /*silent*/ true)));
        await loadMessages();
      }
    } catch (e) {
      setError(e?.response?.data?.detail || 'Sync failed. Please reconnect Gmail.');
    } finally {
      setSyncing(false);
    }
  };

  const handleReply = async (scanId, silent = false) => {
    setReplyStatus((p) => ({ ...p, [scanId]: 'sending' }));
    try {
      await axios.post(`${API}/gmail/reply/${scanId}`, null, { params: { user_id: userId } });
      setReplyStatus((p) => ({ ...p, [scanId]: 'sent' }));
      if (!silent) await loadMessages();
    } catch (e) {
      setReplyStatus((p) => ({ ...p, [scanId]: 'error' }));
    }
  };

  if (!connected) {
    return (
      <div
        data-testid="inbox-disconnected"
        className="glass rounded-3xl p-12 flex flex-col items-center justify-center text-center gap-5"
      >
        <div className="h-20 w-20 rounded-3xl border border-emerald-400/25 bg-emerald-500/10 flex items-center justify-center">
          <Mail className="h-8 w-8 text-emerald-300" />
        </div>
        <div>
          <h3 className="text-xl font-semibold text-white tracking-tight">Connect your Gmail</h3>
          <p className="text-sm text-slate-400 mt-2 max-w-md">
            CreatorGuard will only read messages labeled{' '}
            <span className="mono text-emerald-300">{label}</span>. Read + reply scopes only, nothing else.
          </p>
        </div>
        <button
          data-testid="connect-gmail-btn"
          onClick={onConnect}
          className="cta-glow inline-flex items-center gap-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-semibold px-5 py-3"
        >
          <ExternalLink className="h-4 w-4" />
          Connect Gmail
        </button>
        <div className="mt-3 max-w-md w-full">
          <FilterRecipe label={label} />
        </div>
      </div>
    );
  }

  return (
    <div data-testid="inbox-panel" className="flex flex-col gap-4">
      {/* Controls */}
      <div className="glass rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-4.5 w-4.5 text-emerald-300" />
          </div>
          <div className="min-w-0">
            <div className="text-sm text-white font-medium truncate">{email}</div>
            <div className="mono text-[10px] uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
              <span>Scanning label ·</span>
              {editingLabel ? (
                <span className="flex items-center gap-1">
                  <input
                    data-testid="label-input"
                    value={labelDraft}
                    onChange={(e) => setLabelDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveLabel();
                      if (e.key === 'Escape') { setEditingLabel(false); setLabelDraft(label); }
                    }}
                    autoFocus
                    className="mono uppercase text-[10px] tracking-widest bg-black/40 border border-emerald-400/40 rounded px-1.5 py-0.5 w-32 text-emerald-200 focus:outline-none"
                  />
                  <button data-testid="label-save" onClick={saveLabel} disabled={labelSaving} className="text-emerald-300 hover:text-emerald-200 disabled:opacity-50">
                    {labelSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                  </button>
                  <button data-testid="label-cancel" onClick={() => { setEditingLabel(false); setLabelDraft(label); }} className="text-slate-500 hover:text-slate-300">
                    <XIcon className="h-3 w-3" />
                  </button>
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span data-testid="current-label" className="text-emerald-300">{label}</span>
                  <button data-testid="label-edit" onClick={() => setEditingLabel(true)} className="text-slate-500 hover:text-emerald-300" title="Rename label">
                    <Pencil className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex items-center rounded-xl border border-white/10 bg-white/[0.02] p-1 mono text-[10px]"
            data-testid="delivery-toggle"
          >
            <button
              onClick={() => setDeliveryPref('dashboard')}
              className={`px-3 py-1.5 rounded-lg transition-all ${deliveryPref === 'dashboard'
                ? 'bg-white text-slate-900 font-semibold'
                : 'text-slate-400 hover:text-white'}`}
              data-testid="delivery-dashboard"
            >
              Dashboard only
            </button>
            <button
              onClick={() => setDeliveryPref('reply')}
              className={`px-3 py-1.5 rounded-lg transition-all ${deliveryPref === 'reply'
                ? 'bg-white text-slate-900 font-semibold'
                : 'text-slate-400 hover:text-white'}`}
              data-testid="delivery-reply"
            >
              Email verdict back
            </button>
          </div>
          <button
            data-testid="sync-btn"
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-semibold px-3.5 py-2 disabled:opacity-60"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {syncing ? 'Syncing' : 'Sync now'}
          </button>
          <button
            data-testid="disconnect-btn"
            onClick={onDisconnect}
            className="text-[11px] text-slate-400 hover:text-rose-300 mono uppercase tracking-widest px-2"
          >
            Disconnect
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">{error}</div>
      )}

      {messages.length === 0 && !loading ? (
        <>
          <EmptyInbox onSync={handleSync} syncing={syncing} label={label} />
          <FilterRecipe label={label} />
        </>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,380px),1fr] gap-4">
          {/* List */}
          <ul data-testid="inbox-list" className="glass rounded-2xl p-2 flex flex-col gap-1 max-h-[70vh] overflow-y-auto">
            {messages.map((m) => (
              <li key={m.id}>
                <button
                  data-testid={`inbox-item-${m.id}`}
                  onClick={() => setSelected(m)}
                  className={`w-full text-left rounded-xl p-3 hover:bg-white/5 transition-colors flex items-start gap-3 border ${selected?.id === m.id ? 'border-emerald-400/30 bg-emerald-400/[0.04]' : 'border-transparent'}`}
                >
                  <ScoreBadge score={m.score} tone={m.verdict_tone} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-medium text-white truncate">{m.subject}</div>
                    <div className="mono text-[11px] text-slate-500 truncate">{m.from_email}</div>
                    <div className="text-xs text-slate-400 mt-1 line-clamp-2">{m.snippet}</div>
                  </div>
                  {m.replied && (
                    <MessageSquareReply className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-1" title="Verdict emailed" />
                  )}
                </button>
              </li>
            ))}
          </ul>

          {/* Detail */}
          <div data-testid="inbox-detail" className="glass rounded-2xl p-5">
            {!selected ? (
              <div className="text-sm text-slate-400 h-full flex items-center justify-center text-center p-8">
                Select an email on the left to see the full CreatorGuard verdict.
              </div>
            ) : (
              <ScanDetail
                scan={selected}
                onReply={() => handleReply(selected.id)}
                replyState={replyStatus[selected.id]}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ScanDetail({ scan, onReply, replyState }) {
  const tone = scan.verdict_tone;
  const t = toneClass[tone] || toneClass.danger;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-lg font-semibold text-white tracking-tight truncate">{scan.subject}</div>
          <div className="mono text-[11px] text-slate-500 truncate">{scan.from_email}</div>
        </div>
        <div className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${t}`}>
          {tone === 'safe' ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
          {scan.verdict}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className={`col-span-1 rounded-2xl p-4 flex flex-col items-center justify-center border ${t}`}>
          <div className="mono text-[10px] uppercase tracking-widest opacity-80">Score</div>
          <div className="text-4xl font-semibold mt-1">{scan.score}<span className="mono text-sm text-slate-500">/10</span></div>
        </div>
        {(scan.matrix || []).map((m) => (
          <div key={m.key} className="glass rounded-2xl p-4">
            <div className="mono text-[10px] uppercase tracking-widest text-slate-500">{m.label}</div>
            <div className={`text-lg font-semibold mt-1 ${toneClass[m.tone]?.split(' ')[0] || ''}`}>{m.level}</div>
          </div>
        ))}
      </div>

      <div className="glass rounded-2xl p-4">
        <div className="mono text-[10px] uppercase tracking-widest text-slate-500 mb-1">AI Summary</div>
        <p className="text-sm text-slate-200 leading-relaxed">{scan.summary}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass rounded-2xl p-4">
          <div className="mono text-[10px] uppercase tracking-widest text-slate-500 mb-2">Flags</div>
          <ul className="space-y-2">
            {(scan.flags || []).map((f) => (
              <li key={f.title} className="text-sm text-slate-200">
                • {f.title}
                {f.detail && <div className="text-xs text-slate-400 ml-3 mt-0.5">{f.detail}</div>}
              </li>
            ))}
          </ul>
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="mono text-[10px] uppercase tracking-widest text-slate-500 mb-2">Next Steps</div>
          <ul className="space-y-2">
            {(scan.actions || []).map((a) => (
              <li key={a.title} className="text-sm text-slate-200">
                • {a.title}
                {a.detail && <div className="text-xs text-slate-400 ml-3 mt-0.5">{a.detail}</div>}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-white/5">
        <div className="mono text-[10px] text-slate-500">
          {scan.replied ? 'Verdict emailed back to sender' : 'Not yet emailed'}
        </div>
        <button
          data-testid="reply-btn"
          onClick={onReply}
          disabled={scan.replied || replyState === 'sending'}
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 hover:bg-emerald-400/20 text-emerald-200 font-medium px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {replyState === 'sending' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareReply className="h-4 w-4" />}
          {scan.replied ? 'Already sent' : replyState === 'sending' ? 'Sending...' : 'Email verdict to sender'}
          {replyState === 'sent' && !scan.replied && <ChevronRight className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}
