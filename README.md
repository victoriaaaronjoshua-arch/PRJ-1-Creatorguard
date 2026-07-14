# Here are your Instructions
# CreatorGuard AI 🛡️

**Brand Deal Intelligence for Content Creators**

CreatorGuard AI helps creators instantly spot scammy, lowball, or exploitative brand deal pitches before they respond — using AI to score, flag, and explain what's really being offered.

![FastAPI](https://shields.io)
![React](https://shields.io)
![MongoDB](https://shields.io)
![Gemini](https://shields.io)

---

## The Problem

Creators receive brand pitch emails constantly, and many are:
- Underpaying relative to audience size and niche
- Hiding unfavorable terms (unlimited usage rights, long exclusivity windows, NET-90 payment terms)
- Outright scams with no real budget or intent to pay

Sorting the legitimate opportunities from the red flags takes time and experience most creators don't have — especially early in their careers.

## What It Does

- **Connects to Gmail** (OAuth 2.0) and scans only emails you explicitly label `CreatorGuard` — nothing else in your inbox is touched.
- **AI-powered analysis** (Gemini 2.5 Flash) reads each pitch and produces:
  - A **1–10 risk/quality score**
  - A **verdict** (safe / caution / danger) with plain-English reasoning
  - **Flags** — specific red flags found in the email (vague deliverables, no upfront payment, suspicious urgency, etc.)
  - **Recommended next steps** — what the creator should do or ask for
  - **Auto-reply option** — optionally emails the AI verdict straight back to the sender
- **Paste & Scan** — analyze any pitch manually, without needing Gmail
- **Rate Calculator** — estimate fair market rate based on audience size and niche
- **Dashboard** — browse all scanned pitches with score badges and full verdict detail

### Preview

![CreatorGuard Dashboard Preview](https://placeholder.com)

## How It Works

1. Label any brand pitch email in Gmail with `CreatorGuard` (customizable label name)
2. Hit **Sync now** in the dashboard
3. CreatorGuard pulls labeled messages via the Gmail API, runs each through an AI analysis pipeline, and stores the verdict
4. Review scores, flags, and next steps — reply with one click if you want the AI's verdict sent back to the brand

## Tech Stack

**Backend**
- FastAPI (Python)
- MongoDB Atlas (scan history, OAuth state, user settings)
- Google OAuth 2.0 + Gmail API (`gmail.readonly`, `gmail.send`, `gmail.labels` scopes)
- Gemini 2.5 Flash for pitch analysis

**Frontend**
- React
- Tailwind CSS (dark, glassmorphism-style UI)
- Axios for API communication

## Privacy by Design

CreatorGuard never scans your full inbox. It only reads messages you've explicitly labeled, and only requests the minimum Gmail scopes needed to read labeled mail and send replies. Nothing is shared with brands or third parties beyond the optional auto-reply feature, which you control.

## Getting Started

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate # Windows
pip install -r requirements.txt
uvicorn server:app --reload --port 8000
```

Create a `.env` file in `backend/` with:

```env
MONGO_URL=your-mongodb-connection-string
DB_NAME=creatorguard
GEMINI_API_KEY=your-gemini-key
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/oauth/gmail/callback
FRONTEND_URL=http://localhost:3000
```

### Frontend

```bash
cd frontend
npm install
npm start
```

The app will be available at `http://localhost:3000`.

## Roadmap

- [ ] Historical trend charts (risk score over time)
- [ ] Rate Calculator auto-populated from scanned pitch context
- [ ] Contract clause extraction (usage rights, exclusivity, payment terms)
- [ ] Cross-user brand reputation signals
- [ ] Browser extension for non-Gmail inboxes

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Built for creators, to help them get paid fairly and avoid getting burned.
