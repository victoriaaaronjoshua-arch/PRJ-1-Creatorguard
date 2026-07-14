import React, { useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Share2, Download, ShieldCheck, ShieldAlert, Loader2, Copy, Check } from 'lucide-react';

const toneStyle = {
  safe: {
    ring: '#34d399',
    tag: 'linear-gradient(135deg, rgba(52,211,153,0.24), rgba(52,211,153,0.10))',
    tagBorder: 'rgba(52,211,153,0.5)',
    scoreColor: '#34d399',
  },
  warn: {
    ring: '#fbbf24',
    tag: 'linear-gradient(135deg, rgba(251,191,36,0.24), rgba(251,191,36,0.10))',
    tagBorder: 'rgba(251,191,36,0.5)',
    scoreColor: '#fbbf24',
  },
  danger: {
    ring: '#fb7185',
    tag: 'linear-gradient(135deg, rgba(251,113,133,0.24), rgba(251,113,133,0.10))',
    tagBorder: 'rgba(251,113,133,0.5)',
    scoreColor: '#fb7185',
  },
};

const catchLine = (score) => {
  if (score <= 3) return "Dodged a scam. Thanks CreatorGuard AI.";
  if (score <= 6) return "This deal needs a second look.";
  if (score <= 8) return "Looks solid — audited by CreatorGuard AI.";
  return "Verified safe. Signed with confidence.";
};

