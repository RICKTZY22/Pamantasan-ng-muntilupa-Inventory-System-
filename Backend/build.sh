#!/usr/bin/env bash
# Render build script — runs on every deploy
set -o errexit

echo "==> Installing Python dependencies..."
pip install -r requirements.txt

echo "==> Collecting static files..."
python manage.py collectstatic --noinput

echo "==> Running migrations..."
python manage.py migrate

echo "==> Seeding admin account..."
python manage.py seed_admin

echo "==> Build complete!"
