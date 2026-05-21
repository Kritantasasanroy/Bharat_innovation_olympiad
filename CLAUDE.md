# Bharat Innovation Olympiad - Claude Code Configuration
This file contains development commands, coding style guidelines, and token utilization strategies for this project.
## Development Commands
### Startup & Services
* **Docker Compose (Recommended):** `docker-compose up -d`
* **Stop Docker Services:** `docker-compose down`
### Frontend (admin-frontend or frontend)
* **Install Dependencies:** `cd frontend && npm install` or `cd admin-frontend && npm install`
* **Run in Dev Mode:** `npm run dev`
* **Build App:** `npm run build`
* **Start Production App:** `npm run start`
### Backend
* **Install Dependencies:** `cd backend && npm install`
* **Run Database Migration:** `cd backend && npx prisma migrate dev`
* **Run Backend (Dev):** `npm run start:dev`
* **Build Backend:** `npm run build`
* **Start Backend (Prod):** `npm run start:prod`
### Proctor Service
* **Setup Virtualenv:** `cd proctor-service && python -m venv venv`
* **Activate (Windows):** `venv\Scripts\activate`
* **Install Dependencies:** `pip install -r requirements.txt`
* **Run Proctor Service:** `python main.py`
## Coding Style & Standards
* **Frameworks:** React, Next.js (TypeScript), Tailwind CSS (for styling), FastAPI (Python)
* **Formatting:** Prettier/ESLint default configs. Keep code files modular and fully typed.
* **Database:** Prisma ORM with PostgreSQL. Always verify models and migrations.
## Token Utilization Strategy & Custom Skill
This workspace is integrated with the `savethetokens` custom skill to optimize context window size and reduce cost.
### Activation & Guidelines
1. **Always Use the Skill:** When performing large edits, debugging sessions, or running benchmarks, refer to the custom skill:
   `savethetokens` (loaded automatically by description or invoked on demand).
2. **Session Hygiene:** Keep conversations task-scoped. Run `/clear` frequently between separate tasks to purge stale context.
3. **Compaction:** Run `/compact` manually before reaching 80% context capacity. Create a checkpoint file describing files modified and next steps before compacting.
4. **Lean Communication:** Prefer concise updates. Avoid printing massive logs or raw command outputs directly into the chat.

## Integrated Design Skills & Custom Commands
This repository has integrated top-tier design guidelines to ensure visual excellence and technical correctness in our frontends.

### Integrated Skills
1. **`frontend-design`** ([SKILL.md](file:///d:/lemon%20ideas%20work%20stuff/bharat%20Innovation%20Olympiad/.claude/skills/frontend-design/SKILL.md)): Aesthetic guidance for visual excellence. Creates premium typography, gradients, layouts, and animations, avoiding generic "AI slop" styles.
2. **`web-design-guidelines`** ([SKILL.md](file:///d:/lemon%20ideas%20work%20stuff/bharat%20Innovation%20Olympiad/.claude/skills/web-design-guidelines/SKILL.md)): Compliance checks for technical design quality (accessibility, keyboard navigation, focus states, inputs, animations, performance).

### Custom Slash Commands
You can run these commands directly inside your Claude Code session:
* **`/project:beautify <path-to-file>`**: Upgrades a component or page to a high-end, premium aesthetic.
* **`/project:design-audit <path-to-file-or-dir>`**: Audits the specified frontend files against Vercel's Web Interface Guidelines.

