#!/bin/bash

# Start the Flask backend server

cd "$(dirname "$0")/backend"

echo "Starting Flask backend on port 5001..."
python3 api.py
