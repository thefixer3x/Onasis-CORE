#!/bin/bash
cd /Users/Seye/Onasis-CORE/services/auth-gateway
CONN_STRING=$(neonctl connection-string --project-id super-night-54410645 --role-name neondb_owner 2>&1 | grep "postgresql://" | head -1)
psql "$CONN_STRING" -f migrations/002_fix_rls_policies.sql
