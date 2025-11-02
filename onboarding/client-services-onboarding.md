# Client Services Onboarding Guide

**Version:** 1.0  
**Last Updated:** November 1, 2025

---

## Overview

Multi-tenant organization and account management in `client_services` schema (5 tables).

---

## Schema: `client_services`

### Tables
1. **organizations** - Tenant organizations
2. **accounts** - User accounts within organizations
3. **billing_records** - Payment history
4. **transactions** - Financial transactions
5. **usage_logs** - Service usage tracking

---

## Step 1: Create Organization

\`\`\`sql
-- Register new organization (tenant)
INSERT INTO client_services.organizations (
    name,
    slug,
    plan_type,
    status,
    metadata
) VALUES (
    'Acme Corporation',
    'acme-corp',
    'enterprise',
    'active',
    jsonb_build_object(
        'industry', 'technology',
        'size', 'medium',
        'country', 'US'
    )
) RETURNING id, slug;
\`\`\`

---

## Step 2: Create User Account

\`\`\`sql
-- Add user to organization
INSERT INTO client_services.accounts (
    user_id,
    organization_id,
    role,
    permissions,
    status
) VALUES (
    'user-uuid',
    'org-uuid',
    'admin',
    ARRAY['read', 'write', 'delete', 'billing'],
    'active'
) RETURNING id;
\`\`\`

---

## Step 3: Track Usage

\`\`\`sql
-- Log API usage
INSERT INTO client_services.usage_logs (
    organization_id,
    service_name,
    usage_type,
    quantity,
    metadata
) VALUES (
    'org-uuid',
    'api_calls',
    'request',
    1,
    jsonb_build_object(
        'endpoint', '/api/v1/users',
        'method', 'GET',
        'response_time_ms', 45
    )
);

-- Get monthly usage
SELECT 
    service_name,
    SUM(quantity) as total_usage,
    COUNT(*) as request_count
FROM client_services.usage_logs
WHERE organization_id = 'org-uuid'
  AND created_at >= DATE_TRUNC('month', NOW())
GROUP BY service_name;
\`\`\`

---

## Step 4: Billing

\`\`\`sql
-- Record payment
INSERT INTO client_services.billing_records (
    organization_id,
    amount,
    currency,
    payment_method,
    status,
    metadata
) VALUES (
    'org-uuid',
    99.99,
    'USD',
    'stripe',
    'paid',
    jsonb_build_object(
        'stripe_payment_id', 'pi_...',
        'plan', 'pro',
        'billing_period', '2025-11'
    )
);
\`\`\`

---

## RLS Policies

\`\`\`sql
-- Users can only see their org
CREATE POLICY org_isolation 
ON client_services.organizations 
FOR SELECT 
USING (
    id IN (
        SELECT organization_id 
        FROM client_services.accounts 
        WHERE user_id = auth.uid()
    )
);
\`\`\`

✅ **Multi-tenant setup complete!**
