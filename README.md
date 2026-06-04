# PLMun Inventory Nexus

[![CI](https://github.com/RICKTZY22/Pamantasan-ng-muntilupa-Inventory-System-/actions/workflows/ci.yml/badge.svg)](https://github.com/RICKTZY22/Pamantasan-ng-muntilupa-Inventory-System-/actions/workflows/ci.yml)
[![Codacy Badge](https://app.codacy.com/project/badge/Grade/b2511b3b452a44fabd046165bcc7183e)](https://app.codacy.com/gh/RICKTZY22/Pamantasan-ng-muntilupa-Inventory-System-/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_grade)

A full-stack inventory, borrowing, notification, and messaging system for Pamantasan ng Lungsod ng Muntinlupa.

## Features

- Role-based access for students, faculty, staff, and admins
- Inventory items with stock tracking, return rules, QR support, and status history
- Borrow request workflow with approval, return confirmation, overdue checks, and notifications
- Admin user management, audit history, and system settings
- Real-time messaging with a read-only assistant provider option
- API schema via `drf-spectacular`

## Tech Stack

Backend:
- Django 6, Django REST Framework, SimpleJWT
- Channels/Daphne for WebSockets
- PostgreSQL in production, SQLite-friendly local development
- Redis channel layer in production when `REDIS_URL` is set
- `drf-spectacular`, `django-cors-headers`, `django-ratelimit`, WhiteNoise, Gunicorn
- Optional assistant providers through Gemini or local Ollama

Frontend:
- React 18, Vite, Tailwind CSS
- Zustand for client state
- Axios API clients and token refresh handling
- WebSocket chat client for live conversations and presence
- Phosphor Icons for interface icons
- Recharts, QR code rendering, PDF/table export helpers, and motion utilities
- Vitest for frontend tests

## Getting Started

### Backend

```bash
cd Backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

The API runs at `http://localhost:8000/api/`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The app runs at `http://localhost:5173/`.

## Environment

Use the checked-in `.env.example` files as templates:

- `Backend/.env.example`
- `frontend/.env.example`

Do not commit real `.env` files. The examples use placeholders only.

Important backend values:
- `SECRET_KEY`
- `DEBUG`
- `ALLOWED_HOSTS`
- `CORS_ORIGINS`
- `CSRF_TRUSTED_ORIGINS`
- `DATABASE_URL`
- `REDIS_URL` for production WebSockets
- `ASSISTANT_PROVIDER`, `GEMINI_API_KEY`, or local Ollama settings

Important frontend values:
- `VITE_API_URL`
- `VITE_DEMO_MODE`
- `VITE_DEMO_PASSWORD`

## Demo Data

```bash
cd Backend
python manage.py seed_demo
```

This creates demo users for local testing. Override the demo password with `DEMO_PASSWORD` in your backend environment when needed.

## Local Assistant With Ollama

The Messages assistant can run locally through Ollama, so development does not require a Gemini API key.

1. Install Ollama from `https://ollama.com/`.
2. Pull the default local model:

```bash
ollama pull qwen2.5:7b-instruct
```

3. Start Ollama:

```bash
ollama serve
```

4. In `Backend/.env`, use:

```env
ASSISTANT_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b-instruct
OLLAMA_NUM_CTX=4096
```

5. Start the backend and frontend normally.

For weaker machines, try `qwen2.5:3b-instruct`. For production, use `ASSISTANT_PROVIDER=gemini` and set `GEMINI_API_KEY` only in the hosting dashboard or local `.env`, never in source control.

## Tests

```bash
cd Backend
python manage.py test
```

```bash
cd frontend
npm run test -- --run
```

## Deployment

The repository includes `render.yaml` for Render deployments. Set production secrets and URLs in the hosting dashboard, not in source control.

Required production values include:
- Backend `SECRET_KEY`
- Backend `DATABASE_URL`
- Backend `CORS_ORIGINS`
- Frontend `VITE_API_URL`
- Optional assistant provider keys

## Acknowledgments

This system was designed and built by the project author as a capstone for
Pamantasan ng Lungsod ng Muntinlupa. The author directed all requirements,
product decisions, and review.

Portions of the codebase were developed with AI assistance from **Claude**
(Anthropic), via Claude Code, working under the author's instruction. Claude
contributed to areas including:

- the read-only Messages assistant and local Ollama / Gemini provider integration,
- the two-step borrow/return handshake and overdue + notification logic,
- real-time notifications over WebSockets,
- server-side pagination and filtering for the requests workflow,
- backend hardening (endpoint rate-limiting, image-upload validation, JWT
  HttpOnly-cookie auth) and the accompanying automated tests.

All AI-assisted work was reviewed, tested, and approved by the author.

## License

Coursework project. No formal license is granted.
