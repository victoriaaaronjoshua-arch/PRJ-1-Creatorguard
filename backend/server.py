from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import json
import logging
import uuid
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Literal, Optional
from datetime import datetime, timezone

from google import genai


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

GEMINI_API_KEY = os.environ['GEMINI_API_KEY']
gemini_client = genai.Client(api_key=GEMINI_API_KEY)
# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Existing status models (kept for compatibility)
# ---------------------------------------------------------------------------
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str


# ---------------------------------------------------------------------------
# CreatorGuard analysis models
# ---------------------------------------------------------------------------
class RateEstimateRequest(BaseModel):
    platform: str = Field(..., min_length=1, max_length=40)
    followers: int = Field(..., ge=0)
    last_month_views: int = Field(..., ge=0)
    engagement_rate: Optional[float] = Field(None, ge=0, le=100)
    brand_industry: str = Field(..., min_length=1, max_length=120)
    deliverable_type: str = Field(..., min_length=1, max_length=200)

class RateEstimateResponse(BaseModel):
    suggested_min: int
    suggested_max: int
    currency: str
    reasoning: str
    negotiation_tips: List[str]
    model: str
class AnalyzeRequest(BaseModel):
    pitch_text: str = Field(..., min_length=1, max_length=20000)

class RiskItem(BaseModel):
    key: Literal['legal', 'financial', 'reputation']
    label: str
    level: Literal['Low', 'Med', 'High']
    tone: Literal['safe', 'warn', 'danger']

class FlagItem(BaseModel):
    title: str
    detail: str

class ActionItem(BaseModel):
    title: str
    detail: str

class AnalyzeResponse(BaseModel):
    id: str
    brand: str
    sender: str
    received_at: str
    score: int
    verdict: str
    verdict_tone: Literal['safe', 'warn', 'danger']
    ring_pct: int
    matrix: List[RiskItem]
    summary: str
    flags: List[FlagItem]
    actions: List[ActionItem]
    model: str


# ---------------------------------------------------------------------------
# Prompt & analyzer
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are CreatorGuard AI — a legal + brand-safety analyst that audits sponsorship pitches for social media creators.

Given a brand pitch email or contract excerpt, you must return a rigorous risk verdict as STRICT JSON with this exact schema:

{
  "brand": string,                     // brand or sender company name; guess from the text
  "sender": string,                    // sender email if present, else "unknown"
  "received_at": string,               // short label like "Received just now · via pasted pitch"
  "score": integer 1-10,               // 1 = definitely a scam, 10 = perfectly safe
  "verdict": string,                   // 2-4 words, e.g. "High Danger", "Caution Advised", "Safe & Verified"
  "verdict_tone": "safe" | "warn" | "danger",  // safe: score >= 8, warn: 5-7, danger: <= 4
  "ring_pct": integer 0-100,           // score * 10 approx
  "matrix": [
    {"key":"legal","label":"Legal Risk","level":"Low"|"Med"|"High","tone":"safe"|"warn"|"danger"},
    {"key":"financial","label":"Financial Risk","level":"Low"|"Med"|"High","tone":"safe"|"warn"|"danger"},
    {"key":"reputation","label":"Reputation Risk","level":"Low"|"Med"|"High","tone":"safe"|"warn"|"danger"}
  ],
  "summary": string,                   // exactly 2 sentences, conversational, plain english
  "flags": [                           // 1-5 items. If the deal is fully safe, return exactly one item with title "None. Terms are fair and transparent."
    {"title": string, "detail": string}
  ],
  "actions": [                         // 2-4 concrete next steps the creator should take
    {"title": string, "detail": string}
  ]
}

Rules:
- level -> tone mapping: Low=safe, Med=warn, High=danger.
- verdict_tone must match the overall score (safe >=8, warn 5-7, danger <=4).
- Look for scam signals: free email domains (@gmail/@yahoo/@hotmail), missing indemnity, upfront-work-before-payment, mandatory positive reviews, no signed contract, unrealistic follower promises, crypto/gift-card payment, urgency pressure.
- Look for safe signals: corporate email domain, DocuSign / signed SOW, net-15/30 terms, indemnity, kill fee, FTC compliance mention, mutual NDA.
- Reply with JSON ONLY. No preamble, no markdown fences, no commentary."""
RATE_SYSTEM_PROMPT = """You are CreatorGuard AI's rate advisor — you help social media creators figure out a fair price to charge brands for sponsored content.

Given the creator's platform, follower count, last month's views, engagement rate (if provided), the brand's industry, and the deliverable being requested, return STRICT JSON with this exact schema:

{
  "suggested_min": integer,     // fair minimum price in USD
  "suggested_max": integer,     // fair maximum price in USD
  "currency": "USD",
  "reasoning": string,          // 2-3 sentences explaining the range, referencing their actual numbers
  "negotiation_tips": [string]  // 2-4 short, concrete tips for negotiating with THIS specific brand/deliverable
}

