"""
Bharat Innovation Olympiad — Proctoring Bridge Service v2

Integrates with Meazure Learning / ProctorU automated proctoring platform.

Flow:
  1. NestJS backend calls POST /sessions/create when a student starts exam
  2. This service creates a session via Meazure API → returns launch_url
  3. Student opens launch_url in the Meazure Guardian browser / extension
  4. Meazure monitors the student's entire exam session (webcam, screen, audio)
  5. Meazure posts webhook events to POST /webhook on this service
  6. This service validates the HMAC signature → forwards to NestJS callback
  7. NestJS stores the event as a ProctorEvent row and updates attempt risk score

Environment variables required (see .env.example):
  MEAZURE_API_KEY            — from Meazure dashboard → Settings → API
  MEAZURE_BASE_URL           — Meazure REST API base (default v2 endpoint)
  MEAZURE_WEBHOOK_SECRET     — from Meazure dashboard → Settings → Webhooks
  NESTJS_CALLBACK_URL        — NestJS backend URL this service forwards events to
  NESTJS_CALLBACK_KEY        — shared secret used when calling NestJS callback
  PROCTOR_API_KEY            — key NestJS uses when calling this service
"""

import hashlib
import hmac
import json
import logging
import os
from typing import Optional

import httpx
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("proctor-bridge")

# ── Load .env (dev convenience) ──
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ── App Setup ──

