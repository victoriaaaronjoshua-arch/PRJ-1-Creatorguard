"""
Backend regression tests for CreatorGuard AI.

Covers:
- OAuth callback error/missing-params redirect hardening (no 422s)
- OAuth callback with bogus state -> 400
- OAuth login authorize_url generation (scopes + offline + consent)
- Gmail status/settings endpoints
- Analyze endpoint (Claude Sonnet 4.5) regression

Uses internal URL http://localhost:8001 for direct backend testing.
The external URL is also validated for the login endpoint (round-trip via ingress).
"""

import asyncio
import os
import re
import uuid
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

# Backend base URL — use internal for the callback redirect tests to avoid
# ingress-level rewrites that could hide backend behavior.
INTERNAL_BASE = "http://localhost:8001"
EXTERNAL_BASE = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://deal-auditor-1.preview.emergentagent.com",
).rstrip("/")


@pytest.fixture(scope="module")
def user_id() -> str:
    # >= 8 chars per Query(min_length=8)
    return f"testuser-{uuid.uuid4().hex[:8]}"


# ---------------------------------------------------------------------------
# OAuth callback hardening
# ---------------------------------------------------------------------------
class TestOAuthCallbackHardening:
    """Callback must NEVER return 422 for the paths Google can hit."""

    def test_callback_with_only_error_param_redirects(self):
        # Do NOT follow redirect so we can inspect Location
        r = httpx.get(
            f"{INTERNAL_BASE}/api/oauth/gmail/callback",
            params={"error": "access_denied"},
            follow_redirects=False,
            timeout=15,
        )
        assert r.status_code in (302, 307), (
            f"Expected redirect, got {r.status_code}: {r.text[:200]}"
        )
        loc = r.headers.get("location", "")
        assert "gmail=error" in loc, f"Location missing gmail=error: {loc}"
        assert "reason=access_denied" in loc, f"Location missing reason=access_denied: {loc}"

    def test_callback_with_no_params_redirects(self):
        r = httpx.get(
            f"{INTERNAL_BASE}/api/oauth/gmail/callback",
            follow_redirects=False,
            timeout=15,
        )
        assert r.status_code in (302, 307), (
            f"Expected redirect for no-params callback, got {r.status_code}: {r.text[:200]}"
        )
        loc = r.headers.get("location", "")
        assert "gmail=error" in loc
        assert "reason=missing_params" in loc, f"Expected missing_params reason: {loc}"

    def test_callback_with_bogus_code_and_state_returns_400(self):
        r = httpx.get(
            f"{INTERNAL_BASE}/api/oauth/gmail/callback",
            params={"code": "xxx", "state": "yyy"},
            follow_redirects=False,
            timeout=15,
        )
        # _consume_state raises HTTPException(400)
        assert r.status_code == 400, (
            f"Expected 400 for bogus state, got {r.status_code}: {r.text[:200]}"
        )
        body = r.json()
        assert "state" in (body.get("detail", "") or "").lower(), (
            f"Detail should reference state: {body}"
        )


