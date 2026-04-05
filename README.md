# Weekly MCQ Test Platform

A local-first full-stack test-taking application with:
- React + Vite frontend
- NestJS + Prisma backend
- PostgreSQL database
- Email/password + Google OAuth auth
- Chapter-wise import, blueprint-driven tests, attempt workflow, and analytics dashboard
- HTTP-only cookie refresh token flow with frontend auto-refresh interceptor

## Project Structure
- `frontend/` React app
- `backend/` NestJS API + Prisma schema
- `docker-compose.yml` local orchestration for `frontend`, `backend`, and `postgres`

## Quick Start (Docker)
1. Run `docker compose up --build`
2. Open frontend at `http://localhost:5173`
3. Backend docs at `http://localhost:4000/docs`

## Quick Start (Without Docker)
1. Start Postgres and create DB `aviation_test`
2. Backend:
   - `cd backend`
   - copy `.env.example` to `.env` and set secrets
   - `npm install`
   - `npm run prisma:generate`
   - `npm run db:push`
   - `npm run start:dev`
3. Frontend:
   - `cd frontend`
   - copy `.env.example` to `.env`
   - `npm install`
   - `npm run dev`

## Implemented API Endpoints
- Auth:
  - `POST /auth/register`
  - `POST /auth/login`
  - `GET /auth/google`
  - `GET /auth/google/callback`
  - `POST /auth/refresh`
  - `POST /auth/logout`
- Import:
  - `POST /imports/questions:dry-run`
  - `POST /imports/questions:commit`
- Blueprints:
  - `GET /blueprints`
  - `POST /blueprints`
- Question bank:
  - `GET /question-bank/structure`
- Test engine:
  - `POST /tests/generate-from-blueprint`
- Attempts:
  - `POST /attempts/start`
  - `GET /attempts/:id`
  - `PATCH /attempts/:id/answer`
  - `POST /attempts/:id/submit`
  - `GET /attempts/:id/review`
- Analytics:
  - `GET /dashboard/overview`
  - `GET /analytics/chapters`
  - `GET /analytics/wrong-questions`

All endpoints except login/register/google/refresh/health require `Authorization: Bearer <accessToken>`.
`/auth/refresh` reads refresh token from secure HTTP-only cookie.

## Import JSON Format
```json
{
  "subject": "Physics",
  "chapter": "Kinematics",
  "questions": [
    {
      "question_text": "A body starts from rest and accelerates at 2 m/s². Speed after 5s?",
      "options": ["5 m/s", "10 m/s", "12 m/s", "2 m/s"],
      "correct_option_index": 1,
      "explanation": "v = u + at = 0 + 2*5",
      "difficulty": "EASY",
      "source_ref": "Testbook-Week-1",
      "tags": ["motion", "equations"]
    }
  ]
}
```

## Notes
- Scoring is fixed to `+1` for correct and `0` for incorrect.
- Duplicate detection uses hash of `question_text + options`.
- Re-import with content changes creates a new question version and keeps attempt history stable.
- Import supports partial failures: valid questions are imported and invalid ones are reported by index.
- Dashboard includes trend, chapter accuracy, and weak chapter identification.
- Test generation supports weighted randomness and optional weak-chapter prioritization toggle.
