#!/bin/bash

# Apply Neon Database Migrations
# This script applies migrations to the correct Neon databases

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Check if environment variables are set
check_env_vars() {
    local missing=0
    
    if [ -z "$MAAS_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
        print_error "MAAS_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
        missing=1
    fi
    
    if [ -z "$SECURITY_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
        print_error "SECURITY_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
        missing=1
    fi
    
    if [ $missing -eq 1 ]; then
        print_error "Please set the required environment variables:"
        echo ""
        echo "export MAAS_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
        echo "export SECURITY_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
        exit 1
    fi
}

# Test database connection
test_connection() {
    local db_url=$1
    local db_name=$2
    
    print_status "Testing connection to $db_name..."
    if psql "$db_url" -c "SELECT NOW();" > /dev/null 2>&1; then
        print_success "Connected to $db_name"
        return 0
    else
        print_error "Failed to connect to $db_name"
        return 1
    fi
}

# Apply migration
apply_migration() {
    local db_url=$1
    local migration_file=$2
    local db_name=$3
    
    print_status "Applying $migration_file to $db_name..."
    
    if [ ! -f "$migration_file" ]; then
        print_error "Migration file not found: $migration_file"
        return 1
    fi
    
    if psql "$db_url" -f "$migration_file"; then
        print_success "Applied $migration_file to $db_name"
        return 0
    else
        print_error "Failed to apply $migration_file to $db_name"
        return 1
    fi
}

# Verify migration
verify_migration() {
    local db_url=$1
    local schema=$2
    local db_name=$3
    
    print_status "Verifying schema '$schema' in $db_name..."
    
    local tables=$(psql "$db_url" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$schema';")
    
    if [ "$tables" -gt 0 ]; then
        print_success "Found $tables tables in schema '$schema'"
        psql "$db_url" -c "SELECT table_name FROM information_schema.tables WHERE table_schema = '$schema' ORDER BY table_name;"
        return 0
    else
        print_warning "No tables found in schema '$schema'"
        return 1
    fi
}

# Main execution
main() {
    print_status "Starting Neon Database Migration Process"
    echo ""
    
    # Check environment variables
    check_env_vars
    echo ""
    
    # Test connections
    print_status "Testing database connections..."
    test_connection "$MAAS_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
    test_connection "$SECURITY_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
    echo ""
    
    # Phase 1: Apply MaaS migrations
    print_status "=== Phase 1: Memory Service (MaaS) ==="
    echo ""
    
    # Check for vector extension
    print_status "Checking for vector extension..."
    if psql "$MAAS_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
        print_success "Vector extension is available"
    else
        print_warning "Vector extension may not be available - migration may fail"
    fi
    
    # Apply migration 002
    apply_migration "$MAAS_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
    echo ""
    
    # Verify MaaS schema
    verify_migration "$MAAS_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
    echo ""
    
    # Phase 2: Apply Security Service migrations
    print_status "=== Phase 2: Security Service (Vendor Management) ==="
    echo ""
    
    # Check for pgcrypto extension
    print_status "Checking for pgcrypto extension..."
    if psql "$SECURITY_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
        print_success "pgcrypto extension is available"
    else
        print_error "pgcrypto extension is not available - migration will fail"
        exit 1
    fi
    
    # Apply migration 001
    apply_migration "$SECURITY_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
    echo ""
    
    # Apply migration 003 (external vendor keys)
    apply_migration "$SECURITY_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
    echo ""
    
    # Verify Security Service schema
    print_status "Verifying vendor tables..."
    psql "$SECURITY_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
    echo ""
    
    # Final verification
    print_status "=== Final Verification ==="
    echo ""
    
    print_status "MaaS Database Functions:"
    psql "$MAAS_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
    echo ""
    
    print_status "Security Service Functions:"
    psql "$SECURITY_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
    echo ""
    
    print_success "=== Migration Complete ==="
    echo ""
    print_status "Next steps:"
    echo "1. Test the MaaS API endpoints"
    echo "2. Generate a test vendor API key"
    echo "3. Verify OAuth login flow"
    echo ""
}

# Run main function
main
