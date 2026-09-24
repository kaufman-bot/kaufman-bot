#!/usr/bin/env bash
set -e

echo "▶ Stopping PM2 processes..."
npx -y pm2 delete all

echo "▶ Stopping infrastructure (Docker)..."
docker compose down

echo "✅ Done — dev environment stopped"
