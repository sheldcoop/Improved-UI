#!/bin/bash
# Run the Backend using the project virtual environment
# optionally set BACKEND_PORT to change port (defaults to 5001)

if [ -n "$1" ]; then
  export BACKEND_PORT=$1
fi

../venv/bin/python app.py
