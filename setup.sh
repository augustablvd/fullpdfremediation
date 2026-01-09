#!/bin/bash

# PDF Accessibility Tagger - Setup Script

echo "Setting up PDF Accessibility Tagger..."

# Check Python version
python_version=$(python3 --version 2>&1 | grep -oP '(?<=Python )\d+\.\d+')
required_version="3.8"

if (( $(echo "$python_version < $required_version" | bc -l) )); then
    echo "Error: Python 3.8 or higher is required. Current version: $python_version"
    exit 1
fi

echo "✓ Python version: $python_version"

# Create virtual environment
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
    echo "✓ Virtual environment created"
else
    echo "✓ Virtual environment already exists"
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip

# Install requirements
echo "Installing dependencies..."
pip install -r requirements.txt

echo ""
echo "✓ Setup complete!"
echo ""
echo "To start the application:"
echo "  1. source venv/bin/activate"
echo "  2. python app.py"
echo ""
echo "Or simply run: ./run.sh"
