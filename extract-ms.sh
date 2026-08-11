#!/bin/bash
# Extract only specific files from the Microsoft archive
# Don't extract all 130GB - only what we need!

echo "=== Smart Microsoft Data Extraction ==="
echo ""

# Check disk space
AVAIL=$(df -h . | tail -1 | awk '{print $4}')
echo "Available disk space: $AVAIL"
echo ""

# Check if archive exists
if [ ! -f microsoft_exfilsquad.7z ]; then
    echo "❌ microsoft_exfilsquad.7z not found!"
    exit 1
fi

# Show file sizes
echo "Files to extract:"
echo "  1. leads.jsonl (isvsuccess)     - ~1.2GB uncompressed (LEADS data)"
echo "  2. systemusers.jsonl (mashppe)  - ~2.7GB uncompressed (USER data)"
echo "  3. contacts.jsonl (facility)    - ~25GB uncompressed (CONTACTS data)"
echo ""
echo "SKIP:"
echo "  - incidents.jsonl (40GB - not useful for OSINT)"
echo "  - contacts.jsonl (fasttrack, 70GB - too large)"
echo ""

echo "Extract leads.jsonl (1.2GB)..."
7z x microsoft_exfilsquad.7z "microsoft_exfilsquad/isvsuccess/leads.jsonl" -aoa 2>&1 | tail -3

echo ""
echo "Extract systemusers.jsonl (2.7GB)..."
7z x microsoft_exfilsquad.7z "microsoft_exfilsquad/mashppe/systemusers.jsonl" -aoa 2>&1 | tail -3

echo ""
echo "Extract contacts.jsonl (25GB - this takes a while)..."
7z x microsoft_exfilsquad.7z "microsoft_exfilsquad/facility management/contacts.jsonl" -aoa 2>&1 | tail -3

echo ""
echo "=== Extraction Complete ==="
echo ""
du -sh microsoft_exfilsquad/*/
echo ""
echo "Now run: node import-microsoft.js"
