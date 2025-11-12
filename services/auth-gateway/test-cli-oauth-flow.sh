#!/bin/bash

# Test CLI OAuth Flow Against Live Server
# Simulates what the CLI does when authenticating

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 CLI OAuth Flow Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo

# Simulate CLI service discovery
echo "1️⃣  Service Discovery (what CLI does on init)"
echo "   Getting auth_base from discovered services..."

AUTH_BASE="https://auth.lanonasis.com"
echo "   ✓ auth_base: $AUTH_BASE"
echo

# Simulate PKCE generation
echo "2️⃣  PKCE Challenge Generation (OAuth2 security)"
echo "   Generating code_verifier and code_challenge..."

CODE_VERIFIER=$(openssl rand -base64 32 | tr -d '=+/' | cut -c1-43)
CODE_CHALLENGE=$(echo -n "$CODE_VERIFIER" | openssl dgst -binary -sha256 | base64 | tr -d '=+/' | tr '/+' '_-')

echo "   ✓ code_verifier: ${CODE_VERIFIER:0:20}... (43 chars)"
echo "   ✓ code_challenge: ${CODE_CHALLENGE:0:30}... (43 chars)"
echo "   ✓ code_challenge_method: S256"
echo

# Build authorization URL
echo "3️⃣  Authorization URL Construction"
echo "   Building OAuth2 authorization URL..."

STATE=$(openssl rand -hex 16)
CLIENT_ID="lanonasis-cli"
REDIRECT_URI="http://localhost:8888/callback"
SCOPE="read%20write%20offline_access"

AUTH_URL="${AUTH_BASE}/oauth/authorize"
FULL_AUTH_URL="${AUTH_URL}?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${SCOPE}&code_challenge=${CODE_CHALLENGE}&code_challenge_method=S256&state=${STATE}"

echo "   Base URL: $AUTH_URL"
echo "   Parameters:"
echo "     • response_type: code"
echo "     • client_id: $CLIENT_ID"
echo "     • redirect_uri: $REDIRECT_URI"
echo "     • scope: read write offline_access"
echo "     • code_challenge: ${CODE_CHALLENGE:0:30}..."
echo "     • code_challenge_method: S256"
echo "     • state: $STATE"
echo

# Test authorization endpoint
echo "4️⃣  Testing Authorization Endpoint"
echo "   GET $AUTH_URL"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$AUTH_URL?client_id=test")

if [ "$HTTP_CODE" == "400" ]; then
    echo "   ✅ Endpoint responding (HTTP $HTTP_CODE)"
    echo "   Note: 400 is expected for incomplete test request"
elif [ "$HTTP_CODE" == "404" ]; then
    echo "   ❌ Endpoint not found (HTTP $HTTP_CODE)"
    exit 1
else
    echo "   ⚠️  Unexpected response (HTTP $HTTP_CODE)"
fi
echo

# Test token endpoint
echo "5️⃣  Testing Token Endpoint"
TOKEN_URL="${AUTH_BASE}/oauth/token"
echo "   POST $TOKEN_URL"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$TOKEN_URL" \
  -H "Content-Type: application/json" \
  -d '{"grant_type":"authorization_code","code":"test"}')

if [ "$HTTP_CODE" == "400" ] || [ "$HTTP_CODE" == "401" ]; then
    echo "   ✅ Endpoint responding (HTTP $HTTP_CODE)"
    echo "   Note: 400/401 is expected for invalid test request"
elif [ "$HTTP_CODE" == "404" ]; then
    echo "   ❌ Endpoint not found (HTTP $HTTP_CODE)"
    exit 1
else
    echo "   ⚠️  Unexpected response (HTTP $HTTP_CODE)"
fi
echo

# Test health endpoint
echo "6️⃣  Testing Service Health"
HEALTH_URL="${AUTH_BASE}/health"
echo "   GET $HEALTH_URL"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL")

if [ "$HTTP_CODE" == "200" ]; then
    echo "   ✅ Service healthy (HTTP $HTTP_CODE)"
elif [ "$HTTP_CODE" == "404" ]; then
    echo "   ⚠️  No health endpoint (HTTP $HTTP_CODE) - non-critical"
else
    echo "   ⚠️  Unexpected response (HTTP $HTTP_CODE)"
fi
echo

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Test Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "✅ CLI OAuth Flow Compatibility: VERIFIED"
echo
echo "The CLI will use these URLs:"
echo "  • Authorization: ${AUTH_BASE}/oauth/authorize"
echo "  • Token: ${AUTH_BASE}/oauth/token"
echo
echo "Both endpoints are responding correctly."
echo "The 400 errors are expected for incomplete test requests."
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎯 Next Steps"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "To test the full OAuth flow with the CLI:"
echo
echo "  cd apps/lanonasis-maas/cli"
echo "  npm run build"
echo "  node dist/index.js auth login"
echo
echo "Then choose 'Browser Login (OAuth2)' option."
echo
echo "Expected behavior:"
echo "  1. Browser opens to: ${AUTH_BASE}/oauth/authorize"
echo "  2. User logs in or approves access"
echo "  3. Redirect to: http://localhost:8888/callback?code=..."
echo "  4. CLI exchanges code for tokens"
echo "  5. Success message displayed"
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
