"""
Gmail integration for CreatorGuard AI.

- OAuth 2.0 flow with offline refresh tokens.
- Reads messages filtered by a label (default: "CreatorGuard").
- Sends threaded replies with the LLM verdict.

Tokens are persisted per-user in Mongo (`gmail_tokens` collection).
Scanned messages + verdicts land in `gmail_scans`.
"""

from __future__ import annotations

import base64
import logging
import os
import uuid
import warnings
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.labels",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]

OAUTH_STATE_TTL_SEC = 600  # 10 minutes


def _client_config() -> dict:
    return {
        "web": {
            "client_id": os.environ["GOOGLE_CLIENT_ID"],
            "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }


def _redirect_uri() -> str:
    return os.environ["GOOGLE_REDIRECT_URI"]


def _frontend_url() -> str:
    return os.environ["FRONTEND_URL"]


def _label_name() -> str:
    return os.environ.get("CREATORGUARD_LABEL", "CreatorGuard")


async def _label_for_user(db, user_id: str) -> str:
    doc = await db.gmail_settings.find_one({"user_id": user_id}, {"_id": 0})
    if doc and doc.get("label"):
        return doc["label"]
    return _label_name()


# ---------------------------------------------------------------------------
# Pydantic response models
# ---------------------------------------------------------------------------

class GmailStatus(BaseModel):
    connected: bool
    email: Optional[str] = None
    label: str


class UpdateLabelBody(BaseModel):
    label: str


class SyncSummary(BaseModel):
    scanned: int
    new: int
    label: str


class ScanRow(BaseModel):
    id: str
    gmail_message_id: str
    thread_id: str
    from_email: str
    subject: str
    scanned_at: str
    score: int
    verdict: str
    verdict_tone: str
    replied: bool
    brand: str


# ---------------------------------------------------------------------------
# Token helpers (per user)
# ---------------------------------------------------------------------------

async def _save_state(db, state: str, user_id: str, code_verifier: Optional[str] = None) -> None:
    await db.oauth_states.update_one(
        {"state": state},
        {
            "$set": {
                "state": state,
                "user_id": user_id,
                "code_verifier": code_verifier,
                "expires_at": (
                    datetime.now(timezone.utc) + timedelta(seconds=OAUTH_STATE_TTL_SEC)
                ).isoformat(),
            }
        },
        upsert=True,
    )


async def _consume_state(db, state: str) -> dict:
    doc = await db.oauth_states.find_one({"state": state}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state.")
    expires = datetime.fromisoformat(doc["expires_at"])
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires:
        await db.oauth_states.delete_one({"state": state})
        raise HTTPException(status_code=400, detail="OAuth state expired.")
    await db.oauth_states.delete_one({"state": state})
    return {"user_id": doc["user_id"], "code_verifier": doc.get("code_verifier")}


async def _save_tokens(db, user_id: str, creds: Credentials, email: str) -> None:
    expires_at = creds.expiry
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    doc = {
        "user_id": user_id,
        "email": email,
        "access_token": creds.token,
        "refresh_token": creds.refresh_token,
        "expires_at": (expires_at or datetime.now(timezone.utc)).isoformat(),
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "token_uri": creds.token_uri,
        "scopes": list(creds.scopes) if creds.scopes else GOOGLE_SCOPES,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.gmail_tokens.update_one({"user_id": user_id}, {"$set": doc}, upsert=True)


async def _get_creds(db, user_id: str) -> Credentials:
    token = await db.gmail_tokens.find_one({"user_id": user_id}, {"_id": 0})
    if not token:
        raise HTTPException(status_code=401, detail="Gmail not connected.")
    if not token.get("refresh_token"):
        raise HTTPException(
            status_code=401,
            detail="Missing refresh token — please reconnect Gmail.",
        )
    creds = Credentials(
        token=token["access_token"],
        refresh_token=token["refresh_token"],
        token_uri=token["token_uri"],
        client_id=token["client_id"],
        client_secret=token["client_secret"],
        scopes=token.get("scopes", GOOGLE_SCOPES),
    )
    expires = datetime.fromisoformat(token["expires_at"])
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)

    if datetime.now(timezone.utc) >= expires - timedelta(seconds=60):
        creds.refresh(GoogleRequest())
        await db.gmail_tokens.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    "access_token": creds.token,
                    "expires_at": (
                        creds.expiry.replace(tzinfo=timezone.utc)
                        if creds.expiry and creds.expiry.tzinfo is None
                        else (creds.expiry or datetime.now(timezone.utc))
                    ).isoformat(),
                }
            },
        )
    return creds


