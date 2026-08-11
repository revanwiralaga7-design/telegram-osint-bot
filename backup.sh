#!/bin/bash
# ================================================
# OSINT Bot - Backup Script
# Upload DB ke GitHub Release + Google Drive
# ================================================

echo "🔍 OSINT Bot Database Backup"
echo "============================"
echo ""

# Check DB exists
if [ ! -f osint.db ]; then
    echo "❌ osint.db not found!"
    exit 1
fi

DB_SIZE=$(du -h osint.db | cut -f1)
echo "📦 Database: osint.db ($DB_SIZE)"
echo ""

# ================================================
# STEP 1: Compress
# ================================================
echo "[1/3] Compressing database..."
gzip -k -1 osint.db
GZ_SIZE=$(du -h osint.db.gz | cut -f1)
echo "  ✅ osint.db.gz ($GZ_SIZE)"
echo ""

# ================================================
# STEP 2: Upload to GitHub Release
# ================================================
echo "[2/3] Uploading to GitHub Release..."
echo "  Enter GitHub token (or press Enter to skip):"
read -s GH_TOKEN
echo ""

if [ ! -z "$GH_TOKEN" ]; then
    REPO="revanwiralaga7-design/telegram-osint-bot"
    TAG="db-backup-$(date +%Y%m%d)"
    
    # Create release
    echo "  Creating release $TAG..."
    RELEASE=$(curl -s -X POST \
        -H "Authorization: token $GH_TOKEN" \
        -H "Content-Type: application/json" \
        "https://api.github.com/repos/$REPO/releases" \
        -d "{
            \"tag_name\": \"$TAG\",
            \"name\": \"DB Backup $(date +%Y-%m-%d)\",
            \"body\": \"OSINT Database backup - $(date +%Y-%m-%d). Records: ~5M. Size: $GZ_SIZE compressed.\",
            \"draft\": false,
            \"prerelease\": false
        }")
    
    UPLOAD_URL=$(echo "$RELEASE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('upload_url','').split('{')[0])" 2>/dev/null)
    
    if [ ! -z "$UPLOAD_URL" ]; then
        echo "  Uploading osint.db.gz..."
        curl -X POST \
            -H "Authorization: token $GH_TOKEN" \
            -H "Content-Type: application/gzip" \
            "$UPLOAD_URL?name=osint.db.gz&label=OSINT+Database+Backup" \
            -T osint.db.gz \
            --progress-bar
        
        echo ""
        echo "  ✅ Uploaded to GitHub Release: $TAG"
    else
        echo "  ❌ Failed to create release"
        echo "  Response: $RELEASE"
    fi
else
    echo "  ⏭️  Skipped GitHub upload"
fi
echo ""

# ================================================
# STEP 3: Upload to Google Drive (via gupload/rclone)
# ================================================
echo "[3/3] Google Drive Upload"
echo ""

# Check if rclone is installed
if command -v rclone &> /dev/null; then
    echo "  rclone detected!"
    echo "  Uploading to Google Drive..."
    rclone copy osint.db.gz remote:OSINT-Backup/ --progress
    echo "  ✅ Uploaded to Google Drive via rclone"
elif command -v gupload &> /dev/null; then
    echo "  gupload detected!"
    gupload osint.db.gz "OSINT-Backup"
    echo "  ✅ Uploaded to Google Drive via gupload"
else
    echo "  No Google Drive CLI tool found."
    echo "  Install one of these:"
    echo ""
    echo "  Option A - rclone (recommended):"
    echo "    curl https://rclone.org/install.sh | sudo bash"
    echo "    rclone config  # then follow setup for Google Drive"
    echo "    rclone copy osint.db.gz remote:OSINT-Backup/"
    echo ""
    echo "  Option B - gdrive:"
    echo "    # Download from https://github.com/prasmussen/gdrive/releases"
    echo "    # Then: gdrive upload osint.db.gz"
    echo ""
    echo "  Option C - Manual:"
    echo "    # Download from VPS to your PC, then upload to Google Drive manually"
    echo "    scp Justice@sakura.proxy.rlwy.net:~/telegram-osint-bot/osint.db.gz ."
fi

echo ""
echo "============================"
echo "🎯 Backup Summary"
echo "  File: osint.db.gz ($GZ_SIZE)"
echo "  GitHub: ${TAG:-skipped}"
echo "============================"

# Cleanup
echo ""
echo "Delete compressed file? (y/N):"
read DEL
if [ "$DEL" = "y" ] || [ "$DEL" = "Y" ]; then
    rm -f osint.db.gz
    echo "  ✅ Cleaned up"
fi
