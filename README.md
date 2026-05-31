# PLMun Inventory Nexus

[![CI](https://github.com/RICKTZY22/plmun-nexus-/actions/workflows/ci.yml/badge.svg)](https://github.com/RICKTZY22/plmun-nexus-/actions/workflows/ci.yml)

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

Frontend:
- React 18, Vite, Tailwind CSS
- Zustand for client state
- Axios API clients and token refresh handling
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

## License

Coursework project. No formal license is granted.
