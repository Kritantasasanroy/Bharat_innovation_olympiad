# Bharat Innovation Olympiad — Exam Platform

A secure, modular web-based exam platform with fullscreen monitoring and AI-assisted proctoring.
Built by **Lemon Ideas**.

## Project Structure

```
bharat-innovation-olympiad/
├── backend/                   # NestJS API server
│   ├── prisma/                # Prisma schema & migrations
│   │   └── schema.prisma      # Database models (User, Exam, Attempt, etc.)
│   └── src/
│       ├── auth/              # JWT authentication, login, register
│       ├── attempt/           # Exam attempt lifecycle (start, answer, submit, score)
│       ├── exam/              # Exam CRUD, sections, questions, instances
│       ├── common/            # Guards, decorators, interceptors
│       └── prisma/            # Prisma service module
│
├── frontend/                  # Next.js 14 — Student Portal (port 3000)
│   └── src/
│       ├── app/
│       │   ├── dashboard/     # Student dashboard with upcoming exams & recent results
│       │   ├── exams/         # Exam listing, instructions, and exam player
│       │   ├── results/       # Performance dashboard with radar charts & ranking
│       │   ├── login/         # Student login
│       │   └── register/      # Student registration
│       ├── components/        # Reusable UI (AuthGuard, Navbar, ThemeProvider)
│       ├── hooks/             # useExamSession hook for exam state management
│       ├── store/             # Zustand stores (auth, exam)
│       └── lib/               # API client (axios), constants
│
├── admin-frontend/            # Next.js 14 — Admin Portal (port 3001)
│   └── src/
│       ├── app/
│       │   ├── exams/         # Create, schedule, and delete exams
│       │   ├── questions/     # Manage sections & MCQ questions per exam
│       │   ├── dashboard/     # Admin overview
│       │   └── unauthorized/  # Access denied page
│       ├── components/        # AuthGuard, Navbar (admin-specific)
│       └── lib/               # API client, constants
│
├── docker-compose.yml         # PostgreSQL + Redis services
└── README.md
```

## Architecture

The Admin portal runs as a completely independent application so that students have zero code proximity to administrative features.

| Service | Tech | Port | Description |
|---------|------|------|-------------|
| **Frontend (Student)** | Next.js 14 | 3000 | Student portal — take exams, view results & rankings |
| **Admin Frontend** | Next.js 14 | 3001 | Admin portal — manage exams, questions & analytics |
| **Backend API** | NestJS | 4000 | Core logic, scoring, timers, and database access |
| **Database** | PostgreSQL 16 | 5432 | Relational data |
| **Cache** | Redis 7 | 6379 | Token blacklisting & session state |

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
cd backend

# Apply database schema
npx prisma db push

# Seed the admin account (Admin@bio123.com / Admin@bio123)
npm run seed
```

### 4. Start the Platform

Open three separate terminals:

```bash
# Terminal 1: Backend API (http://localhost:4000)
cd backend && npm run start:dev

# Terminal 2: Student App (http://localhost:3000)
cd frontend && npm run dev

# Terminal 3: Admin App (http://localhost:3001)
cd admin-frontend && npm run dev
```

## Default Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | `Admin@bio123.com` | `Admin@bio123` |

Students can self-register at `http://localhost:3000/register`.

## Key Features

### Student Portal (Port 3000)
- **Dashboard** — Overview of upcoming exams and recent results
- **Exams** — Browse available exams filtered by class band; completed exams are greyed out and locked
- **Exam Player** — Timed MCQ questions with auto-save, fullscreen enforcement, and proctoring
- **Results** — Immediate results with performance radar chart (section-wise), score ring, and global ranking out of 500

### Admin Portal (Port 3001)
- **Dashboard** — Platform statistics at a glance
- **Exam Management** — Create exams, set duration/marks/target classes, schedule instances, delete exams
- **Question Management** — Add/edit/delete sections and MCQ questions per exam
- **Analytics** — View attempt statistics per exam

### How It Works (Exam Flow)
1. **Admin** creates an exam with sections and MCQ questions
2. **Admin** schedules a test instance (start time → end time)
3. Exams automatically appear in the **Student Portal** for the matching class bands
4. **Student** starts the exam → enters fullscreen → answers MCQs → submits
5. **Results** are available **immediately** after submission — no admin release needed
6. Student sees their score, percentage, section-wise radar chart, and global rank out of 500

### Security & AI
- **Fullscreen Monitoring** — Auto-pause on exit, tab-switch detection, violation tracking
- **Server-Authoritative Timers** — Client only displays time; server controls expiry
- **Inline AI Proctoring** — Face detection, identity verification via cosine similarity
- **Physical Decoupling** — Admin and Student apps are completely separated
- **JWT + RBAC** — Access tokens (15 min) + refresh token rotation (7 days)

## Tech Stack

- **Frontend**: Next.js 14, React 18, Zustand, Recharts, Lucide Icons
- **Backend**: NestJS, Prisma ORM, PostgreSQL, Redis
- **Auth**: JWT with refresh token rotation, bcrypt password hashing
- **Proctoring**: WebRTC webcam capture with server-side face embedding comparison
