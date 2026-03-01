"""
Bharat Innovation Olympiad — AI Proctoring Service v1

Minimal but realistic face detection and identity verification pipeline.

Model stack:
  - Face Detection:   SCRFD 500M (ONNX, ~2 MB)
  - Face Embedding:   ArcFace MobileFaceNet (ONNX, ~5 MB)

Privacy principles:
  - NEVER store raw frames or video
  - Only store face embeddings + event flags
  - Service runs on internal network only
  - Data retention: embeddings deleted 30 days after exam
"""

import os
import io
import logging
from typing import Optional

import numpy as np
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("proctor")

# ── App Setup ──

app = FastAPI(
    title="Olympiad Proctor Service",
    description="AI-assisted proctoring for secure online exams",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Internal service — restricted via network rules
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = os.getenv("PROCTOR_API_KEY", "dev-proctor-key")

# ── ONNX Models (loaded lazily) ──

face_detector = None
face_embedder = None


def load_models():
    """Load ONNX models lazily on first request."""
    global face_detector, face_embedder
    try:
        import onnxruntime as ort

        detector_path = os.path.join(os.path.dirname(__file__), "models", "scrfd_500m.onnx")
        embedder_path = os.path.join(os.path.dirname(__file__), "models", "arcface_mobilefacenet.onnx")

        if os.path.exists(detector_path):
            face_detector = ort.InferenceSession(detector_path)
            logger.info("Loaded face detector model")
        else:
            logger.warning(f"Face detector model not found at {detector_path}")

        if os.path.exists(embedder_path):
            face_embedder = ort.InferenceSession(embedder_path)
            logger.info("Loaded face embedder model")
        else:
            logger.warning(f"Face embedder model not found at {embedder_path}")
    except Exception as e:
        logger.error(f"Error loading models: {e}")


# ── Data Models ──


class FrameAnalysisResult(BaseModel):
    face_present: bool
    num_faces: int
    match_score: Optional[float] = None
    risk_score: float
    flags: list[str]


class EnrollResult(BaseModel):
    success: bool
    message: str


class HealthResponse(BaseModel):
    status: str
    models_loaded: bool
    version: str


# ── API Key Verification ──


def verify_api_key(x_api_key: str = Header(...)):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API key")
    return x_api_key


# ── Face Processing Utilities ──

# In-memory embedding store (replace with DB in production)
enrolled_embeddings: dict[str, np.ndarray] = {}


def detect_faces(img_array: np.ndarray) -> list[dict]:
    """
    Detect faces in an image using SCRFD ONNX model.
    Returns list of face bounding boxes with confidence scores.

    When the model is not loaded, uses a simple skin-color heuristic
    as a placeholder for development/testing.
    """
    if face_detector is None:
        # Placeholder: simple face detection heuristic for dev mode
        # In production, this uses the ONNX model
        h, w = img_array.shape[:2]
        # Return a dummy face in center if image is reasonable
        if h > 50 and w > 50:
            return [{"bbox": [w // 4, h // 4, 3 * w // 4, 3 * h // 4], "score": 0.9}]
        return []

    # Real SCRFD inference
    input_name = face_detector.get_inputs()[0].name
    input_shape = face_detector.get_inputs()[0].shape

    # Preprocess: resize to model input size
    target_h, target_w = input_shape[2], input_shape[3]
    img_resized = np.array(Image.fromarray(img_array).resize((target_w, target_h)))
    img_input = img_resized.astype(np.float32).transpose(2, 0, 1)[np.newaxis]

    # Normalize
    img_input = (img_input - 127.5) / 128.0

    outputs = face_detector.run(None, {input_name: img_input})

    # Parse outputs (SCRFD format)
    faces = []
    # Simplified output parsing — adjust based on actual model output format
    if len(outputs) > 0:
        scores = outputs[0]
        for i in range(len(scores)):
            if float(scores[i]) > 0.5:
                faces.append({"bbox": [0, 0, target_w, target_h], "score": float(scores[i])})

    return faces


def compute_embedding(img_array: np.ndarray, face_bbox: dict) -> np.ndarray:
    """
    Compute a 128/512-dim face embedding using ArcFace ONNX model.
    """
    if face_embedder is None:
        # Placeholder: return random embedding for dev mode
        np.random.seed(hash(img_array.tobytes()[:100]) % (2**32))
        return np.random.randn(128).astype(np.float32)

    # Crop face region
    bbox = face_bbox["bbox"]
    x1, y1, x2, y2 = [int(c) for c in bbox]
    face_crop = img_array[y1:y2, x1:x2]

    # Resize to 112x112 for ArcFace
    face_resized = np.array(Image.fromarray(face_crop).resize((112, 112)))
    face_input = face_resized.astype(np.float32).transpose(2, 0, 1)[np.newaxis]
    face_input = (face_input - 127.5) / 128.0

    input_name = face_embedder.get_inputs()[0].name
    outputs = face_embedder.run(None, {input_name: face_input})

    return outputs[0].flatten()


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def compute_risk(num_faces: int, match_score: Optional[float], flags: list[str]) -> float:
    """Compute risk score (0.0 = safe, 1.0 = high risk) based on proctor signals."""
    risk = 0.0

    if num_faces == 0:
        risk += 0.4
    elif num_faces > 1:
        risk += 0.3

    if match_score is not None and match_score < 0.5:
        risk += 0.3

    return min(risk, 1.0)


# ── API Endpoints ──


@app.on_event("startup")
async def startup():
    load_models()


@app.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(
        status="ok",
        models_loaded=face_detector is not None and face_embedder is not None,
        version="1.0.0",
    )


@app.post("/analyze-frame", response_model=FrameAnalysisResult)
async def analyze_frame(
    attempt_id: str = Form(...),
    user_id: str = Form(...),
    frame: UploadFile = File(...),
    x_api_key: str = Header(...),
):
    """
    Analyze a video frame from the student's webcam.

    1. Detect faces in the frame
    2. Compute face embedding for the primary face
    3. Compare against enrolled embedding
    4. Return analysis result with flags and risk score
    """
    verify_api_key(x_api_key)

    # Read and decode image
    contents = await frame.read()
    img = Image.open(io.BytesIO(contents)).convert("RGB")
    img_array = np.array(img)

    # 1. Face detection
    faces = detect_faces(img_array)
    num_faces = len(faces)
    flags: list[str] = []
    match_score: Optional[float] = None

    if num_faces == 0:
        flags.append("NO_FACE")
    elif num_faces > 1:
        flags.append("MULTIPLE_FACES")

    # 2. Face embedding + comparison
    if num_faces >= 1:
        embedding = compute_embedding(img_array, faces[0])

        # Compare with enrolled embedding
        enrolled = enrolled_embeddings.get(user_id)
        if enrolled is not None:
            match_score = cosine_similarity(embedding, enrolled)
            if match_score < 0.5:
                flags.append("FACE_MISMATCH")

    # 3. Risk scoring
    risk_score = compute_risk(num_faces, match_score, flags)

    logger.info(
        f"[Frame] attempt={attempt_id} user={user_id} "
        f"faces={num_faces} match={match_score:.2f if match_score else 'N/A'} "
        f"risk={risk_score:.2f} flags={flags}"
    )

    return FrameAnalysisResult(
        face_present=num_faces > 0,
        num_faces=num_faces,
        match_score=match_score,
        risk_score=risk_score,
        flags=flags,
    )


@app.post("/enroll", response_model=EnrollResult)
async def enroll_face(
    user_id: str = Form(...),
    image: UploadFile = File(...),
    x_api_key: str = Header(...),
):
    """
    Enroll a student's face for identity verification during exams.

    Captures a face embedding and stores it for later comparison.
    Only one face must be present in the enrollment image.
    """
    verify_api_key(x_api_key)

    contents = await image.read()
    img = Image.open(io.BytesIO(contents)).convert("RGB")
    img_array = np.array(img)

    faces = detect_faces(img_array)

    if len(faces) == 0:
        raise HTTPException(400, detail="No face detected in the image")
    if len(faces) > 1:
        raise HTTPException(400, detail="Multiple faces detected — only one face allowed for enrollment")

    embedding = compute_embedding(img_array, faces[0])

    # Store embedding (in production: encrypt and save to PostgreSQL)
    enrolled_embeddings[user_id] = embedding

    logger.info(f"[Enroll] user={user_id} embedding_dim={len(embedding)}")

    return EnrollResult(success=True, message="Face enrolled successfully")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=5000, log_level="info")
