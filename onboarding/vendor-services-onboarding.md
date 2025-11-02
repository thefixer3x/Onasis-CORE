# Vendor Services Onboarding Guide

**Version:** 1.0  
**Last Updated:** November 1, 2025

---

## Overview

Integrate third-party vendor APIs with secure credential management in the `vendors` schema (3 tables).

---

## Schema: `vendors`

### Tables
1. **users** - Vendor service accounts
2. **profiles** - Vendor metadata
3. **settings** - API credentials & configuration (encrypted)

---

## Step 1: Register Vendor

\`\`\`sql
-- Create vendor account
INSERT INTO vendors.users (
    email,
    full_name,
    metadata
) VALUES (
    'api@stripe.com',
    'Stripe Payments',
    jsonb_build_object(
        'vendor_type', 'payment_processor',
        'api_version', '2023-10-16',
        'documentation_url', 'https://stripe.com/docs/api'
    )
) RETURNING id;
\`\`\`

---

## Step 2: Store API Credentials (Encrypted)

\`\`\`sql
-- Store encrypted API key
INSERT INTO vendors.settings (
    user_id,
    key,
    value
) VALUES (
    'vendor-user-uuid',
    'api_key',
    jsonb_build_object(
        'encrypted_key', pgp_sym_encrypt('sk_live_...', current_setting('app.encryption_key')),
        'key_type', 'secret',
        'environment', 'production',
        'created_at', NOW()
    )
);

-- Store webhook secret
INSERT INTO vendors.settings (
    user_id,
    key,
    value
) VALUES (
    'vendor-user-uuid',
    'webhook_secret',
    jsonb_build_object(
        'encrypted_secret', pgp_sym_encrypt('whsec_...', current_setting('app.encryption_key')),
        'endpoint_url', 'https://yourapp.com/webhooks/stripe'
    )
);
\`\`\`

---

## Step 3: Retrieve Credentials

\`\`\`sql
-- Decrypt API key
SELECT 
    user_id,
    key,
    pgp_sym_decrypt(
        (value->>'encrypted_key')::bytea, 
        current_setting('app.encryption_key')
    ) as decrypted_key,
    value->>'environment' as environment
FROM vendors.settings
WHERE user_id = 'vendor-user-uuid' 
  AND key = 'api_key';
\`\`\`

---

## Common Vendor Integrations

### Stripe
\`\`\`javascript
import Stripe from 'stripe';

// Fetch encrypted key from database
const { decrypted_key } = await sql`
    SELECT pgp_sym_decrypt(
        (value->>'encrypted_key')::bytea,
        current_setting('app.encryption_key')
    ) as decrypted_key
    FROM vendors.settings
    WHERE user_id = 'stripe-uuid' AND key = 'api_key'
`;

const stripe = new Stripe(decrypted_key);
\`\`\`

### SendGrid
\`\`\`python
import os
from sendgrid import SendGridAPIClient

# Fetch from vendors.settings
api_key = fetch_vendor_credential('sendgrid-uuid', 'api_key')
sg = SendGridAPIClient(api_key)
\`\`\`

### Twilio
\`\`\`javascript
const twilio = require('twilio');

const { account_sid, auth_token } = await getVendorCredentials('twilio-uuid');
const client = twilio(account_sid, auth_token);
\`\`\`

---

## Security Best Practices

1. **Never log decrypted keys**
2. **Rotate credentials quarterly**
3. **Use service accounts per environment**
4. **Monitor vendor settings access**

---

## Monitoring

\`\`\`sql
-- Track credential access
CREATE TABLE vendors.credential_access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES vendors.users(id),
    setting_key TEXT,
    accessed_by TEXT,
    accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Log access
INSERT INTO vendors.credential_access_log (user_id, setting_key, accessed_by)
VALUES ('vendor-uuid', 'api_key', 'app_your_service');
\`\`\`

✅ **Vendor integration secured!**