// Rendered off-screen and used only as the source for the PNG conversion.
const ShareCard = React.forwardRef(({ verdict }, ref) => {
  const tone = verdict.verdict_tone || verdict.verdictTone || 'danger';
  const s = toneStyle[tone] || toneStyle.danger;
  const pct = Math.max(6, Math.min(100, verdict.ring_pct ?? verdict.ringPct ?? verdict.score * 10));

  return (
    <div
      ref={ref}
      style={{
        width: '1080px',
        height: '1080px',
        padding: '72px',
        background:
          'radial-gradient(circle at 20% 10%, rgba(56,189,248,0.10), transparent 40%), radial-gradient(circle at 85% 80%, rgba(52,211,153,0.10), transparent 45%), linear-gradient(180deg, #060a13 0%, #0a1220 100%)',
        fontFamily: 'Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: '#e6eaf2',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div style={{
            width: '60px', height: '60px', borderRadius: '18px',
            background: 'linear-gradient(135deg, rgba(52,211,153,0.3), rgba(52,211,153,0.05))',
            border: '1px solid rgba(52,211,153,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ fontSize: '30px', color: '#34d399', fontWeight: 700 }}>✓</div>
          </div>
          <div>
            <div style={{ fontSize: '28px', fontWeight: 600, letterSpacing: '-0.01em' }}>
              CreatorGuard <span style={{ color: '#34d399' }}>AI</span>
            </div>
            <div style={{ fontSize: '13px', color: '#64748b', letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: 'Geist Mono, ui-monospace, monospace' }}>
              Brand Deal Intelligence
            </div>
          </div>
        </div>
        <div style={{
          padding: '10px 18px', borderRadius: '999px',
          background: s.tag, border: `1px solid ${s.tagBorder}`,
          fontSize: '16px', fontWeight: 600, color: s.scoreColor,
        }}>
          {verdict.verdict}
        </div>
      </div>

      {/* Score ring */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '48px' }}>
        <div style={{
          width: '380px', height: '380px', borderRadius: '50%',
          background: `conic-gradient(${s.ring} ${pct}%, rgba(148,163,184,0.14) 0)`,
          padding: '10px',
        }}>
          <div style={{
            width: '100%', height: '100%', borderRadius: '50%',
            background: '#080d18', border: '1px solid rgba(148,163,184,0.15)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              fontSize: '15px', textTransform: 'uppercase',
              letterSpacing: '0.22em', color: s.scoreColor, opacity: 0.9,
              fontFamily: 'Geist Mono, ui-monospace, monospace',
            }}>Safety Score</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', marginTop: '10px' }}>
              <div style={{ fontSize: '160px', fontWeight: 600, color: s.scoreColor, lineHeight: 0.9 }}>{verdict.score}</div>
              <div style={{ fontSize: '32px', color: '#64748b', marginBottom: '18px', fontFamily: 'Geist Mono, monospace' }}>/10</div>
            </div>
            <div style={{ marginTop: '10px', fontSize: '14px', color: '#64748b', fontFamily: 'Geist Mono, monospace' }}>
              analyzed · gemini-2.5-flash
            </div>
          </div>
        </div>
      </div>

      {/* Brand */}
      <div style={{ textAlign: 'center', marginTop: '40px' }}>
        <div style={{ fontSize: '15px', color: '#64748b', fontFamily: 'Geist Mono, monospace', letterSpacing: '0.22em', textTransform: 'uppercase' }}>
          Verdict on
        </div>
        <div style={{ fontSize: '52px', fontWeight: 600, marginTop: '10px', letterSpacing: '-0.02em', color: '#ffffff' }}>
          {verdict.brand}
        </div>
      </div>

      {/* Catch line */}
      <div style={{
        marginTop: 'auto', textAlign: 'center', paddingTop: '32px',
      }}>
        <div style={{ fontSize: '30px', fontStyle: 'italic', color: '#cbd5e1', fontFamily: 'Instrument Serif, serif', lineHeight: 1.25 }}>
          &ldquo;{catchLine(verdict.score)}&rdquo;
        </div>
      </div>

      {/* Footer */}
      <div style={{
        marginTop: '40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.06)',
        fontFamily: 'Geist Mono, monospace', fontSize: '14px', color: '#64748b',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34d399' }} />
          creatorguard.ai
        </div>
        <div>© 2026 · scan your next brand deal for free</div>
      </div>
    </div>
  );
});
ShareCard.displayName = 'ShareCard';

export default function ShareVerdictButton({ verdict }) {
  const cardRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const filename = () => {
    const brand = (verdict?.brand || 'verdict').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `creatorguard-${brand}-${verdict?.score ?? '0'}of10.png`;
  };

  const generateBlob = async () => {
    if (!cardRef.current) return null;
    // Wait for web fonts before capturing so text renders correctly.
    if (document?.fonts?.ready) {
      try { await document.fonts.ready; } catch (_) { /* ignore */ }
    }
    const dataUrl = await toPng(cardRef.current, {
      pixelRatio: 1,
      cacheBust: true,
      backgroundColor: '#060a13',
    });
    const blob = await (await fetch(dataUrl)).blob();
    return { blob, dataUrl };
  };

  const handleDownload = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const out = await generateBlob();
      if (!out) return;
      const url = URL.createObjectURL(out.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 500);
    } catch (e) {
      console.error('share render failed', e);
    } finally {
      setBusy(false);
    }
  };

  const handleShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const out = await generateBlob();
      if (!out) return;
      const file = new File([out.blob], filename(), { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `CreatorGuard verdict · ${verdict.brand}`,
          text: catchLine(verdict.score),
        });
      } else {
        // Fallback: download
        const url = URL.createObjectURL(out.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename();
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 500);
      }
    } catch (e) {
      // user cancelled — silent
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const out = await generateBlob();
      if (!out || !navigator.clipboard || !window.ClipboardItem) {
        await handleDownload();
        return;
      }
      await navigator.clipboard.write([
        new window.ClipboardItem({ 'image/png': out.blob }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      await handleDownload();
    } finally {
      setBusy(false);
    }
  };

  if (!verdict) return null;

  return (
    <div data-testid="share-verdict" className="flex flex-wrap items-center gap-2">
      <button
        data-testid="share-btn"
        onClick={handleShare}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold px-3.5 py-2 text-sm disabled:opacity-60 transition-colors shadow-sm"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
        Share verdict
      </button>
      <button
        data-testid="download-btn"
        onClick={handleDownload}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-700 font-medium px-3.5 py-2 text-sm disabled:opacity-60 transition-colors"
      >
        <Download className="h-4 w-4" />
        Download PNG
      </button>
      <button
        data-testid="copy-btn"
        onClick={handleCopy}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-700 font-medium px-3.5 py-2 text-sm disabled:opacity-60 transition-colors"
        title="Copy PNG to clipboard"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        {copied ? 'Copied!' : 'Copy'}
      </button>

      {/* Offscreen card used only for capture */}
      <div style={{ position: 'fixed', left: '-99999px', top: 0, pointerEvents: 'none' }} aria-hidden="true">
        <ShareCard ref={cardRef} verdict={verdict} />
      </div>
    </div>
  );
}
