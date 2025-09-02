# Auth Redirect Hook Configuration

## Purpose
This auth hook intelligently routes users to the correct application after OAuth authentication, eliminating the need for hundreds of hardcoded redirect URLs.

## Setup Instructions

### 1. Deploy the Function
```bash
# From the onasis-core directory
supabase functions deploy auth-redirect-hook --project-ref mxtsdgkwzjzlttpotole
```

### 2. Configure in Supabase Dashboard
1. Go to: https://supabase.com/dashboard/project/mxtsdgkwzjzlttpotole/auth/hooks
2. Click "Add Auth Hook"
3. Select "Custom Access Token Hook"
4. Set Hook URL to: `https://mxtsdgkwzjzlttpotole.supabase.co/functions/v1/auth-redirect-hook`
5. Enable the hook

### 3. Wildcard Redirect URLs
Replace all individual URLs with these patterns:
```
https://*.vercel.app/**
https://*.lovable.app/**  
https://*.supabase.co/**
https://*.lanonasis.com/**
https://auth.vortexcore.app/**
https://dashboard.lanonasis.com/**
```

## How It Works

### Smart Routing Logic
1. **Explicit redirect**: Uses `redirect_to` from user metadata if set
2. **Email-based routing**: Routes based on email patterns
   - `*vortex*` or `*core*` → vortexcore app
   - `*dev*` or `*developer*` → developer console
   - Default → dashboard
3. **Preserves query parameters**: Maintains OAuth state and codes

### Setting Custom Redirects
Applications can set redirect preferences during OAuth initiation:
```typescript
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: 'https://api.lanonasis.com/auth/callback?return_to=vortexcore',
    queryParams: {
      redirect_to: 'https://auth.vortexcore.app'
    }
  }
})
```

## Benefits
- ✅ No more URL limit issues
- ✅ Dynamic routing based on user context
- ✅ Future-proof for new applications
- ✅ Centralized redirect logic
- ✅ Supports all existing OAuth flows