# Bharat Innovation Olympiad — Exam Platform

A secure, modular web-based exam platform with fullscreen monitoring and AI-assisted proctoring.
Built by **Lemon Ideas**.

## Architecture

The platform has been modernized for maximum security and separation of concerns. The Admin portal runs as a completely independent application so that students have zero code proximity to administrative features.

| Service | Tech | Port | Description |
|---------|------|------|-------------|
| **Frontend (Student)** | Next.js 14 | 3000 | The student portal for taking exams and viewing results. |
| **Admin Frontend** | Next.js 14 | 3001 | The dedicated portal for managing tests and viewing analytics. |
| **Backend API** | NestJS | 4000 | Core logic, timers, inline AI proctoring, and database access. |
| **Database** | PostgreSQL 16 | 5432 | Relational data. |
| **Cache** | Redis 7 | 6379 | Token blacklisting & session state. |

> **Note:** AI proctoring (face detection, identity verification) runs **inline** inside the NestJS backend — no separate Python service is needed.

## Quick Start
### 1. Start Database Services

```bash
docker-compose up postgres redis -d
```

### 2. Install Dependencies

```bash
# Backend
cd backend && npm install

# Student Frontend
cd ../frontend && npm install

# Admin Frontend
cd ../admin-frontend && npm install
```

### 3. Initialize Database and Seed Admin

```bash
# Apply database schema
cd backend
npx prisma db push

# Seed the admin account
npm run seed
```

### 4. Start the Platform

```bash
# Terminal 1: Backend API (http://localhost:4000)
cd backend && npm run start:dev

# Terminal 2: Student App (http://localhost:3000)
cd frontend && npm run dev

# Terminal 3: Admin App (http://localhost:3001)
cd admin-frontend && npm run dev
```

## Key Features

### Student Portal (Port 3000)
- **Dashboard** — Overview of upcoming exams and recent results
- **Exams** — Browse available exams filtered by class band
- **Exam Player** — Timed questions with auto-save and fullscreen enforcement
- **Results** — View scores and performance breakdown

### Admin Portal (Port 3001)
- **Dashboard** — Platform statistics at a glance
- **Exam Management** — Create exams, set duration/marks/target classes
- **Student Analytics** — View all registered students, schools, and their exam scores
- **Proctor Reports** — Review AI proctoring flags and risk scores per attempt

### Security & AI
- **Fullscreen Monitoring** — Auto-pause on exit, tab-switch detection, violation tracking
- **Server-Authoritative Timers** — Client only displays time; server controls expiry
- **Inline AI Proctoring** — Face detection, identity verification via cosine similarity running safely inside NestJS middleware.
- **Physical Decoupling** — Admin Next.js app is totally separated from Student Next.js app to prevent any vulnerability chaining.
- **JWT + RBAC** — Access tokens (15 min) + refresh token rotation (7 days)
