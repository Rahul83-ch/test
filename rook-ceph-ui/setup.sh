#!/bin/bash
set -e

echo "=================================="
echo "Rook-Ceph UI Quick Setup"
echo "=================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    echo "Download from: https://nodejs.org/"
    exit 1
fi

echo "✓ Node.js is installed: $(node -v)"
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed."
    exit 1
fi

echo "✓ npm is installed: $(npm -v)"
echo ""

# Install dependencies
echo "Installing dependencies..."
npm install

echo ""
echo "=================================="
echo "✓ Setup Complete!"
echo "=================================="
echo ""
echo "To start the UI server, run:"
echo "  npm start"
echo ""
echo "The UI will be available at:"
echo "  http://localhost:3001"
echo ""
echo "Make sure the backend API is running on:"
echo "  http://localhost:3000"
echo ""
echo "=================================="
