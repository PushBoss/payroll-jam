#!/bin/bash
echo "🧹 Clearing Vite cache..."
rm -rf node_modules/.vite
rm -rf dist
echo "✅ Cache cleared!"
echo ""
echo "Please restart your dev server:"
echo "  1. Stop current server (Ctrl+C)"
echo "  2. Run: npm run dev"
