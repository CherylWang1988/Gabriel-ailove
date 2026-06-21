#!/bin/bash
set -e

PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ip.sb 2>/dev/null || echo "YOUR_IP")

echo "=== Gabriel Backend Restart ==="
echo "Public IP: $PUBLIC_IP"
echo ""

cd /data/Gabriel-ailove/backend

if docker compose ps 2>/dev/null | grep -q 'running'; then
  echo "[*] Restarting container..."
  docker compose restart
else
  echo "[*] First run — building..."
  docker compose up -d --build
fi

echo ""
echo "Backend:     http://$PUBLIC_IP:28474"
echo "Health API:  http://$PUBLIC_IP:28474/api/health"