Rules:
- Base pricing on realistic industry benchmarks (rough guide: $10-$30 per 1,000 engaged views for mid-tier creators, adjusted up for high engagement rate, adjusted up for well-funded brand industries like tech/finance/beauty, adjusted down for small/local businesses).
- Factor in deliverable scope (a single story costs less than a multi-post campaign).
- Be realistic, not inflated — creators should be able to actually get this rate.
- Reply with JSON ONLY. No preamble, no markdown fences, no commentary."""


def _extract_json(raw: str) -> dict:
    """Strip markdown fences and pull the first JSON object out of the LLM text."""
    text = raw.strip()
    # Remove ```json ... ``` fences if present
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    else:
        # Fallback: grab first { ... last }
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1 and end > start:
            text = text[start:end + 1]
    return json.loads(text)


async def analyze_pitch(pitch_text: str) -> dict:
    response = await gemini_client.aio.models.generate_content(
        model="gemini-flash-latest",
        contents=f"Analyze this pitch and return the JSON verdict.\n\n---PITCH---\n{pitch_text}\n---END---",
        config={
            "system_instruction": SYSTEM_PROMPT,
        },
    )
    raw = response.text
    return _extract_json(raw)


async def estimate_rate(req: "RateEstimateRequest") -> dict:
    prompt = (
        f"Platform: {req.platform}\n"
        f"Followers: {req.followers}\n"
        f"Last month views: {req.last_month_views}\n"
        f"Engagement rate: {req.engagement_rate if req.engagement_rate is not None else 'not provided'}%\n"
        f"Brand industry: {req.brand_industry}\n"
        f"Deliverable requested: {req.deliverable_type}\n\n"
        "Return the JSON rate estimate."
    )
    response = await gemini_client.aio.models.generate_content(
        model="gemini-flash-latest",
        contents=prompt,
        config={
            "system_instruction": RATE_SYSTEM_PROMPT,
        },
    )
    raw = response.text
    return _extract_json(raw)

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"message": "CreatorGuard AI API"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_obj = StatusCheck(**input.model_dump())
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for c in checks:
        if isinstance(c['timestamp'], str):
            c['timestamp'] = datetime.fromisoformat(c['timestamp'])
    return checks


@api_router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest):
    try:
        parsed = await analyze_pitch(req.pitch_text)
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse failed: {e}")
        raise HTTPException(status_code=502, detail="Model returned invalid JSON")
    except Exception as e:
        logger.error(f"LLM call failed: {e}")
        raise HTTPException(status_code=502, detail=f"Analysis failed: {str(e)[:200]}")

    # Normalize + defaults
    verdict_id = str(uuid.uuid4())
    score = int(parsed.get('score', 5))
    tone = parsed.get('verdict_tone') or (
        'safe' if score >= 8 else 'warn' if score >= 5 else 'danger'
    )

    response = AnalyzeResponse(
        id=verdict_id,
        brand=str(parsed.get('brand', 'Unknown Brand'))[:120],
        sender=str(parsed.get('sender', 'unknown'))[:200],
        received_at=str(parsed.get('received_at', 'Received just now · via pasted pitch'))[:120],
        score=max(1, min(10, score)),
        verdict=str(parsed.get('verdict', 'Analysis Complete'))[:60],
        verdict_tone=tone,
        ring_pct=max(0, min(100, int(parsed.get('ring_pct', score * 10)))),
        matrix=parsed.get('matrix', []),
        summary=str(parsed.get('summary', ''))[:1200],
        flags=parsed.get('flags', []),
        actions=parsed.get('actions', []),
        model="gemini-flash-latest",
    )

    # Fire-and-forget audit log
    try:
        await db.analyses.insert_one({
            **response.model_dump(),
            "pitch_text": req.pitch_text[:4000],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.warning(f"analysis log failed: {e}")

    return response

@api_router.post("/estimate-rate", response_model=RateEstimateResponse)
async def rate_estimate_route(req: RateEstimateRequest):
    try:
        parsed = await estimate_rate(req)
    except json.JSONDecodeError as e:
        logger.error(f"Rate JSON parse failed: {e}")
        raise HTTPException(status_code=502, detail="Model returned invalid JSON")
    except Exception as e:
        logger.error(f"Rate LLM call failed: {e}")
        raise HTTPException(status_code=502, detail=f"Rate estimate failed: {str(e)[:200]}")

    return RateEstimateResponse(
        suggested_min=int(parsed.get('suggested_min', 0)),
        suggested_max=int(parsed.get('suggested_max', 0)),
        currency=str(parsed.get('currency', 'USD')),
        reasoning=str(parsed.get('reasoning', ''))[:1200],
        negotiation_tips=parsed.get('negotiation_tips', []),
        model="gemini-flash-latest",
    )
# Include the router in the main app
app.include_router(api_router)

# Gmail integration (OAuth + labeled-scan + threaded reply)
from gmail_integration import build_gmail_router  # noqa: E402
app.include_router(build_gmail_router(db, analyze_pitch))

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
