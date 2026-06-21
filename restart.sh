#!/bin/bash
set -e

echo "=== Gabriel Restart ==="

# 1. Backend
echo "[1/2] Rebuilding & restarting backend..."
cd /data/Gabriel-ailove/backend
docker compose down
docker compose up -d --build
echo "  Backend: http://localhost:28473"
echo "  Health:   http://localhost:28473/api/health"

# 2. Mobile (Expo Web)
echo ""
echo "[2/2] Starting mobile (Expo Web)..."
cd /data/Gabriel-ailove/mobile
npx expo start --web

echo ""
echo "=== All services started ==="
