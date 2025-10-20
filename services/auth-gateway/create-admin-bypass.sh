#!/bin/bash
# Create emergency admin bypass accounts in Neon

set -e

echo "=========================================="
echo "Creating Emergency Admin Bypass Accounts"
echo "=========================================="
echo ""
echo "This will create fail-safe admin accounts:"
echo "  1. admin@lanonasis.com"
echo "  2. me@seyederick.com"
echo ""
echo "These accounts:"
echo "  ✅ Bypass all normal authentication"
echo "  ✅ Never expire"
echo "  ✅ Cannot be locked out"
echo "  ✅ Have full system access"
echo ""

# Get connection string
echo "📡 Getting Neon connection string..."
CONN_STRING=$(neonctl connection-string --project-id super-night-54410645 --role-name neondb_owner 2>&1 | grep "postgresql://" | head -1)

if [ -z "$CONN_STRING" ]; then
  echo "❌ Failed to get connection string"
  exit 1
fi

echo "✅ Connection string obtained"
echo ""

# Deploy the migration
echo "🚀 Creating admin bypass tables and accounts..."
psql "$CONN_STRING" -f migrations/003_create_admin_bypass.sql 2>&1 | grep -v "DEBUG"

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Admin bypass system created successfully!"
  echo ""
  echo "📋 Emergency Admin Accounts:"
  echo "  Email: admin@lanonasis.com"
  echo "  Email: me@seyederick.com"
  echo "  Password: LanonasisAdmin2025!"
  echo ""
  echo "⚠️  IMPORTANT: Change these passwords immediately!"
  echo ""
  echo "To change password, use:"
  echo "  curl -X POST http://localhost:4000/admin/change-password \\"
  echo "    -H \"Authorization: Bearer YOUR_ADMIN_TOKEN\" \\"
  echo "    -d '{\"new_password\":\"YourNewPassword\"}'"
  echo ""
else
  echo ""
  echo "❌ Failed to create admin bypass system"
  exit 1
fi
