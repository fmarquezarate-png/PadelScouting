#!/usr/bin/env bash
# Lanza las cuatro suites contra un servidor local. Sale con error si alguna falla.
set -u
cd "$(dirname "$0")/.."
python3 -m http.server 8111 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 1.2
FAIL=0
for suite in qa-app qa-rival qa-carga qa-scouting qa-competicion qa-estemes qa-semestres qa-club qa-cronica qa-publico; do
  printf '%-12s ' "$suite"
  out=$(node "test/$suite.js" 2>&1); code=$?
  echo "$out" | tail -1
  if [ $code -ne 0 ]; then FAIL=1; echo "$out" | grep -A20 'FALLA'; fi
done
exit $FAIL
