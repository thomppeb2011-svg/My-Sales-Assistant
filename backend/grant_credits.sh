#!/bin/bash
# Grants tokens to an existing account by email, via the standing admin
# endpoint. Reads ADMIN_SECRET from this directory's .env — never prints it.
#
# Usage: ./grant_credits.sh <email> <tokens> [base_url]
# base_url defaults to the live site; pass http://127.0.0.1:8787 to test locally.
set -euo pipefail
cd "$(dirname "$0")"

EMAIL="${1:?Usage: grant_credits.sh <email> <tokens> [base_url]}"
TOKENS="${2:?Usage: grant_credits.sh <email> <tokens> [base_url]}"
BASE_URL="${3:-https://mysalesassistant.org}"

if [ ! -f .env ]; then
  echo "No .env file found in $(pwd)" >&2
  exit 1
fi

ADMIN_SECRET="$(grep -E '^ADMIN_SECRET=' .env | head -1 | cut -d '=' -f2-)"
if [ -z "$ADMIN_SECRET" ]; then
  echo "ADMIN_SECRET not set in .env" >&2
  exit 1
fi

curl -s -X POST "$BASE_URL/api/admin/grant-credits" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -d "{\"email\":\"$EMAIL\",\"tokens\":$TOKENS}"
echo
