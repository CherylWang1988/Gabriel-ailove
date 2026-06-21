#!/bin/bash
set -e

cd /data/Gabriel-ailove

echo "=== Git Push ==="
echo ""
echo "Changed files:"
git status --short
echo ""

read -p "Commit message (default: feat: timeline mode + sticker reply + bugfixes): " MSG
MSG=${MSG:-"feat: timeline mode + sticker reply + bugfixes"}

git add -A
git commit -m "$MSG"
git push origin master

echo ""
echo "=== Pushed to origin/master ==="
