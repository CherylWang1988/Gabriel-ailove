#!/bin/bash
set -e

PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ip.sb 2>/dev/null || echo "YOUR_IP")

echo "=== Gabriel Full Restart ==="
echo "Public IP: $PUBLIC_IP"
echo ""

# Backend
echo "[1/2] Restarting backend..."
cd /data/Gabriel-ailove/backend
if docker compose ps 2>/dev/null | grep -q 'running'; then
  docker compose restart
else
  docker compose up -d --build
fi
echo "  Backend: http://$PUBLIC_IP:28474"

# Mobile (Expo tunnel mode for phone access)
echo ""
echo "[2/2] Starting mobile (tunnel mode)..."
cd /data/Gabriel-ailove/mobile
export EXPO_PUBLIC_API_URL="http://$PUBLIC_IP:28474"
npx expo start --tunnel