# ---------------------------------------------------------------------------
# Gmail message parsing
# ---------------------------------------------------------------------------

def _decode_body(part: dict) -> str:
    body = part.get("body", {})
    data = body.get("data")
    if not data:
        return ""
    try:
        return base64.urlsafe_b64decode(data.encode("utf-8")).decode(
            "utf-8", errors="ignore"
        )
    except Exception:
        return ""


def _extract_text(payload: dict) -> str:
    """Walk the MIME tree and return the best plain-text body we can find."""
    if not payload:
        return ""
    mime = payload.get("mimeType", "")
    if mime == "text/plain":
        return _decode_body(payload)
    parts = payload.get("parts") or []
    # Prefer text/plain, fall back to text/html stripped, then any part.
    for p in parts:
        if p.get("mimeType") == "text/plain":
            txt = _decode_body(p)
            if txt:
                return txt
    for p in parts:
        if p.get("mimeType") == "text/html":
            raw = _decode_body(p)
            if raw:
                import re
                return re.sub(r"<[^>]+>", " ", raw)
    for p in parts:
        txt = _extract_text(p)
        if txt:
            return txt
    return ""


def _header(headers: list, name: str) -> str:
    for h in headers or []:
        if h.get("name", "").lower() == name.lower():
            return h.get("value", "")
    return ""


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

