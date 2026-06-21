#!/bin/bash
set -e

# Auto-detect public IP
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ip.sb 2>/dev/null || echo "YOUR_IP")

echo "=== Gabriel Mobile ==="
echo "Public IP: $PUBLIC_IP"
echo "Backend:   http://$PUBLIC_IP:28474"
echo ""

cd /data/Gabriel-ailove/mobile

# Set API URL for mobile to reach backend on public IP
export EXPO_PUBLIC_API_URL="http://$PUBLIC_IP:28474"

echo "Starting Expo with tunnel (for phone QR scan)..."
npx expo start --tunnel
