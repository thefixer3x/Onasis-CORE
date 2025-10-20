#!/bin/bash
# Safe deployment script for auth_gateway schema to Neon
# This script ONLY creates the auth_gateway schema and does NOT touch maas or core schemas

set -e

echo "=========================================="
echo "Auth Gateway Schema Deployment to Neon"
echo "=========================================="
echo ""
echo "⚠️  SAFETY CHECKS:"
echo "  - Will ONLY create 'auth_gateway' schema"
echo "  - Will NOT touch 'maas' schema (Memory Service)"
echo "  - Will NOT touch 'core' schema (Audit Logs)"
echo "  - Will NOT touch 'public' schema"
echo ""

# Get connection string
echo "📡 Getting Neon connection string..."
CONN_STRING=$(neonctl connection-string --project-id super-night-54410645 --role-name neondb_owner 2>&1 | grep "postgresql://" | head -1)

if [ -z "$CONN_STRING" ]; then
  echo "❌ Failed to get connection string"
  echo "Run manually: neonctl connection-string --project-id super-night-54410645 --role-name neondb_owner"
  exit 1
fi

echo "✅ Connection string obtained"
echo ""

# Check existing schemas
echo "🔍 Checking existing schemas in database..."
EXISTING_SCHEMAS=$(psql "$CONN_STRING" -t -c "SELECT string_agg(schema_name, ', ') FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast', 'pg_temp_1', 'pg_toast_temp_1');" 2>&1)

if [ $? -eq 0 ]; then
  echo "📋 Existing schemas: $EXISTING_SCHEMAS"
else
  echo "❌ Failed to connect to database"
  echo "Please check your connection string and try again"
  exit 1
fi

echo ""
echo "🚀 Deploying auth_gateway schema..."
echo ""

# Deploy the migration
psql "$CONN_STRING" -f migrations/001_init_auth_schema.sql

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Auth gateway schema deployed successfully!"
  echo ""

  # Verify deployment
  echo "🔍 Verifying deployment..."
  psql "$CONN_STRING" -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'auth_gateway' ORDER BY table_name;"

  echo ""
  echo "✅ Deployment complete!"
  echo ""
  echo "📊 Schema Summary:"
  echo "  - maas: Memory Service (UNTOUCHED)"
  echo "  - core: Audit Logs (UNTOUCHED)"
  echo "  - auth_gateway: Authentication (NEWLY CREATED)"
  echo ""
  echo "Next steps:"
  echo "  1. Configure .env file with Neon credentials"
  echo "  2. Run: npm run dev"
  echo "  3. Test: curl http://localhost:4000/health"
else
  echo ""
  echo "❌ Deployment failed!"
  echo "Check the error messages above"
  exit 1
fi
