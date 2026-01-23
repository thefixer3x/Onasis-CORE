#!/bin/bash
# Test Admin Bypass Login

echo "=========================================="
echo "Testing Emergency Admin Bypass Login"
echo "=========================================="
echo ""

echo "📧 Email: admin@example.com"
echo "🔑 Password: REDACTED_CHANGE_ME"
echo ""

echo "🔄 Attempting login..."
echo ""

# Create JSON payload to avoid shell escaping issues
cat > /tmp/admin-login-payload.json << 'EOF'
{
  "email": "admin@example.com",
  "password": "REDACTED_CHANGE_ME"
}
EOF

curl -s -X POST http://localhost:4000/admin/bypass-login \
  -H "Content-Type: application/json" \
  -d @/tmp/admin-login-payload.json \
  > /tmp/admin-login-response.json

cat /tmp/admin-login-response.json

echo ""
echo ""

if grep -q "access_token" /tmp/admin-login-response.json; then
  echo "✅ Admin bypass login SUCCESSFUL!"
  echo ""

  # Extract token
  TOKEN=$(cat /tmp/admin-login-response.json | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

  if [ ! -z "$TOKEN" ]; then
    echo "🎟️  Access Token: ${TOKEN:0:50}..."
    echo ""

    echo "Testing admin status endpoint..."
    curl -s -X GET http://localhost:4000/admin/status \
      -H "Authorization: Bearer $TOKEN"

    echo ""
    echo ""
    echo "✅ You can now access ALL endpoints with this token!"
    echo ""
    echo "Save this for testing:"
    echo "export ADMIN_TOKEN=\"$TOKEN\""
  fi
else
  echo "❌ Login failed"
  echo "Response: $(cat /tmp/admin-login-response.json)"
fi

echo ""
echo "=========================================="
