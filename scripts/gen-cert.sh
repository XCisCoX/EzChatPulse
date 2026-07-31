#!/usr/bin/env bash
# Generates a self-signed TLS certificate for local development.
# Output: certs/cert.pem + certs/key.pem (gitignored).
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p certs
if [[ -f certs/key.pem && -f certs/cert.pem ]]; then
  echo "certs already exist (certs/key.pem, certs/cert.pem). Delete them to regenerate."
  exit 0
fi

openssl req -x509 -newkey rsa:2048 -sha256 -nodes \
  -keyout certs/key.pem \
  -out certs/cert.pem \
  -days 825 \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

echo "OK: generated self-signed cert (SAN: localhost, 127.0.0.1, valid 825 days)"
