#!/bin/bash
# Deployment Diagnostics Script
# Helps identify why deployment is failing

set +e  # Don't exit on errors, we want to see all issues

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Auth Gateway Deployment Diagnostics       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}\n"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# 1. Check for .env files
echo -e "${BLUE}1. Checking environment files...${NC}"
if [ -f ".env" ]; then
    echo -e "${GREEN}✓${NC} .env file exists"
elif [ -f ".env.local" ]; then
    echo -e "${YELLOW}⚠${NC} .env.local exists but .env doesn't"
    echo -e "   ${YELLOW}Creating symlink: .env -> .env.local${NC}"
    ln -sf .env.local .env
else
    echo -e "${RED}✗${NC} No .env or .env.local file found!"
    echo -e "   ${YELLOW}Run: cp .env.example .env${NC}"
fi

# 2. Check if .env files are in git
echo -e "\n${BLUE}2. Checking git status of .env files...${NC}"
ENV_IN_GIT=$(git ls-files | grep -E "^\.env$|^\.env\.local$" || echo "")
if [ -z "$ENV_IN_GIT" ]; then
    echo -e "${GREEN}✓${NC} .env files are NOT tracked by git (correct)"
else
    echo -e "${RED}✗${NC} .env files ARE tracked by git:"
    echo "$ENV_IN_GIT"
    echo -e "\n${YELLOW}To fix, run:${NC}"
    echo "  git rm --cached .env .env.local"
    echo "  git commit -m 'Remove .env files from git'"
fi

# 3. Check .gitignore
echo -e "\n${BLUE}3. Checking .gitignore...${NC}"
if grep -q "^\.env$" .gitignore 2>/dev/null; then
    echo -e "${GREEN}✓${NC} .env is in .gitignore"
else
    echo -e "${RED}✗${NC} .env is NOT in .gitignore"
fi

if grep -q "^\.env\.local$" .gitignore 2>/dev/null; then
    echo -e "${GREEN}✓${NC} .env.local is in .gitignore"
else
    echo -e "${RED}✗${NC} .env.local is NOT in .gitignore"
fi

# 4. Check for sensitive data in staged files
echo -e "\n${BLUE}4. Checking staged files for sensitive data...${NC}"
STAGED_FILES=$(git diff --cached --name-only)
if [ -z "$STAGED_FILES" ]; then
    echo -e "${GREEN}✓${NC} No files staged for commit"
else
    echo -e "${YELLOW}⚠${NC} Files staged for commit:"
    echo "$STAGED_FILES"
    
    # Check if any contain sensitive patterns
    for file in $STAGED_FILES; do
        if [ -f "$file" ]; then
            if grep -qE "SUPABASE.*KEY|JWT_SECRET=REDACTED_JWT_SECRET
                echo -e "${RED}✗${NC} $file contains sensitive data!"
            fi
        fi
    done
fi

# 5. Check PM2 status
echo -e "\n${BLUE}5. Checking PM2 status...${NC}"
if command -v pm2 &> /dev/null; then
    PM2_STATUS=$(pm2 jlist 2>/dev/null | jq -r '.[] | select(.name=="auth-gateway-local") | .pm2_env.status' 2>/dev/null || echo "not_found")
    
    if [ "$PM2_STATUS" = "online" ]; then
        echo -e "${GREEN}✓${NC} PM2 process is online"
        RESTARTS=$(pm2 jlist 2>/dev/null | jq -r '.[] | select(.name=="auth-gateway-local") | .pm2_env.restart_time' 2>/dev/null || echo "0")
        echo -e "   Restarts: $RESTARTS"
    elif [ "$PM2_STATUS" = "errored" ]; then
        echo -e "${RED}✗${NC} PM2 process is errored"
        echo -e "\n${YELLOW}Recent error logs:${NC}"
        pm2 logs auth-gateway-local --err --lines 10 --nostream 2>/dev/null || echo "No logs available"
    elif [ "$PM2_STATUS" = "stopped" ]; then
        echo -e "${YELLOW}⚠${NC} PM2 process is stopped"
    else
        echo -e "${YELLOW}⚠${NC} PM2 process not found"
    fi
else
    echo -e "${YELLOW}⚠${NC} PM2 not installed"
fi

# 6. Check for GitGuardian issues
echo -e "\n${BLUE}6. Checking for GitGuardian cache...${NC}"
if [ -d "../../.cache_ggshield" ]; then
    echo -e "${YELLOW}⚠${NC} GitGuardian cache exists"
    echo -e "   Location: .cache_ggshield"
fi

# 7. Check recent git commits
echo -e "\n${BLUE}7. Checking recent commits...${NC}"
RECENT_COMMITS=$(git log --oneline -5 2>/dev/null || echo "")
if [ -n "$RECENT_COMMITS" ]; then
    echo "$RECENT_COMMITS"
else
    echo -e "${YELLOW}⚠${NC} No git history available"
fi

# 8. Test database connection
echo -e "\n${BLUE}8. Testing database connection...${NC}"
if [ -f ".env" ]; then
    source .env
    if [ -n "$DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
        if command -v psql &> /dev/null; then
            if psql "$DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
                echo -e "${GREEN}✓${NC} Database connection successful"
            else
                echo -e "${RED}✗${NC} Database connection failed"
            fi
        else
            echo -e "${YELLOW}⚠${NC} psql not installed, skipping database test"
        fi
    else
        echo -e "${RED}✗${NC} DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
    fi
else
    echo -e "${YELLOW}⚠${NC} .env file not found, skipping database test"
fi

# 9. Check for port conflicts
echo -e "\n${BLUE}9. Checking port availability...${NC}"
PORT=${PORT:-4000}
if lsof -ti:$PORT &> /dev/null; then
    PID=$(lsof -ti:$PORT)
    PROCESS=$(ps -p $PID -o comm= 2>/dev/null || echo "unknown")
    echo -e "${YELLOW}⚠${NC} Port $PORT is in use by PID $PID ($PROCESS)"
else
    echo -e "${GREEN}✓${NC} Port $PORT is available"
fi

# Summary
echo -e "\n${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              Diagnostic Summary                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}\n"

echo -e "${YELLOW}Common deployment failure causes:${NC}"
echo "1. .env file missing or misconfigured"
echo "2. .env files tracked by git (GitGuardian blocks)"
echo "3. Database connection issues"
echo "4. Port conflicts"
echo "5. PM2 restart loops"

echo -e "\n${YELLOW}Quick fixes:${NC}"
echo "• If .env missing: cp .env.example .env"
echo "• If .env in git: git rm --cached .env && git commit"
echo "• If port conflict: kill -9 \$(lsof -ti:$PORT)"
echo "• If PM2 errored: pm2 logs auth-gateway-local --err"

echo -e "\n${GREEN}For detailed help, see:${NC}"
echo "• LOCAL-DEPLOYMENT-GUIDE.md"
echo "• QUICK-START.md"
echo ""