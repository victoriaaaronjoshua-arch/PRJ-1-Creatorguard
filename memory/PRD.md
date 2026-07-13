# CreatorGuard AI — Hackathon Pitch Demo

## Original Problem Statement
Build a single-page, fully responsive web app (React + Tailwind + Lucide) that simulates
a "brand deal safety scanner" for social media creators. Pure static frontend with a
hardcoded demo-state toggle so the founder can switch between 3 states during pitch:
1. Empty Input
2. High Risk Scam Deal (GlowSkin Co. — Score 3/10)
3. Safe Verified Deal (FitLife Gym — Score 9/10)

## User Choices (locked in)
- Design vibe: **Premium fintech** (Geist + Instrument Serif accents, deep slate #060a13,
  emerald neon safe / rose danger / amber warn, glassmorphism, grid lines)
- Architecture: **Pure static single-page** (no backend, no persistence, no APIs)

## Architecture
- Single `App.js` composing header + demo-toggle + split workspace (input | result)
- Hardcoded data in `src/data/demoStates.js`
- Fonts loaded via Google Fonts (Geist, Geist Mono, Instrument Serif)
- No backend calls; the existing FastAPI server is left untouched

## Implemented (2026-02-10)
- Sticky glass header with shield-logo "CreatorGuard AI", Beta Protocol v1.0 badge, avatar
- Demo state toggle (Empty / Scam / Safe) — active pill styling, mono numeric prefix
- Left panel: heading with serif italic accent, textarea (auto-syncs with demo state),
  dashed drag-drop container, primary CTA with loading dots + emerald glow pulse
- Right panel — Empty state: illustrated inbox card, animated ping ring, risk-vector chips
- Right panel — Result state:
  - Circular safety score ring (conic gradient, tone-aware color)
  - 3 risk matrix cards (Legal / Financial / Reputation) with animated bar
  - AI executive summary card with sender metadata
  - Flagged issues list with warning/check icons
  - Interactive action items checklist (click to toggle, live count)
- Grid-line background, grain-radial gradient, staggered fade-up animations
- All interactive elements carry `data-testid` attributes
- Verified via screenshots across all 3 states at 1920×800

## Feature Update (2026-02-10) — Real LLM Analysis
- Added **POST /api/analyze** in FastAPI backend using `emergentintegrations` + Claude Sonnet 4.5
  (`claude-sonnet-4-5-20250929`) with structured JSON system prompt covering brand,
  sender, score, verdict, tone, 3-key risk matrix, summary, flags, and action items.
- Robust JSON parser strips markdown fences and normalizes response.
- Every analysis is persisted to `db.analyses` for audit history.
- Frontend rewired: textarea now holds the live text; demo toggle just prefills the
  textarea. Clicking "Verify Deal Safety" hits `/api/analyze`, shows a scanning
  loader, and renders the real LLM verdict in the right panel.
- Error state rendered inline in the input panel if the LLM call fails.
- EMERGENT_LLM_KEY added to backend/.env.

## Feature Update (2026-02-10) — Client-Side PDF Parsing
- Added `pdfjs-dist@4.10.38` (Node-20-compatible), worker loaded via CDN pin.
- New helper `src/lib/pdfExtractor.js` extracts all page text and joins into a
  clean, whitespace-normalized string.
- Drop zone is now fully functional: click-to-browse, drag & drop with active
  border/glow state, keyboard-accessible, PDF-only guard, 25MB cap, image-only
  PDF detection, error and success states with filename + char count.
- Extracted text auto-populates the textarea (capped at 18k chars) and stays
  editable — user can trim before hitting "Verify Deal Safety".
- Verified E2E via Playwright: 1.7KB scam-pitch PDF → 388 chars extracted →
  Claude returned 2/10 "Critical Red Flags" with 5 FTC-aware flags.

## Feature Update (2026-02-10) — Gmail Integration (Read + Reply)
- Added `google-auth-oauthlib` + `google-api-python-client` + `google-auth`.
- New `backend/gmail_integration.py` module with a self-contained router:
  - `GET  /api/oauth/gmail/login` — starts OAuth (offline + consent for refresh token).
  - `GET  /api/oauth/gmail/callback` — exchanges code, fetches user email, persists tokens, redirects back to frontend with `?gmail=connected`.
  - `GET  /api/gmail/status` — connection state + email.
  - `POST /api/gmail/disconnect` — nukes tokens + scans.
  - `POST /api/gmail/sync` — resolves (or creates) the `CreatorGuard` label, pulls up to 25 labeled messages, parses MIME (plain > html-stripped), sends each body to the same Claude Sonnet 4.5 analyzer used by `/api/analyze`, and persists verdicts.
  - `GET  /api/gmail/messages` + `/messages/{id}` — list + detail.
  - `POST /api/gmail/reply/{scan_id}` — sends a threaded verdict reply (proper `In-Reply-To` + `References` headers).
- Tokens stored per-user in `db.gmail_tokens`; scans in `db.gmail_scans`. Auto-refreshes access tokens 60s before expiry.
- Per-browser stable user id via `src/lib/userId.js` (localStorage UUID) — no accounts needed for the demo.
- Frontend: added a top-center **mode switcher** (Paste & Scan | Gmail Inbox), a new `components/InboxPanel.jsx` covering: disconnected view with "Connect Gmail" CTA + filter setup recipe, connected view with email badge, delivery preference toggle (**Dashboard only** vs **Email verdict back**), "Sync now" button, scan list + detail with score/matrix/summary/flags/actions + "Email verdict to sender" reply button.
- Delivery preference persists in localStorage. When set to "reply", freshly synced pitches auto-send verdict replies.
- Env vars added: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `FRONTEND_URL`, `CREATORGUARD_LABEL`.

## Feature Update (2026-02-10) — DOCX + EML support, Label rename, Shareable PNG card
- Unified extractor now handles **PDF · DOCX · EML** (all client-side):
  - DOCX via `mammoth.extractRawText`.
  - EML via a lightweight MIME parser: unfolds RFC-5322 headers, walks multipart bodies, prefers `text/plain`, falls back to `text/html` (stripped), **UTF-8-safe** quoted-printable + base64 decode via `TextDecoder` (fixes smart-quote garbling).
  - Public API: `extractText(file)` + `detectKind(file)` + `ACCEPTED_MIME`.
- Drop zone accepts all three types; success line shows filename + kind + char count.
- **Per-user Gmail label:** new `db.gmail_settings` collection + `POST /api/gmail/settings`. Status/sync read the per-user override. Inbox panel adds inline pencil-edit → input → save/cancel UX; edits persist across reloads.
- **Shareable PNG card** (`components/ShareVerdictButton.jsx`): renders a hidden 1080×1080 branded card (score ring, brand, verdict tag, serif catch-line, footer), converts via `html-to-image`. Three actions: **Share verdict** (native `navigator.share` with file), **Download PNG**, **Copy** (clipboard image). Verified: 870KB PNG rendered pixel-perfect for IG / Twitter stories.

## Backlog / Next Action Items (P1/P2)
- P2 — Add a small "Ask CreatorGuard" chat drawer (LLM integration with Emergent LLM key)
- P2 — Persist recent scans in Mongo per creator with an audit history sidebar
- P2 — Optional automatic Gmail sync every 5 min
