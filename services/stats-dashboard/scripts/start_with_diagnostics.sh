#!/bin/bash
#
# Railway startup script with database diagnostics
# This replaces your start.sh and adds database checks
#

echo "🚂 Starting Basketball Stats App on Railway"
echo "============================================"

# Install requirements
echo "📦 Installing Python packages..."
pip install -r requirements.txt

# Run database diagnostic
echo "🔍 Running database diagnostic..."
python scripts/railway_diagnostic.py

if [ $? -ne 0 ]; then
    echo "❌ Database diagnostic failed! Check the logs above."
    echo "   Common fixes:"
    echo "   1. Ensure PostgreSQL service is running"
    echo "   2. Check DATABASE_URL format"
    echo "   3. Verify database exists"
    exit 1
fi

# Start the application
echo "🚀 Starting application..."
exec gunicorn src.app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 600 --keep-alive 5 --max-requests 1000 --max-requests-jitter 50