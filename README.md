# Bharat Innovation Olympiad — Exam Platform

A secure, modular web-based exam platform with fullscreen monitoring and AI-assisted proctoring.
Built by **Lemon Ideas**.

## Architecture

| Service | Tech | Port |
|---------|------|------|
| Frontend | Next.js 16 + TypeScript | 3000 |
| Backend API | NestJS + TypeScript + Prisma | 4000 |
| Database | PostgreSQL 16 | 5432 |
| Cache | Redis 7 | 6379 |

> **Note:** AI proctoring (face detection, identity verification) runs **inline** inside the NestJS backend — no separate Python service is needed.

## Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 16 (or use Docker)

### 1. Start Database Services

```bash
docker-compose up postgres redis -d
```

### 2. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 3. Run Database Migrations (first time only)

```bash
cd backend
npx prisma migrate dev --name init
```

### 4. Start the Backend API

```bash
cd backend
npm run start:dev
```

The API server starts at **http://localhost:4000**.

### 5. Start the Frontend App

```bash
cd frontend
npm run dev
```

The web app starts at **http://localhost:3000**.

## Project Structure

```
├── frontend/           # Next.js App Router
│   ├── src/
│   │   ├── app/        # Page routes (dashboard, exams, admin, login, register, results)
│   │   ├── components/ # AuthGuard, Navbar, ThemeProvider
│   │   ├── hooks/      # useAuth, useWebcam, useDeviceCheck, etc.
│   │   ├── store/      # Zustand stores (auth, exam, proctor, theme)
│   │   └── lib/        # API client, Socket.io, constants
│   └── package.json
├── backend/            # NestJS + Prisma
│   ├── prisma/         # Database schema (13 models)
│   ├── src/
│   │   ├── auth/       # JWT auth, refresh tokens, Passport
│   │   ├── exam/       # CRUD, SEB config, analytics
│   │   ├── attempt/    # Scoring, auto-submit
│   │   ├── proctor/    # Inline AI proctoring (face detection, embeddings, risk)
│   │   ├── timer/      # WebSocket gateway, server-authoritative timer
│   │   └── common/     # Guards, decorators, interceptors
│   └── package.json
├── docker-compose.yml  # PostgreSQL + Redis
└── README.md
```

## Key Features

### Student Portal
- **Dashboard** — Overview of upcoming exams and recent results
- **Exams** — Browse available exams filtered by class band
- **Exam Player** — Timed questions with auto-save and fullscreen enforcement
- **Results** — View scores and performance breakdown

### Admin Portal
- **Dashboard** — Platform statistics at a glance
- **Exam Management** — Create exams, set duration/marks/target classes
- **Student Analytics** — View all registered students, schools, and their exam scores
- **Proctor Reports** — Review AI proctoring flags and risk scores per attempt

### Security
- **Fullscreen Monitoring** — Auto-pause on exit, tab-switch detection, violation tracking
- **Server-Authoritative Timers** — Client only displays time; server controls expiry
- **AI Proctoring** — Face detection, identity verification via cosine similarity
- **JWT + RBAC** — Access tokens (15 min) + refresh token rotation (7 days)

### Theming
- **Dark/Light Mode** — Toggle button on every page, preference persisted to localStorage

## TL;DR — Start the Project

```bash
# Terminal 1: Database
docker-compose up postgres redis -d

# Terminal 2: Backend API (http://localhost:4000)
cd backend && npm run start:dev

# Terminal 3: Frontend App (http://localhost:3000)
cd frontend && npm run dev
```

That's it! Open **http://localhost:3000** in your browser.
