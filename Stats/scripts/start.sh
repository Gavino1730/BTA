#!/bin/bash
pip install -r requirements.txt
gunicorn src.app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 600 --keep-alive 5 --max-requests 1000 --max-requests-jitter 50