# ---------------------------------------------------------------------------
# OAuth login — authorize URL
# ---------------------------------------------------------------------------
class TestOAuthLogin:
    def test_login_returns_authorize_url_with_scopes_and_flags(self, user_id):
        r = requests.get(
            f"{INTERNAL_BASE}/api/oauth/gmail/login",
            params={"user_id": user_id},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "authorize_url" in data, data
        url = data["authorize_url"]

        # Data assertions on URL
        assert "accounts.google.com/o/oauth2/auth" in url
        # URL-encoded scope check
        assert "gmail.readonly" in url
        assert "gmail.send" in url
        assert "gmail.labels" in url
        assert "access_type=offline" in url
        assert "prompt=consent" in url


# ---------------------------------------------------------------------------
# Gmail status + settings
# ---------------------------------------------------------------------------
class TestGmailStatusAndSettings:
    def test_status_defaults_for_fresh_user(self):
        fresh_user = f"fresh-{uuid.uuid4().hex[:10]}"
        r = requests.get(
            f"{INTERNAL_BASE}/api/gmail/status",
            params={"user_id": fresh_user},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["connected"] is False
        assert data["email"] is None
        assert data["label"] == "CreatorGuard"

    def test_settings_update_persists_label(self):
        u = f"settings-{uuid.uuid4().hex[:10]}"
        # Update label
        r = requests.post(
            f"{INTERNAL_BASE}/api/gmail/settings",
            params={"user_id": u},
            json={"label": "Custom-Label"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["label"] == "Custom-Label"
        assert data["connected"] is False

        # Verify persistence via GET
        r2 = requests.get(
            f"{INTERNAL_BASE}/api/gmail/status",
            params={"user_id": u},
            timeout=15,
        )
        assert r2.status_code == 200
        assert r2.json()["label"] == "Custom-Label"

    def test_settings_rejects_empty_label(self):
        u = f"badlabel-{uuid.uuid4().hex[:10]}"
        r = requests.post(
            f"{INTERNAL_BASE}/api/gmail/settings",
            params={"user_id": u},
            json={"label": "   "},
            timeout=15,
        )
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# Analyze endpoint regression (Claude Sonnet 4.5)
# ---------------------------------------------------------------------------
class TestAnalyzeRegression:
    def test_analyze_returns_full_verdict(self):
        pitch = (
            "Hi! I'm Jake from BrightVibe Skincare (brand@brightvibeco.com). "
            "We loved your recent content and want to send you three products for a "
            "sponsored TikTok + Instagram Reel. We'll pay $2000 via net-30 after "
            "content approval. Signed SOW attached, FTC #ad disclosure required, "
            "mutual NDA, kill fee $500 if we cancel. Please review and DocuSign."
        )
        r = requests.post(
            f"{INTERNAL_BASE}/api/analyze",
            json={"pitch_text": pitch},
            timeout=90,
        )
        assert r.status_code == 200, r.text
        data = r.json()

        # Structural assertions
        for key in (
            "id", "brand", "sender", "received_at",
            "score", "verdict", "verdict_tone", "ring_pct",
            "matrix", "summary", "flags", "actions", "model",
        ):
            assert key in data, f"missing key {key}"

        # Type / value assertions
        assert isinstance(data["score"], int)
        assert 1 <= data["score"] <= 10
        assert data["verdict_tone"] in ("safe", "warn", "danger")
        assert isinstance(data["matrix"], list) and len(data["matrix"]) == 3
        keys = {row["key"] for row in data["matrix"]}
        assert keys == {"legal", "financial", "reputation"}
        assert isinstance(data["flags"], list) and len(data["flags"]) >= 1
        assert isinstance(data["actions"], list) and len(data["actions"]) >= 1
        assert data["model"] == "claude-sonnet-4-5-20250929"
        assert isinstance(data["summary"], str) and len(data["summary"]) > 0


# ---------------------------------------------------------------------------
# PKCE fix — code_verifier persistence + callback hardening
# ---------------------------------------------------------------------------
# The fix in gmail_integration.py persists PKCE code_verifier alongside the
# OAuth state in Mongo and reattaches it on the callback Flow. It also wraps
# fetch_token in try/except so a bad code → redirect to reason=token_exchange_failed
# rather than a 500 InvalidGrantError bubbling up.

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


def _get_state_doc_sync(state: str) -> dict:
    """Blocking helper — used inside sync pytest tests."""
    async def _fetch():
        client = AsyncIOMotorClient(MONGO_URL)
        try:
            doc = await client[DB_NAME].oauth_states.find_one(
                {"state": state}, {"_id": 0}
            )
            return doc
        finally:
            client.close()
    return asyncio.get_event_loop().run_until_complete(_fetch()) if False else asyncio.new_event_loop().run_until_complete(_fetch())


def _extract_state_from_authorize_url(url: str) -> str:
    q = parse_qs(urlparse(url).query)
    return q.get("state", [""])[0]


class TestPKCECodeVerifier:
    """Verify PKCE code_verifier is generated, persisted, and reattached."""

    def test_authorize_url_contains_pkce_challenge(self):
        user_id = f"pkce-{uuid.uuid4().hex[:10]}"
        r = requests.get(
            f"{INTERNAL_BASE}/api/oauth/gmail/login",
            params={"user_id": user_id},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        url = r.json()["authorize_url"]

        q = parse_qs(urlparse(url).query)
        # PKCE assertions
        assert "code_challenge" in q, f"authorize_url missing code_challenge: {url}"
        assert q["code_challenge"][0], "code_challenge is empty"
        assert q.get("code_challenge_method", [""])[0] == "S256", (
            f"code_challenge_method should be S256, got: {q.get('code_challenge_method')}"
        )
        # code_challenge is base64url-encoded SHA-256 → ~43 chars
        assert len(q["code_challenge"][0]) >= 40, (
            f"code_challenge unexpectedly short: {q['code_challenge'][0]}"
        )

    def test_state_row_persists_code_verifier(self):
        user_id = f"pkce-{uuid.uuid4().hex[:10]}"
        r = requests.get(
            f"{INTERNAL_BASE}/api/oauth/gmail/login",
            params={"user_id": user_id},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        state = _extract_state_from_authorize_url(r.json()["authorize_url"])
        assert state, "state param not found in authorize_url"

        doc = _get_state_doc_sync(state)
        assert doc is not None, "oauth_states row not found for state"
        assert doc.get("user_id") == user_id
        cv = doc.get("code_verifier")
        assert cv is not None, "code_verifier missing on oauth_states doc"
        assert isinstance(cv, str)
        # PKCE spec: verifier is 43-128 unreserved chars
        assert 43 <= len(cv) <= 128, f"code_verifier length outside RFC7636 range: {len(cv)}"
        assert re.fullmatch(r"[A-Za-z0-9\-\._~]+", cv), (
            f"code_verifier contains disallowed characters: {cv!r}"
        )

    def test_two_logins_same_user_get_independent_verifiers(self):
        user_id = f"pkce-dup-{uuid.uuid4().hex[:10]}"

        r1 = requests.get(
            f"{INTERNAL_BASE}/api/oauth/gmail/login",
            params={"user_id": user_id}, timeout=15,
        )
        assert r1.status_code == 200
        state1 = _extract_state_from_authorize_url(r1.json()["authorize_url"])

        r2 = requests.get(
            f"{INTERNAL_BASE}/api/oauth/gmail/login",
            params={"user_id": user_id}, timeout=15,
        )
        assert r2.status_code == 200
        state2 = _extract_state_from_authorize_url(r2.json()["authorize_url"])

        assert state1 != state2, "Two logins should produce distinct states"

        doc1 = _get_state_doc_sync(state1)
        doc2 = _get_state_doc_sync(state2)
        assert doc1 and doc2, "both state docs must exist"

        cv1 = doc1.get("code_verifier")
        cv2 = doc2.get("code_verifier")
        assert cv1 and cv2, f"both verifiers must be present: {cv1!r} / {cv2!r}"
        assert cv1 != cv2, "code_verifiers must be unique per Flow instance"


class TestCallbackTokenExchangeHardening:
    """The critical bug: callback with valid state + junk code must NOT 500."""

    def test_callback_valid_state_bogus_code_redirects_not_500(self):
        # 1) Real login → gives us a real state + persisted code_verifier
        user_id = f"pkce-cb-{uuid.uuid4().hex[:10]}"
        r = requests.get(
            f"{INTERNAL_BASE}/api/oauth/gmail/login",
            params={"user_id": user_id}, timeout=15,
        )
        assert r.status_code == 200, r.text
        state = _extract_state_from_authorize_url(r.json()["authorize_url"])
        assert state

        # Sanity: verifier was stored
        doc = _get_state_doc_sync(state)
        assert doc and doc.get("code_verifier"), (
            "Pre-condition failed: code_verifier not persisted before callback test"
        )

        # 2) Hit callback with a junk code — Google would reject it, but the
        # important thing is that our backend traps the exception and redirects
        # rather than 500-ing (which was the original bug).
        cb = httpx.get(
            f"{INTERNAL_BASE}/api/oauth/gmail/callback",
            params={"code": "not-a-real-google-code-xyz", "state": state},
            follow_redirects=False,
            timeout=30,
        )
        assert cb.status_code in (302, 307), (
            f"Expected redirect after token_exchange failure, got {cb.status_code}: "
            f"{cb.text[:400]}"
        )
        loc = cb.headers.get("location", "")
        assert "gmail=error" in loc, f"Location missing gmail=error: {loc}"
        assert "reason=token_exchange_failed" in loc, (
            f"Location missing reason=token_exchange_failed: {loc}"
        )

        # 3) State should have been consumed (single-use)
        doc_after = _get_state_doc_sync(state)
        assert doc_after is None, (
            f"State should be single-use / deleted after callback, still present: {doc_after}"
        )
