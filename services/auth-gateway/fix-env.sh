#!/bin/bash
# Fix .env file formatting issue on VPS

echo "🔧 Fixing .env file formatting..."

# Backup current .env
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# Check if the issue exists
if grep -q '"json"COOKIE_DOMAIN' .env; then
    echo "⚠️  Found formatting issue in .env file"
    
    # Fix the malformed line
    sed -i 's/"json"COOKIE_DOMAIN/.lanonasis.com/LOG_FORMAT="json"\nCOOKIE_DOMAIN=.lanonasis.com/g' .env
    
    echo "✅ Fixed .env formatting"
else
    echo "ℹ️  .env file looks okay, but let's verify the format..."
fi

echo ""
echo "📋 Current .env file (last 15 lines):"
tail -n 15 .env

echo ""
echo "🔍 Checking for required variables..."
required_vars="DATABASE_URL SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY JWT_SECRET"
missing_vars=""

for var in $required_vars; do
    if ! grep -q "^${var}=" .env; then
        missing_vars="${missing_vars} ${var}"
    else
        echo "  ✅ $var found"
    fi
done

if [ -n "$missing_vars" ]; then
    echo ""
    echo "⚠️  Missing required variables:$missing_vars"
    echo "Please add them to .env file"
    exit 1
fi

echo ""
echo "✅ All required variables present"
echo ""
echo "Now try:"
echo "  npm run build"
echo "  pm2 restart auth-gateway"
