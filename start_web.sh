#!/bin/bash
set -e

echo "=== Gabriel Mobile (Web) ==="
cd /data/Gabriel-ailove/mobile

echo "Installing dependencies (if needed)..."
npm install --silent 2>/dev/null || npm install

echo ""
echo "Starting Expo Web..."
echo "API: ${EXPO_PUBLIC_API_URL:-http://localhost:28473}"
echo ""
npx expo start --web
