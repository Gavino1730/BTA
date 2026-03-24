#!/usr/bin/env python3
"""
Main entry point for Basketball Stats Application
"""

import sys
import os

# Add app root to Python path so `src` imports resolve consistently.
sys.path.insert(0, os.path.dirname(__file__))

from src.app import app

if __name__ == '__main__':
    port = int(os.environ.get('STATS_PORT', os.environ.get('PORT', 5000)))
    debug = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    
    app.run(host='0.0.0.0', port=port, debug=debug)
