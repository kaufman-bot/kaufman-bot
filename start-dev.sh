#!/usr/bin/env bash
set -e

# Ensure .env exists
if [ ! -f ./backend/.env ]; then
  echo "▶ Creating backend/.env from .env.example..."
  cp ./backend/.env.example ./backend/.env
fi

echo "▶ Starting infrastructure (Docker)..."
docker compose up -d

# Wait for PostgreSQL health check to pass
echo "Waiting for PostgreSQL to be healthy..."
while [ "$(docker inspect --format='{{json .State.Health}}' kaufman-bot-db 2>/dev/null | grep -o '"Status":"healthy"')" != '"Status":"healthy"' ]; do
  sleep 2
done
echo "PostgreSQL is healthy"

# Wait for MinIO health check to pass
echo "Waiting for MinIO to be healthy..."
while [ "$(docker inspect --format='{{json .State.Health}}' kaufman-bot-minio 2>/dev/null | grep -o '"Status":"healthy"')" != '"Status":"healthy"' ]; do
  sleep 2
done
echo "MinIO is healthy"

echo "▶ Running Prisma migrations..."
cd ./backend
npx prisma migrate deploy
cd ..

echo "▶ Starting dev services via PM2..."
npx -y pm2 start ./ecosystem.config.cjs
echo "✅ Done — dev environment is running"
echo "   Backend:  http://localhost:3000"
echo "   Frontend: http://localhost:4200"
