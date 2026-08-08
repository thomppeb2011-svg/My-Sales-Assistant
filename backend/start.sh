#!/bin/bash
set -e
cd "$(dirname "$0")"

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

exec /Library/Frameworks/Python.framework/Versions/3.14/bin/python3 -u app.py
