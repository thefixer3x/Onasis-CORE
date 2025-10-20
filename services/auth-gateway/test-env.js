#!/usr/bin/env node

import { config } from 'dotenv';
config();

console.log('Environment Variables Test:');
console.log('='.repeat(40));
console.log(`DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
console.log(`SUPABASE_URL=https://<project-ref>.supabase.co
console.log(`SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY
console.log(`SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
console.log(`JWT_SECRET=REDACTED_JWT_SECRET
console.log(`PORT: ${process.env.PORT || '4000'}`);

// Test importing env config
try {
  const { env } = await import('./config/env.js');
  console.log('\n✅ Environment validation passed');
  console.log(`Loaded PORT: ${env.PORT}`);
  console.log(`Loaded SUPABASE_URL=https://<project-ref>.supabase.co
} catch (error) {
  console.log('\n❌ Environment validation failed:');
  console.log(error.message);
}