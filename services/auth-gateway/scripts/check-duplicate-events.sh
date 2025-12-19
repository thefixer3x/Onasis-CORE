#!/bin/bash
# =====================================================
# Pre-Migration Check: Detect Duplicate Event Versions
# =====================================================
# Run this script BEFORE applying 010_event_store_unique_constraint.sql
# If duplicates exist, they must be resolved first.
# =====================================================

echo "🔍 Checking for duplicate event versions in Neon event store..."
echo ""

# Query to find duplicate versions
QUERY="
SELECT 
  aggregate_type, 
  aggregate_id, 
  version, 
  COUNT(*) as duplicate_count,
  array_agg(event_id) as event_ids
FROM auth_gateway.events
GROUP BY aggregate_type, aggregate_id, version
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;
"

echo "Running query..."
echo ""

# Execute against Neon database
# Replace with your actual connection string or use env var
psql "$NEON_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>

RESULT=$?

if [ $RESULT -eq 0 ]; then
  echo ""
  echo "✅ Query completed. If no rows returned, it's safe to apply the unique constraint."
  echo ""
  echo "To apply the constraint, run:"
  echo "  psql \$NEON_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
else
  echo ""
  echo "❌ Query failed. Check your database connection."
fi