app = FastAPI(
    title="BIO Proctoring Bridge",
    description="Meazure Learning / ProctorU integration bridge for Bharat Innovation Olympiad",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restricted via network rules; only backend + Meazure call this
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Config ──

PROCTOR_API_KEY = os.getenv("PROCTOR_API_KEY", "dev-proctor-key")
MEAZURE_API_KEY = os.getenv("MEAZURE_API_KEY", "")
MEAZURE_BASE_URL = os.getenv("MEAZURE_BASE_URL", "https://api.meazurelearning.com/api/v2")
MEAZURE_WEBHOOK_SECRET = os.getenv("MEAZURE_WEBHOOK_SECRET", "")
NESTJS_CALLBACK_URL = os.getenv("NESTJS_CALLBACK_URL", "http://localhost:4000")
NESTJS_CALLBACK_KEY = os.getenv("NESTJS_CALLBACK_KEY", "dev-proctor-key")

# ── Pydantic Models ──


class CreateSessionRequest(BaseModel):
    attempt_id: str
    user_id: str
    exam_title: str
    duration_minutes: int
    student_name: str
    student_email: str
    start_time: Optional[str] = None  # ISO 8601 — if omitted Meazure treats as "now"


class SessionResponse(BaseModel):
    session_id: str
    launch_url: str
    status: str


class SessionStatusResponse(BaseModel):
    session_id: str
    launch_url: str
    status: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    meazure_configured: bool
    version: str


# ── Internal Auth ──


def verify_api_key(x_api_key: str = Header(...)):
    """Validates that the caller (NestJS backend) presents the shared API key."""
    if x_api_key != PROCTOR_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API key")
    return x_api_key


# ── Meazure API Client ──


async def call_meazure(method: str, path: str, payload: Optional[dict] = None) -> dict:
    """
    Make an authenticated request to the Meazure Learning REST API.

    When MEAZURE_API_KEY is not set (dev/CI mode), returns a realistic mock
    response so the rest of the system can be tested end-to-end without
    real Meazure credentials.
    """
    if not MEAZURE_API_KEY:
        logger.warning("MEAZURE_API_KEY not configured — returning dev-mode mock session")
        attempt_id = (payload or {}).get("exam", {}).get("external_id", "dev")
        return {
            "id": f"dev-session-{attempt_id}",
            "status": "SCHEDULED",
            "launch_url": (
                f"https://guardian.meazurelearning.com/launch"
                f"?dev=true&session_id=dev-session-{attempt_id}"
            ),
            "started_at": None,
            "completed_at": None,
        }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.request(
            method=method,
            url=f"{MEAZURE_BASE_URL}{path}",
            headers={
                "Authorization": f"Bearer {MEAZURE_API_KEY}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            json=payload,
        )

    if resp.status_code >= 400:
        logger.error(f"Meazure API {method} {path} → {resp.status_code}: {resp.text}")
        raise HTTPException(
            status_code=502,
            detail=f"Meazure API returned {resp.status_code}",
        )

    return resp.json()


# ── Webhook Forwarding ──


async def forward_event_to_nestjs(attempt_id: str, event_type: str, details: dict) -> None:
    """
    Forward a validated Meazure event to the NestJS backend's internal endpoint.
    NestJS stores it as a ProctorEvent row and recalculates the attempt risk score.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"{NESTJS_CALLBACK_URL}/proctor/meazure-event",
                json={"attemptId": attempt_id, "type": event_type, "details": details},
                headers={"x-api-key": NESTJS_CALLBACK_KEY},
            )
        logger.info(f"[Webhook→NestJS] attempt={attempt_id} type={event_type}")
    except Exception as err:
        logger.error(f"[Webhook→NestJS] Failed to forward event: {err}")


# ── Event Type Mapping ──
#
# Meazure incident types (data.incident.type) → our ProctorEventType enum values.
# Add additional mappings here as you discover new Meazure incident types.

MEAZURE_INCIDENT_MAP: dict[str, str] = {
    "no_face_detected":              "NO_FACE",
    "face_not_visible":              "NO_FACE",
    "multiple_people":               "MULTIPLE_FACES",
    "multiple_faces":                "MULTIPLE_FACES",
    "face_mismatch":                 "FACE_MISMATCH",
    "identity_verification_failed":  "FACE_MISMATCH",
    "screen_share":                  "SCREEN_CAPTURE",
    "screen_recording":              "SCREEN_CAPTURE",
    "virtual_machine":               "SCREEN_CAPTURE",
    "network_disconnected":          "NETWORK_DISCONNECT",
    "unusual_eye_movement":          "FACE_MISMATCH",
    "looking_away":                  "NO_FACE",
}


# ── API Endpoints ──


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Liveness probe — also signals whether Meazure credentials are configured."""
    return HealthResponse(
        status="ok",
        meazure_configured=bool(MEAZURE_API_KEY),
        version="2.0.0",
    )


@app.post("/sessions/create", response_model=SessionResponse)
async def create_session(body: CreateSessionRequest, x_api_key: str = Header(...)):
    """
    Create a Meazure Learning proctoring session for one student exam attempt.

    Called by NestJS immediately after startAttempt() creates the Attempt row.
    Returns a launch_url the student must open in the Meazure Guardian browser.

    Meazure API reference:
      POST {MEAZURE_BASE_URL}/exam-sessions
      Docs: https://docs.meazurelearning.com/api/exam-sessions
    """
    verify_api_key(x_api_key)

    name_parts = body.student_name.strip().split(" ", 1)
    first_name = name_parts[0]
    last_name = name_parts[1] if len(name_parts) > 1 else ""

    meazure_payload = {
        "student": {
            "external_id": body.user_id,
            "first_name": first_name,
            "last_name": last_name,
            "email": body.student_email,
        },
        "exam": {
            "external_id": body.attempt_id,
            "title": body.exam_title,
            "duration": body.duration_minutes,
            "time_limit_enforced": True,
        },
        **({"start_time": body.start_time} if body.start_time else {}),
    }

    result = await call_meazure("POST", "/exam-sessions", meazure_payload)

    logger.info(
        f"[Session Created] attempt={body.attempt_id} user={body.user_id} "
        f"session={result['id']} status={result['status']}"
    )

    return SessionResponse(
        session_id=result["id"],
        launch_url=result["launch_url"],
        status=result["status"],
    )


@app.get("/sessions/{session_id}", response_model=SessionStatusResponse)
async def get_session(session_id: str, x_api_key: str = Header(...)):
    """
    Poll the current status of a Meazure proctoring session.

    Meazure API reference:
      GET {MEAZURE_BASE_URL}/exam-sessions/{session_id}
    """
    verify_api_key(x_api_key)

    result = await call_meazure("GET", f"/exam-sessions/{session_id}")

    return SessionStatusResponse(
        session_id=result["id"],
        launch_url=result.get("launch_url", ""),
        status=result["status"],
        started_at=result.get("started_at"),
        completed_at=result.get("completed_at"),
    )


@app.post("/webhook")
async def meazure_webhook(request: Request):
    """
    Receive and validate Meazure event webhooks.

    Meazure signs the raw request body with HMAC-SHA256 using the configured
    webhook secret. The signature is sent in the X-Meazure-Signature header
    as `sha256=<hex_digest>`.

    Configure the webhook URL in Meazure dashboard:
      → Settings → Webhooks → Add Endpoint → {this_service_url}/webhook

    Meazure event types handled:
      incident.detected   → maps incident type → our ProctorEventType
      session.terminated  → signals premature session end
      session.started / session.completed → logged, no ProctorEvent stored
    """
    raw_body = await request.body()

    # Validate Meazure HMAC signature (skip in dev if secret not configured)
    if MEAZURE_WEBHOOK_SECRET:
        signature_header = request.headers.get("x-meazure-signature", "")
        if not signature_header.startswith("sha256="):
            logger.warning("[Webhook] Missing or malformed X-Meazure-Signature header")
            raise HTTPException(status_code=400, detail="Missing signature header")

        expected_sig = "sha256=" + hmac.new(
            MEAZURE_WEBHOOK_SECRET.encode("utf-8"),
            raw_body,
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(expected_sig, signature_header):
            logger.warning("[Webhook] HMAC signature mismatch — possible spoofed request")
            raise HTTPException(status_code=403, detail="Webhook signature mismatch")

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    event_type: str = payload.get("event", "")
    data: dict = payload.get("data", {})

    # attempt_id is stored as exam.external_id when we create the session
    attempt_id: str = data.get("exam", {}).get("external_id", "")

    logger.info(f"[Webhook] event={event_type} attempt={attempt_id}")

    if event_type == "incident.detected" and attempt_id:
        incident = data.get("incident", {})
        incident_type = incident.get("type", "").lower()
        our_type = MEAZURE_INCIDENT_MAP.get(incident_type, "FACE_MISMATCH")

        await forward_event_to_nestjs(attempt_id, our_type, {
            "meazure_event": event_type,
            "incident_type": incident_type,
            "session_id": data.get("session_id", ""),
            "severity": incident.get("severity", "medium"),
            "description": incident.get("description", ""),
        })

    elif event_type == "session.terminated" and attempt_id:
        await forward_event_to_nestjs(attempt_id, "NETWORK_DISCONNECT", {
            "meazure_event": event_type,
            "reason": data.get("reason", "session_terminated"),
            "session_id": data.get("session_id", ""),
        })

    # session.started / session.completed are logged but no ProctorEvent stored
    return {"received": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000, log_level="info")
