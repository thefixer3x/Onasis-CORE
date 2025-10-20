#!/bin/bash

echo "=========================================="
echo "Testing App Registration Flow"
echo "=========================================="
echo ""

# Step 1: Admin login
echo "🔐 Step 1: Admin Login"
echo "-----------------------"
RESPONSE=$(curl -s -X POST http://localhost:4000/admin/bypass-login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@lanonasis.com","password":"LanonasisAdmin2025!"}')

ADMIN_TOKEN=$(echo "$RESPONSE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$ADMIN_TOKEN" ]; then
  echo "❌ Admin login failed"
  echo "$RESPONSE"
  exit 1
fi

echo "✅ Admin logged in successfully"
echo ""

# Step 2: List apps (should be empty)
echo "📋 Step 2: List Apps (Before Registration)"
echo "--------------------------------------------"
curl -s http://localhost:4000/admin/list-apps \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -m json.tool
echo ""

# Step 3: Register new app
echo "🚀 Step 3: Register New App"
echo "----------------------------"
APP_RESPONSE=$(curl -s -X POST http://localhost:4000/admin/register-app \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "app_id": "app_test_application",
    "app_name": "Test Application",
    "redirect_uris": ["http://localhost:3000/auth/callback"],
    "metadata": {"environment": "development", "version": "1.0.0"}
  }')

echo "$APP_RESPONSE" | python3 -m json.tool
echo ""

# Extract client credentials
CLIENT_ID=$(echo "$APP_RESPONSE" | grep -o '"client_id":"[^"]*"' | cut -d'"' -f4)
CLIENT_SECRET=$(echo "$APP_RESPONSE" | grep -o '"client_secret":"[^"]*"' | cut -d'"' -f4)

if [ -n "$CLIENT_ID" ] && [ -n "$CLIENT_SECRET" ]; then
  echo "✅ App registered successfully!"
  echo ""
  echo "📝 Save these credentials (client_secret shown only once):"
  echo "   CLIENT_ID=$CLIENT_ID"
  echo "   CLIENT_SECRET=$CLIENT_SECRET"
  echo ""
else
  echo "❌ App registration failed"
  exit 1
fi

# Step 4: List apps again (should show new app)
echo "📋 Step 4: List Apps (After Registration)"
echo "-------------------------------------------"
curl -s http://localhost:4000/admin/list-apps \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -m json.tool
echo ""

# Step 5: Try to register duplicate (should fail)
echo "⚠️  Step 5: Test Duplicate Prevention"
echo "---------------------------------------"
curl -s -X POST http://localhost:4000/admin/register-app \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "app_id": "app_test_application",
    "app_name": "Duplicate Test",
    "redirect_uris": ["http://localhost:3000"]
  }' | python3 -m json.tool
echo ""

echo "=========================================="
echo "✅ App Registration Flow Test Complete!"
echo "=========================================="
