#!/bin/bash
set -e

echo "=== Gabriel Backend Restart ==="
cd /data/Gabriel-ailove/backend

# First time: build. Afterwards: just restart (code mounted as volume)
if docker compose ps 2>/dev/null | grep -q 'running'; then
  echo "[*] Restarting container (code is volume-mounted, no rebuild needed)..."
  docker compose restart
else
  echo "[*] First run — building..."
  docker compose up -d --build
fi

echo ""
echo "Backend:     http://localhost:28473"
echo "Health API:  http://localhost:28473/api/health"
echo "Check logs:  docker compose -f /data/Gabriel-ailove/backend/docker-compose.yml logs -f"
