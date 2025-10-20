# Auth Gateway Deployment Guide

## Prerequisites

### Local Development
- Node.js 18+
- npm or pnpm
- Access to Neon database credentials

### Hostinger VPS (168.231.74.29)
- Ubuntu/Debian Linux
- Nginx installed
- PM2 installed globally (`npm install -g pm2`)
- Domain pointing to VPS: `api.lanonasis.com`
- SSL certificate (Let's Encrypt)

---

## Local Development Setup

### 1. Install Dependencies

```bash
cd services/auth-gateway
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your Neon database credentials:

```bash
# Get connection strings
neonctl connection-string super-night-54410645 --role-name service_role
```

Required variables:
- `DATABASE_URL` - Neon connection string
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `JWT_SECRET` - Random 32+ character secret

### 3. Apply Database Migration

```bash
# Connect to Neon DB
psql "$DATABASE_URL"

# Run migration
\i migrations/001_init_auth_schema.sql
```

Or use the Neon CLI:

```bash
neonctl sql-editor --project-id super-night-54410645 < migrations/001_init_auth_schema.sql
```

### 4. Run Development Server

```bash
npm run dev
```

The server will start on http://localhost:4000

Test health check:
```bash
curl http://localhost:4000/health
```

---

## Production Deployment to Hostinger VPS

### Option 1: PM2 Deployment (Recommended)

#### Step 1: Prepare VPS

SSH into your Hostinger VPS:

```bash
ssh root@168.231.74.29
```

Create deployment directory:

```bash
mkdir -p /var/www/onasis-core/services
cd /var/www/onasis-core
```

#### Step 2: Deploy Code

From your local machine, rsync the code:

```bash
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'logs' \
  services/auth-gateway/ \
  root@168.231.74.29:/var/www/onasis-core/services/auth-gateway/
```

Or use git:

```bash
cd /var/www/onasis-core
git clone <repo-url>
cd services/auth-gateway
```

#### Step 3: Configure Environment

```bash
cd /var/www/onasis-core/services/auth-gateway
cp .env.example .env
nano .env  # Edit with production credentials
```

#### Step 4: Install and Build

```bash
npm ci --only=production
npm run build
```

#### Step 5: Deploy with Script

```bash
chmod +x deploy.sh
./deploy.sh deploy
```

This will:
- Install dependencies
- Build TypeScript
- Start PM2 cluster (2 instances)
- Reload Nginx

#### Step 6: Configure Nginx

```bash
./deploy.sh nginx
```

This will:
- Copy nginx.conf to `/etc/nginx/sites-available/`
- Create symlink in `/etc/nginx/sites-enabled/`
- Test and reload Nginx

#### Step 7: Set Up SSL

```bash
./deploy.sh ssl
```

Or manually:

```bash
sudo certbot --nginx -d api.lanonasis.com
```

---

### Option 2: Docker Deployment

#### Step 1: Build Docker Image

```bash
docker build -t onasis-auth-gateway .
```

#### Step 2: Run with Docker Compose

```bash
docker-compose up -d
```

---

## Neon Database Setup

### Create Production Branch

```bash
# Create new production branch
neonctl branches create --project-id super-night-54410645 --name main-production

# Get connection string
neonctl connection-string super-night-54410645 --role-name service_role --pooled
```

### Apply Migrations

```bash
# Using psql
psql "postgresql://service_role:PASSWORD@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require" \
  -f migrations/001_init_auth_schema.sql

# Or using Neon SQL Editor
neonctl sql-editor --project-id super-night-54410645 < migrations/001_init_auth_schema.sql
```

### Verify Schema

```sql
-- Check if schema exists
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'auth_gateway';

-- List tables
SELECT table_name FROM information_schema.tables WHERE table_schema = 'auth_gateway';

-- Check RLS policies
SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'auth_gateway';
```

---

## Management Commands

### PM2 Commands

```bash
# Start service
pm2 start ecosystem.config.js --env production

# Stop service
pm2 stop auth-gateway

# Restart service
pm2 restart auth-gateway

# View logs
pm2 logs auth-gateway

# View logs (last 100 lines)
pm2 logs auth-gateway --lines 100

# Monitor
pm2 monit

# Status
pm2 status

# Save PM2 process list
pm2 save

# Setup PM2 startup script
pm2 startup
```

### Nginx Commands

```bash
# Test configuration
sudo nginx -t

# Reload
sudo systemctl reload nginx

# Restart
sudo systemctl restart nginx

# View logs
sudo tail -f /var/log/nginx/auth-gateway-access.log
sudo tail -f /var/log/nginx/auth-gateway-error.log
```

### Deployment Script

```bash
# Full deployment
./deploy.sh deploy

# Just build
./deploy.sh build

# Start/stop/restart
./deploy.sh start
./deploy.sh stop
./deploy.sh restart

# View logs
./deploy.sh logs

# Check status
./deploy.sh status

# Configure Nginx
./deploy.sh nginx

# Setup SSL
./deploy.sh ssl
```

---

## Testing Endpoints

### Health Check

```bash
curl https://api.lanonasis.com/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "auth-gateway",
  "database": {
    "healthy": true,
    "timestamp": "2025-10-20T05:00:00.000Z"
  },
  "timestamp": "2025-10-20T05:00:00.000Z"
}
```

### Login (Password)

```bash
curl -X POST https://api.lanonasis.com/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "project_scope": "web"
  }'