def build_gmail_router(db, analyze_pitch) -> APIRouter:
    """analyze_pitch is injected from server.py to keep this module decoupled."""
    router = APIRouter(prefix="/api")

    # -----------------------------------------------------------------------
    # OAuth
    # -----------------------------------------------------------------------
    @router.get("/oauth/gmail/login")
    async def gmail_login(user_id: str = Query(..., min_length=8)):
        flow = Flow.from_client_config(
            _client_config(), scopes=GOOGLE_SCOPES, redirect_uri=_redirect_uri()
        )
        url, state = flow.authorization_url(
            access_type="offline",
            prompt="consent",
            include_granted_scopes="true",
        )
        # google-auth-oauthlib generates a PKCE code_verifier per Flow instance.
        # Persist it so the callback (a new Flow) can complete the token exchange.
        code_verifier = getattr(flow, "code_verifier", None)
        await _save_state(db, state, user_id, code_verifier)
        return {"authorize_url": url}

    @router.get("/oauth/gmail/callback")
    async def gmail_callback(
        code: Optional[str] = None,
        state: Optional[str] = None,
        error: Optional[str] = None,
    ):
        if error:
            return RedirectResponse(
                f"{_frontend_url()}/?gmail=error&reason={error}"
            )
        if not code or not state:
            return RedirectResponse(f"{_frontend_url()}/?gmail=error&reason=missing_params")

        state_doc = await _consume_state(db, state)
        user_id = state_doc["user_id"]

        flow = Flow.from_client_config(
            _client_config(), scopes=GOOGLE_SCOPES, redirect_uri=_redirect_uri()
        )
        # Reattach the PKCE verifier the login step generated.
        if state_doc.get("code_verifier"):
            flow.code_verifier = state_doc["code_verifier"]

        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")  # scope-order mismatch warning
                flow.fetch_token(code=code)
        except Exception as e:
            logger.error(f"OAuth token exchange failed: {e}")
            return RedirectResponse(
                f"{_frontend_url()}/?gmail=error&reason=token_exchange_failed"
            )

        creds = flow.credentials

        # Fetch the user's email
        try:
            oauth_service = build("oauth2", "v2", credentials=creds, cache_discovery=False)
            info = oauth_service.userinfo().get().execute()
            email = info.get("email", "unknown")
        except Exception as e:
            logger.warning(f"userinfo fetch failed: {e}")
            email = "unknown"

        await _save_tokens(db, user_id, creds, email)
        return RedirectResponse(f"{_frontend_url()}/?gmail=connected")

    # -----------------------------------------------------------------------
    # Status + disconnect
    # -----------------------------------------------------------------------
    @router.get("/gmail/status", response_model=GmailStatus)
    async def gmail_status(user_id: str = Query(..., min_length=8)):
        token = await db.gmail_tokens.find_one({"user_id": user_id}, {"_id": 0})
        label = await _label_for_user(db, user_id)
        return GmailStatus(
            connected=bool(token),
            email=token.get("email") if token else None,
            label=label,
        )

    @router.post("/gmail/settings", response_model=GmailStatus)
    async def gmail_settings(body: UpdateLabelBody, user_id: str = Query(..., min_length=8)):
        clean = (body.label or "").strip()
        if not clean:
            raise HTTPException(status_code=400, detail="Label cannot be empty.")
        if len(clean) > 60:
            raise HTTPException(status_code=400, detail="Label too long (max 60 chars).")
        await db.gmail_settings.update_one(
            {"user_id": user_id},
            {"$set": {"user_id": user_id, "label": clean}},
            upsert=True,
        )
        token = await db.gmail_tokens.find_one({"user_id": user_id}, {"_id": 0})
        return GmailStatus(
            connected=bool(token),
            email=token.get("email") if token else None,
            label=clean,
        )

    @router.post("/gmail/disconnect")
    async def gmail_disconnect(user_id: str = Query(..., min_length=8)):
        await db.gmail_tokens.delete_one({"user_id": user_id})
        await db.gmail_scans.delete_many({"user_id": user_id})
        await db.gmail_settings.delete_one({"user_id": user_id})
        return {"ok": True}

    # -----------------------------------------------------------------------
    # Sync — pull labeled pitches, run Claude, persist verdicts
    # -----------------------------------------------------------------------
    async def _resolve_label_id(service, label_name: str) -> Optional[str]:
        labels = service.users().labels().list(userId="me").execute().get("labels", [])
        for lbl in labels:
            if lbl["name"].lower() == label_name.lower():
                return lbl["id"]
        return None

    @router.post("/gmail/sync", response_model=SyncSummary)
    async def gmail_sync(user_id: str = Query(..., min_length=8)):
        creds = await _get_creds(db, user_id)
        try:
            service = build("gmail", "v1", credentials=creds, cache_discovery=False)
            label_name = await _label_for_user(db, user_id)
            label_id = await _resolve_label_id(service, label_name)
            if not label_id:
                # Create the label so the user's Gmail filter can start using it.
                created = service.users().labels().create(
                    userId="me",
                    body={
                        "name": label_name,
                        "labelListVisibility": "labelShow",
                        "messageListVisibility": "show",
                    },
                ).execute()
                label_id = created["id"]

            listing = service.users().messages().list(
                userId="me", labelIds=[label_id], maxResults=25
            ).execute()
            msgs = listing.get("messages", [])
        except HttpError as e:
            raise HTTPException(status_code=502, detail=f"Gmail error: {e}")

        new_count = 0
        for m in msgs:
            gmail_id = m["id"]
            existing = await db.gmail_scans.find_one(
                {"user_id": user_id, "gmail_message_id": gmail_id}
            )
            if existing:
                continue

            full = service.users().messages().get(
                userId="me", id=gmail_id, format="full"
            ).execute()

            headers = full.get("payload", {}).get("headers", [])
            subject = _header(headers, "Subject") or "(no subject)"
            from_email = _header(headers, "From") or "unknown"
            body = _extract_text(full.get("payload") or {}).strip()

            if not body:
                body = full.get("snippet", "")

            if not body:
                continue

            # Run the same Claude analyzer used by /api/analyze
            try:
                parsed = await analyze_pitch(body[:12000])
            except Exception as e:
                logger.warning(f"analyze failed for {gmail_id}: {e}")
                continue

            score = int(parsed.get("score", 5))
            tone = parsed.get("verdict_tone") or (
                "safe" if score >= 8 else "warn" if score >= 5 else "danger"
            )
            doc = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "gmail_message_id": gmail_id,
                "thread_id": full.get("threadId"),
                "from_email": from_email,
                "subject": subject,
                "snippet": full.get("snippet", "")[:280],
                "body_preview": body[:1000],
                "scanned_at": datetime.now(timezone.utc).isoformat(),
                "score": max(1, min(10, score)),
                "verdict": str(parsed.get("verdict", "Analysis Complete"))[:60],
                "verdict_tone": tone,
                "ring_pct": max(0, min(100, int(parsed.get("ring_pct", score * 10)))),
                "brand": str(parsed.get("brand", "Unknown"))[:120],
                "sender": str(parsed.get("sender", from_email))[:200],
                "summary": str(parsed.get("summary", ""))[:1200],
                "matrix": parsed.get("matrix", []),
                "flags": parsed.get("flags", []),
                "actions": parsed.get("actions", []),
                "replied": False,
                "model": "claude-sonnet-4-5-20250929",
            }
            await db.gmail_scans.insert_one(doc)
            new_count += 1

        return SyncSummary(scanned=len(msgs), new=new_count, label=label_name)

    # -----------------------------------------------------------------------
    # List + detail
    # -----------------------------------------------------------------------
    @router.get("/gmail/messages")
    async def gmail_messages(user_id: str = Query(..., min_length=8)):
        cursor = db.gmail_scans.find(
            {"user_id": user_id}, {"_id": 0}
        ).sort("scanned_at", -1).limit(50)
        return await cursor.to_list(length=50)

    @router.get("/gmail/messages/{scan_id}")
    async def gmail_message_detail(scan_id: str, user_id: str = Query(..., min_length=8)):
        doc = await db.gmail_scans.find_one(
            {"id": scan_id, "user_id": user_id}, {"_id": 0}
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Not found.")
        return doc

    # -----------------------------------------------------------------------
    # Reply with verdict
    # -----------------------------------------------------------------------
    def _build_verdict_reply(scan: dict) -> str:
        lines = [
            f"CreatorGuard AI verdict: {scan['verdict']} — Score {scan['score']}/10",
            "",
            scan.get("summary", ""),
            "",
            "Flagged issues:",
        ]
        for f in scan.get("flags", []):
            lines.append(f"  • {f.get('title','')}")
        lines.append("")
        lines.append("Recommended next steps:")
        for a in scan.get("actions", []):
            lines.append(f"  • {a.get('title','')}")
        lines += ["", "— Analyzed by CreatorGuard AI (claude-sonnet-4-5)"]
        return "\n".join(lines)

    @router.post("/gmail/reply/{scan_id}")
    async def gmail_reply(scan_id: str, user_id: str = Query(..., min_length=8)):
        scan = await db.gmail_scans.find_one({"id": scan_id, "user_id": user_id}, {"_id": 0})
        if not scan:
            raise HTTPException(status_code=404, detail="Scan not found.")

        creds = await _get_creds(db, user_id)
        service = build("gmail", "v1", credentials=creds, cache_discovery=False)

        # Fetch original headers to build proper reply
        original = service.users().messages().get(
            userId="me", id=scan["gmail_message_id"], format="metadata",
            metadataHeaders=["Subject", "From", "Message-ID", "References"],
        ).execute()
        headers = original.get("payload", {}).get("headers", [])
        subject = _header(headers, "Subject") or "(no subject)"
        to_addr = _header(headers, "From")
        msg_id = _header(headers, "Message-ID")
        refs = _header(headers, "References")

        body_text = _build_verdict_reply(scan)
        mime = MIMEText(body_text, "plain", "utf-8")
        mime["To"] = to_addr
        mime["Subject"] = subject if subject.lower().startswith("re:") else f"Re: {subject}"
        if msg_id:
            mime["In-Reply-To"] = msg_id
            mime["References"] = f"{refs} {msg_id}".strip() if refs else msg_id

        raw = base64.urlsafe_b64encode(mime.as_bytes()).decode("utf-8")
        try:
            service.users().messages().send(
                userId="me",
                body={"raw": raw, "threadId": scan["thread_id"]},
            ).execute()
        except HttpError as e:
            raise HTTPException(status_code=502, detail=f"Gmail send failed: {e}")

        await db.gmail_scans.update_one(
            {"id": scan_id, "user_id": user_id},
            {"$set": {"replied": True, "replied_at": datetime.now(timezone.utc).isoformat()}},
        )
        return {"ok": True}

    return router
