# Netlify Auth Fix Required
**Date:** October 23, 2025

## 🔍 PROBLEM IDENTIFIED

`api.lanonasis.com` is served by Netlify, not the auth server. The `/auth/login` endpoint doesn't exist on Netlify, causing:

1. Dashboard calls `https://api.lanonasis.com/auth/login`
2. Netlify returns HTML "Page not found"
3. Dashboard tries to parse HTML as JSON → "string did not match expected pattern"

## 🎯 SOLUTION

### Option 1: Add Netlify Function (Recommended)
Create a Netlify function at `/auth/login` that returns JSON:

```javascript
// netlify/functions/auth-login.js
exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  
  try {
    const { email, password } = JSON.parse(event.body);
    
    // Call the actual auth server
    const response = await fetch('http://localhost:3005/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    return {
      statusCode: response.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
```

### Option 2: Update Dashboard Configuration
Change dashboard to call the auth server directly:

```env
VITE_AUTH_BASE_URL=https://auth.lanonasis.com
```

## 📋 IMMEDIATE ACTION NEEDED

1. Check if `api.lanonasis.com` is Netlify deployment
2. If Netlify: Add auth function or update routing
3. If not Netlify: Check nginx configuration
4. Ensure proper JSON responses for API calls

---

**The dashboard needs a working JSON endpoint at `api.lanonasis.com/auth/login`!**
