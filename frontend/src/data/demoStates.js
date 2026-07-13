// Hardcoded demo states for the CreatorGuard AI hackathon pitch
// No API calls — all data lives here.

export const DEMO_STATES = {
  empty: {
    id: 'empty',
    label: 'Empty Input',
    shortLabel: 'Empty',
    hasResult: false,
    inputPreview: '',
  },

  scam: {
    id: 'scam',
    label: 'High Risk Scam Deal',
    shortLabel: 'Scam · GlowSkin Co.',
    hasResult: true,
    brand: 'GlowSkin Co.',
    sender: 'sarah.glowskin@gmail.com',
    receivedAt: 'Received 2h ago · via cold pitch',
    score: 3,
    verdict: 'High Danger',
    verdictTone: 'danger',
    ringPct: 30,
    inputPreview:
`Hi creator! We LOVE your vibe.
We'd like you to promote our new GlowSkin+ dermal supplement
to your 180k followers this week. Payment will be released
AFTER we see a guaranteed 5-star review + before-and-after
photos. Please post before you test the product to keep
the launch on schedule. Contract attached — sign & return.
Cheers, Sarah (GlowSkin Co.)`,
    matrix: [
      { key: 'legal', label: 'Legal Risk', level: 'High', tone: 'danger' },
      { key: 'financial', label: 'Financial Risk', level: 'High', tone: 'danger' },
      { key: 'reputation', label: 'Reputation Risk', level: 'High', tone: 'danger' },
    ],
    summary:
      "This offer asks you to promote a medical skincare supplement from an unverified public email address without providing safety certificates. The payment terms are inverted — you carry all the risk while the brand carries none.",
    flags: [
      { title: 'Sender uses a free @gmail.com address', detail: 'No corporate domain — impersonation is trivial and traceability is near zero.' },
      { title: 'Contract is completely missing an indemnity clause', detail: 'You would personally absorb liability for any adverse skin reaction claims.' },
      { title: 'Demands guaranteed positive review before product testing', detail: 'FTC violation risk + Instagram community-guideline strike likely.' },
    ],
    actions: [
      { title: 'Request a verified corporate email domain', detail: 'Reply asking Sarah to re-send from @glowskin.co with a matching LinkedIn.' },
      { title: 'Demand a signed PDF of their third-party laboratory safety report', detail: 'Any legitimate supplement brand has this ready in under 24h.' },
      { title: 'Hold all payment until product is tested for 14 days', detail: 'Move to milestone-based payout — 50% on post, 50% after cooldown.' },
    ],
  },

  safe: {
    id: 'safe',
    label: 'Safe Verified Deal',
    shortLabel: 'Safe · FitLife Gym',
    hasResult: true,
    brand: 'FitLife Gym',
    sender: 'partnerships@fitlife.com',
    receivedAt: 'Received today · via managed inbox',
    score: 9,
    verdict: 'Safe & Verified',
    verdictTone: 'safe',
    ringPct: 90,
    inputPreview:
`Hi — FitLife Gym here. We'd love to bring you into our
Q2 creator program. Deliverables: 2 Reels + 3 Stories over
30 days. Net-15 payment of $6,500 USD via signed SOW.
Full indemnity, mutual NDA, and 45-day exclusivity window
(fitness category only). Kill fee: 40% if we cancel.
Attached: DocuSign contract + brand kit.`,
    matrix: [
      { key: 'legal', label: 'Legal Risk', level: 'Low', tone: 'safe' },
      { key: 'financial', label: 'Financial Risk', level: 'Low', tone: 'safe' },
      { key: 'reputation', label: 'Reputation Risk', level: 'Low', tone: 'safe' },
    ],
    summary:
      "Highly secure and legally sound offer from an established corporate entity with industry-standard creator protection clauses. Payment terms, indemnity, and kill fee are all in line with SAG-AFTRA creator benchmarks.",
    flags: [
      { title: 'None — terms are fair and transparent', detail: 'All clauses reviewed against 12,400 verified brand contracts in our corpus.' },
    ],
    actions: [
      { title: 'Sign the contract', detail: 'DocuSign link is authentic — verified against fitlife.com DNS record.' },
      { title: 'Add the #sponsored tag during publication', detail: 'Required for FTC + ASA (UK) compliance. Also add "Paid Partnership" label on IG.' },
      { title: 'Save an invoice reminder for day 15', detail: 'Net-15 means payment lands ~May 3. Auto-follow-up on day 16 if unpaid.' },
    ],
  },
};

export const DEMO_ORDER = ['empty', 'scam', 'safe'];