```

### MCP Auth

```bash
curl -X POST https://api.lanonasis.com/mcp/auth \
  -H "Content-Type: application/json" \
  -H "User-Agent: Claude-Desktop/1.0" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "client_id": "claude-desktop"
  }'
```

### CLI Login

```bash
curl -X POST https://api.lanonasis.com/auth/cli-login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

### Session Check

```bash
curl https://api.lanonasis.com/v1/auth/session \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Token Verification

```bash
curl -X POST https://api.lanonasis.com/v1/auth/verify \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Monitoring

### Check Service Status

```bash
# PM2 status
pm2 status

# Resource usage
pm2 monit

# Logs
pm2 logs auth-gateway --lines 50
```

### Check Database Connection

```bash
curl http://localhost:4000/health | jq '.database'
```

### Check Nginx

```bash
# Access logs
sudo tail -f /var/log/nginx/auth-gateway-access.log

# Error logs
sudo tail -f /var/log/nginx/auth-gateway-error.log

# Test config
sudo nginx -t
```

---

## Troubleshooting

### Service Won't Start

1. Check logs:
```bash
pm2 logs auth-gateway --err
```

2. Check environment variables:
```bash
cat .env
```

3. Verify database connection:
```bash
psql "$DATABASE_URL" -c "SELECT NOW()"
```

### Database Connection Errors

1. Verify Neon connection string:
```bash
neonctl connection-string super-night-54410645 --role-name service_role
```

2. Check if Neon branch is active:
```bash
neonctl branches list --project-id super-night-54410645
```

3. Test connection:
```bash
psql "$DATABASE_URL" -c "SELECT 1"
```

### Nginx 502 Bad Gateway

1. Check if PM2 service is running:
```bash
pm2 status auth-gateway
```

2. Check PM2 logs:
```bash
pm2 logs auth-gateway
```

3. Verify port is listening:
```bash
sudo netstat -tlnp | grep 4000
```

### SSL Certificate Issues

1. Renew certificate:
```bash
sudo certbot renew
```

2. Test renewal:
```bash
sudo certbot renew --dry-run
```

---

## Security Checklist

- [ ] Environment variables stored securely (not in git)
- [ ] JWT_SECRET is strong and unique
- [ ] SSL certificate installed and auto-renewal configured
- [ ] Neon database uses SSL connections
- [ ] Nginx rate limiting configured
- [ ] PM2 running as non-root user
- [ ] Firewall configured (allow 80, 443, SSH only)
- [ ] Audit logging enabled
- [ ] Database RLS policies enabled

---

## Backup and Recovery

### Backup Database

```bash
# Backup Neon database
pg_dump "$DATABASE_URL" > backup-$(date +%Y%m%d).sql
```

### Backup Environment

```bash
# Backup .env file (encrypt it!)
gpg -c .env
```

### Restore

```bash
# Restore database
psql "$DATABASE_URL" < backup-20251020.sql
```

---

## Performance Tuning

### PM2 Cluster Mode

Adjust instances in `ecosystem.config.js`:

```javascript
instances: 2,  // Number of CPU cores
```

### Nginx Connection Pool

Edit `nginx.conf`:

```nginx
upstream auth_gateway_backend {
    server 127.0.0.1:4000;
    server 127.0.0.1:4001;
    keepalive 64;  # Increase for more persistent connections
}
```

### Database Connection Pool

Edit `db/client.ts`:

```typescript
export const dbPool = new Pool({
  max: 10,  // Increase for high traffic
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
})
```

---

## Maintenance

### Regular Tasks

1. **Weekly**: Check logs for errors
```bash
pm2 logs auth-gateway --err --lines 1000
```

2. **Monthly**: Review audit logs
```sql
SELECT event_type, COUNT(*), success
FROM auth_gateway.audit_log
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY event_type, success;
```

3. **Monthly**: Clean expired sessions
```sql
DELETE FROM auth_gateway.sessions WHERE expires_at < NOW();
```

4. **Quarterly**: Rotate JWT secret (requires coordinated update)

---

## Support

- Documentation: `/services/auth-gateway/README.md`
- Integration Template: `/.devops/NEON-DB-AUTH-INTEGRATION-TEMPLATE.md`
- Issues: Report to repository owner

---

**Last Updated**: 2025-10-20
**Version**: 1.0.0
