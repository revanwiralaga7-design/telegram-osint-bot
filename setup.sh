#!/bin/bash
# ================================================
# 🔍 OSINT Bot - Setup Script
# ================================================

echo "🚀 Setting up OSINT Bot..."

# Step 1: Install dependencies
echo ""
echo "📦 [1/3] Installing dependencies..."
npm install

# Step 2: Download database
echo ""
echo "📥 [2/3] Downloading database (297 MB)..."
echo ""
echo "Masukkan GitHub Personal Access Token kamu:"
echo "(Buat di: https://github.com/settings/tokens → Generate new token (classic) → centang: repo)"
read -s -p "Token: " GH_TOKEN
echo ""

# Use GitHub API endpoint for private repo assets (not browser URL!)
ASSET_URL="https://api.github.com/repos/revanwiralaga7-design/telegram-osint-bot/releases/assets/506908094"

echo "⬇️  Downloading..."
curl -L \
  -H "Authorization: token $GH_TOKEN" \
  -H "Accept: application/octet-stream" \
  -o osint.db.gz \
  "$ASSET_URL" \
  --progress-bar

# Verify download
FILE_SIZE=$(stat -c%s "osint.db.gz" 2>/dev/null || stat -f%z "osint.db.gz" 2>/dev/null)
echo ""

if [ "$FILE_SIZE" -lt 1000000 ] 2>/dev/null; then
  echo "❌ Download gagal! File hanya ${FILE_SIZE} bytes."
  echo "Isi file:"
  cat osint.db.gz
  echo ""
  echo ""
  echo "Kemungkinan penyebab:"
  echo "  1. Token salah/expired"
  echo "  2. Token tidak punya scope 'repo'"
  echo "  3. Belum punya akses ke repo (private)"
  rm -f osint.db.gz
  exit 1
fi

echo "✅ Downloaded: $(du -h osint.db.gz | cut -f1)"

# Step 3: Extract database
echo ""
echo "📂 [3/3] Extracting database..."
gunzip -f osint.db.gz

if [ -f osint.db ]; then
  echo "✅ Database berhasil di-extract!"
  echo "📊 Size: $(du -h osint.db | cut -f1)"
else
  echo "❌ Extract gagal!"
  exit 1
fi

# Done!
echo ""
echo "========================================"
echo "✅ Setup selesai!"
echo ""
echo "Jalankan bot:"
echo "  export BOT_TOKEN=\"token_telegram_baru_kamu\""
echo "  node bot.js"
echo "========================================"
