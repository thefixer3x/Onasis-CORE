# 🚀 Auth Gateway - Quick Start Guide

**For**: Local PM2 deployment testing  
**Time**: ~5 minutes  
**Difficulty**: Easy

---

## ⚡ One-Command Deployment

```bash
cd services/auth-gateway && ./safe-start.sh
```

That's it! The script handles everything automatically.

---

## 📋 What You Need First

### 1. Check Prerequisites
```bash
node --version    # Should be 18+
pm2 --version     # Should be installed
```

If PM2 is missing:
```bash
npm install -g pm2
```

### 2. Configure Environment
```bash
# Copy example if .env doesn't exist
cp .env.example .env

# Edit with your credentials
nano .env
```

**Required variables:**
- `DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
- `SUPABASE_URL=https://<project-ref>.supabase.co
- `SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
- `JWT_SECRET=REDACTED_JWT_SECRET

### 3. Install Dependencies
```bash
npm install
```

---

## 🎯 Quick Commands

### Start Service
```bash
./safe-start.sh
```

### Check Status
```bash
pm2 status
```

### View Logs
```bash
pm2 logs auth-gateway-local
```

### Stop Service
```bash
pm2 stop auth-gateway-local
```

### Restart Service
```bash
pm2 restart auth-gateway-local
```

---

## 🧪 Quick Tests

### Health Check
```bash
curl http://localhost:4000/health
```

### Admin Login
```bash
curl -X POST http://localhost:4000/admin/bypass-login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"REDACTED_CHANGE_ME"}'
```

---

## 🚨 Troubleshooting

### Service Won't Start?
```bash
# Run pre-flight checks
node preflight-check.js

# Check logs
pm2 logs auth-gateway-local --err
```

### Port Already in Use?
```bash
# Find what's using port 4000
lsof -ti:4000

# Kill it
kill -9 $(lsof -ti:4000)
```

### Database Connection Failed?
```bash
# Test connection
psql "$DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
```

---

## 📚 More Information

- **Full Guide**: [`LOCAL-DEPLOYMENT-GUIDE.md`](LOCAL-DEPLOYMENT-GUIDE.md)
- **VPS Status**: [`DEPLOYMENT-STATUS.md`](DEPLOYMENT-STATUS.md)
- **Stability Fix**: [`PM2-STABILITY-FIX.md`](PM2-STABILITY-FIX.md)

---

## ✅ Success Checklist

- [ ] PM2 shows "online" status
- [ ] Health endpoint returns 200 OK
- [ ] No restarts in first 5 minutes
- [ ] Admin login works
- [ ] Logs show no errors

---

**Need help?** Check the full [`LOCAL-DEPLOYMENT-GUIDE.md`](LOCAL-DEPLOYMENT-GUIDE.md) for detailed troubleshooting.