#!/bin/bash

# Simple Migration Script for Single Neon Database
# Applies all migrations to the neondb database using different schemas

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Database connection from .env
# Load from environment variable or .env file
if [ -z "$DATABASE_URL" ]; then
    if [ -f "services/auth-gateway/.env" ]; then
        export $(grep -v '^#' services/auth-gateway/.env | xargs)
    else
        echo "ERROR: DATABASE_URL not set and .env file not found"
        exit 1
    fi
fi

DB_URL="$DATABASE_URL"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Test database connection
print_status "Testing database connection..."
if psql "$DB_URL" -c "SELECT NOW();" > /dev/null 2>&1; then
    print_success "Connected to neondb"
else
    print_error "Failed to connect to database"
    exit 1
fi
echo ""

# Check for required extensions
print_status "Checking for required extensions..."

# Check pgcrypto
if psql "$DB_URL" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" > /dev/null 2>&1; then
    print_success "pgcrypto extension is available"
else
    print_error "pgcrypto extension is not available"
    exit 1
fi

# Check vector extension
if psql "$DB_URL" -c "CREATE EXTENSION IF NOT EXISTS vector;" > /dev/null 2>&1; then
    print_success "vector extension is available"
else
    print_warning "vector extension is not available - MaaS migration may fail"
    print_warning "Continuing anyway..."
fi

# Check uuid-ossp
if psql "$DB_URL" -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";" > /dev/null 2>&1; then
    print_success "uuid-ossp extension is available"
else
    print_warning "uuid-ossp extension is not available"
fi
echo ""

# Apply migrations
print_status "=== Applying Migrations ==="
echo ""

# Migration 001: Vendor Management
print_status "Applying 001_vendor_management.sql..."
if psql "$DB_URL" -f supabase/migrations/001_vendor_management.sql; then
    print_success "Applied vendor management migration"
else
    print_error "Failed to apply vendor management migration"
    exit 1
fi
echo ""

# Migration 002: Memory Service (MaaS)
print_status "Applying 002_memory_service_maas.sql..."
if psql "$DB_URL" -f supabase/migrations/002_memory_service_maas.sql; then
    print_success "Applied memory service migration"
else
    print_error "Failed to apply memory service migration"
    exit 1
fi
echo ""

# Migration 003: External Vendor Keys
print_status "Applying 003_external_vendor_keys.sql..."
if psql "$DB_URL" -f supabase/migrations/003_external_vendor_keys.sql; then
    print_success "Applied external vendor keys migration"
else
    print_error "Failed to apply external vendor keys migration"
    exit 1
fi
echo ""

# Verify migrations
print_status "=== Verifying Migrations ==="
echo ""

print_status "Checking schemas..."
psql "$DB_URL" -c "SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('core', 'maas', 'public') ORDER BY schema_name;"
echo ""

print_status "Checking vendor tables..."
psql "$DB_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'vendor%' OR table_name LIKE 'external%' ORDER BY table_name;"
echo ""

print_status "Checking maas tables..."
psql "$DB_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'maas' ORDER BY table_name;"
echo ""

print_status "Checking functions..."
psql "$DB_URL" -c "SELECT routine_schema, routine_name FROM information_schema.routines WHERE routine_schema IN ('maas', 'public') AND routine_name LIKE '%vendor%' OR routine_name LIKE '%memory%' ORDER BY routine_schema, routine_name;"
echo ""

print_success "=== Migration Complete ==="
echo ""
print_status "Database structure:"
echo "  - Schema 'core': Audit logging"
echo "  - Schema 'maas': Memory service"
echo "  - Schema 'public': Vendor management + external API keys"
echo ""
print_status "Next steps:"
echo "  1. Test OAuth login: https://auth.lanonasis.com/web/login"
echo "  2. Generate test API key: SELECT * FROM generate_vendor_api_key(...);"
echo "  3. Test MaaS endpoints"
