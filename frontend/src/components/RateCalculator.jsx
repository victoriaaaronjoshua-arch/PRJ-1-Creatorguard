import React, { useState } from 'react';
import axios from 'axios';
import {
  Wallet,
  Loader2,
  ArrowRight,
  XCircle,
  Sparkles,
  MessageSquareText,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PLATFORMS = ['Instagram', 'TikTok', 'YouTube', 'Twitter/X', 'LinkedIn', 'Twitch', 'Other'];

export default function RateCalculator() {
  const [platform, setPlatform] = useState('Instagram');
  const [followers, setFollowers] = useState('');
  const [views, setViews] = useState('');
  const [engagement, setEngagement] = useState('');
  const [industry, setIndustry] = useState('');
  const [deliverable, setDeliverable] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const canSubmit =
    followers.trim() !== '' &&
    views.trim() !== '' &&
    industry.trim().length > 0 &&
    deliverable.trim().length > 0 &&
    !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await axios.post(`${API}/estimate-rate`, {
        platform,
        followers: parseInt(followers, 10) || 0,
        last_month_views: parseInt(views, 10) || 0,
        engagement_rate: engagement.trim() === '' ? null : parseFloat(engagement),
        brand_industry: industry.trim(),
        deliverable_type: deliverable.trim(),
      });
      setResult(res.data);
    } catch (e) {
      const msg =
        e?.response?.data?.detail || e?.message || 'Something went wrong. Please try again.';
      setError(typeof msg === 'string' ? msg : 'Rate estimate failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-testid="rate-calculator" className="grid grid-cols-1 lg:grid-cols-[minmax(0,420px),1fr] gap-4 lg:gap-6">
      {/* Input panel */}
      <div className="glass rounded-3xl p-6 lg:p-7 flex flex-col gap-5 h-full">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Wallet className="h-4 w-4 text-violet-600" strokeWidth={2.2} />
            <span className="mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
              Rate Calculator
            </span>
          </div>
          <h1 className="text-3xl lg:text-[34px] font-semibold tracking-tight text-slate-900 leading-[1.1]">
            Know Your <span className="serif italic text-violet-600 font-normal">Worth</span>
          </h1>
          <p className="mt-2 text-sm text-slate-500 max-w-md">
            Tell us about your audience and the brand reaching out — we'll suggest a fair rate to quote.
          </p>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600 mb-1.5 block">Platform</label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/15"
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1.5 block">Followers</label>
            <input
              type="number"
              min="0"
              value={followers}
              onChange={(e) => setFollowers(e.target.value)}
              placeholder="e.g. 25000"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/15"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1.5 block">Views last month</label>
            <input
              type="number"
              min="0"
              value={views}
              onChange={(e) => setViews(e.target.value)}
              placeholder="e.g. 120000"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/15"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600 mb-1.5 block">
            Engagement rate % <span className="text-slate-400">(optional)</span>
          </label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={engagement}
            onChange={(e) => setEngagement(e.target.value)}
            placeholder="e.g. 4.5"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/15"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600 mb-1.5 block">What kind of company is reaching out?</label>
          <input
            type="text"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="e.g. Beauty startup, local gym, fintech app"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/15"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600 mb-1.5 block">What are they asking for?</label>
          <textarea
            value={deliverable}
            onChange={(e) => setDeliverable(e.target.value)}
            placeholder="e.g. 1 Reel + 2 Stories, exclusivity for 30 days"
            className="w-full h-20 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-violet-400/60 focus:ring-2 focus:ring-violet-400/15"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="relative overflow-hidden w-full rounded-2xl px-6 py-4 font-semibold text-white bg-violet-600 hover:bg-violet-500 transition-all duration-200 flex items-center justify-center gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="h-4.5 w-4.5 animate-spin" />
              <span>Calculating your rate...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-4.5 w-4.5" strokeWidth={2.4} />
              <span className="tracking-tight">Get My Rate</span>
              <ArrowRight className="h-4 w-4 opacity-70" />
            </>
          )}
        </button>

        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
            <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
            <div>{error}</div>
          </div>
        )}
      </div>

      {/* Result panel */}
      <div className="min-w-0">
        {!result ? (
          <div className="glass rounded-3xl p-10 lg:p-14 h-full flex flex-col items-center justify-center text-center gap-6">
            <div className="h-24 w-24 rounded-3xl bg-gradient-to-br from-violet-400/20 via-violet-500/5 to-transparent border border-violet-400/20 flex items-center justify-center">
              <Wallet className="h-9 w-9 text-violet-500/80" strokeWidth={1.6} />
            </div>
            <div className="max-w-sm">
              <h3 className="text-xl font-semibold text-slate-900 tracking-tight">
                Waiting for your details
              </h3>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                Fill in your stats on the left and we'll suggest a fair rate range based on real industry benchmarks.
              </p>
            </div>
          </div>
        ) : (
          <div className="glass rounded-3xl p-6 lg:p-8 flex flex-col gap-6">
            <div>
              <div className="mono text-[10px] uppercase tracking-[0.22em] text-slate-500 mb-2">
                Suggested Rate
              </div>
              <div className="flex items-end gap-2">
                <span className="text-5xl font-semibold text-violet-600 tracking-tight">
                  ${result.suggested_min.toLocaleString()}
                </span>
                <span className="text-2xl text-slate-400 mb-1">–</span>
                <span className="text-5xl font-semibold text-violet-600 tracking-tight">
                  ${result.suggested_max.toLocaleString()}
                </span>
                <span className="mono text-sm text-slate-400 mb-2 ml-1">{result.currency}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-violet-600" />
                <span className="mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                  Why this range
                </span>
              </div>
              <p className="text-sm leading-relaxed text-slate-700">{result.reasoning}</p>
            </div>

            {result.negotiation_tips?.length > 0 && (
              <div className="pt-4 border-t border-slate-200">
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquareText className="h-4 w-4 text-violet-600" />
                  <span className="mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                    Negotiation tips
                  </span>
                </div>
                <ul className="flex flex-col gap-2">
                  {result.negotiation_tips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-violet-400 shrink-0" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}