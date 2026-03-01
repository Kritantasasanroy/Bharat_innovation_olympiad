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
