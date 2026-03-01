# Bharat Innovation Olympiad — Exam Platform

A secure, modular web-based exam platform with Safe Exam Browser (SEB) integration and AI-assisted proctoring.

## Architecture

| Service | Tech | Port |
|---------|------|------|
| Frontend | Next.js 14 + TypeScript | 3000 |
| Backend API | NestJS + TypeScript + Prisma | 4000 |
| Proctor Service | Python FastAPI + ONNX Runtime | 5000 |
| Database | PostgreSQL 16 | 5432 |
| Cache | Redis 7 | 6379 |

## Quick Start

### Prerequisites
- Node.js 20+
- Python 3.11+
- Docker & Docker Compose
- PostgreSQL 16 (or use Docker)

### Development (Docker)

```bash
docker-compose up -d
```

### Development (Local)

```bash
# Backend
cd backend
npm install
npx prisma migrate dev
npm run start:dev

# Frontend
cd frontend
npm install
npm run dev

# Proctor Service
cd proctor-service
python -m venv venv
venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 5000
```

## Project Structure

```
├── frontend/           # Next.js 14 App Router
├── backend/            # NestJS + Prisma
├── proctor-service/    # Python FastAPI
├── docker-compose.yml
└── README.md
```

Innovation Olympiad Platform — Build Walkthrough
What Was Built
A complete project scaffold for a secure, modular web-based exam platform spanning 3 services and 50+ source files.

Project Structure
bharat-innovation-olympiad/
├── frontend/                    # Next.js 14 + TypeScript
│   ├── src/
│   │   ├── app/                 # 8 page routes
│   │   ├── components/          # AuthGuard, Navbar
│   │   ├── hooks/               # 7 custom hooks
│   │   ├── store/               # 3 Zustand stores
│   │   ├── lib/                 # API client, Socket.io, constants
│   │   └── types/               # 3 type definition files
│   ├── Dockerfile
│   └── package.json
├── backend/                     # NestJS + TypeScript + Prisma
│   ├── prisma/schema.prisma     # 13 database models
│   ├── src/
│   │   ├── auth/                # JWT auth, refresh tokens, Passport
│   │   ├── user/                # Profile, face embedding storage
│   │   ├── exam/                # CRUD, SEB config, analytics
│   │   ├── attempt/             # Scoring strategies, auto-submit
│   │   ├── proctor/             # Frame analysis, events, risk
│   │   ├── timer/               # WebSocket gateway, server timer
│   │   ├── common/              # Guards, decorators, interceptors
│   │   └── prisma/              # Prisma module/service
│   ├── Dockerfile
│   └── package.json
├── proctor-service/             # Python FastAPI + ONNX
│   ├── main.py                  # Face detection + embedding pipeline
│   ├── requirements.txt
│   └── Dockerfile
├── docker-compose.yml           # PostgreSQL + Redis + all services
├── README.md
└── .gitignore
Key Security Features Implemented
SEB Integration
SEB Guard (
seb.guard.ts
) validates X-SafeExamBrowser-RequestHash and X-SafeExamBrowser-ConfigKeyHash headers using SHA256 hash of URL + stored key
SEB Config Service (
seb-config.service.ts
) generates .seb-compatible JSON configs with URL filtering, quit URL, and security restrictions
Client-side SEB hook (
useSebHeaders.ts
) uses the SEB JavaScript API for Browser Exam Key retrieval
Server-Authoritative Timers
Timer Service (
timer.service.ts
) computes remaining time from server-side start timestamp
WebSocket Gateway (
timer.gateway.ts
) pushes timer ticks every second and auto-submits on expiry
Client only displays server time — never trusted for calculations
RBAC & Auth
JWT access tokens (15 min) + refresh token rotation (7 days)
@Roles() decorator + 
RolesGuard
 on all admin endpoints
bcrypt password hashing with 12 salt rounds
AI Proctoring
Python service with SCRFD face detection + ArcFace embedding
Cosine similarity matching against enrolled face
Dev-mode fallbacks when ONNX models aren't loaded
Privacy-first: only embeddings + flags stored, never raw video
Next Steps to Run
bash
# 1. Copy environment files
cd backend && copy .env.example .env
# 2. Install dependencies
cd frontend && npm install
cd ../backend && npm install
# 3. Start database (requires Docker)
docker-compose up postgres redis -d
# 4. Run database migrations
cd backend && npx prisma migrate dev --name init
# 5. Start backend
cd backend && npm run start:dev
# 6. Start frontend
cd frontend && npm run dev
# 7. Start proctor service (optional)
cd proctor-service
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python main.py
TIP

For SEB testing, download Safe Exam Browser and use the SEB Config Tool to import the JSON config from /api/seb/config/:instanceId.
