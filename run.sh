#!/bin/bash

# PDF Accessibility Tagger - Run Script

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Virtual environment not found. Running setup..."
    ./setup.sh
fi

# Activate virtual environment
source venv/bin/activate

# Start the application
echo "Starting PDF Accessibility Tagger..."
echo "Access the application at: http://localhost:5000"
echo ""
python app.py
