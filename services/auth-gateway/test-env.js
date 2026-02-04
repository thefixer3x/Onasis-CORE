#!/usr/bin/env node

import { config } from 'dotenv';
config();

console.log('Environment Variables Test:');
console.log('='.repeat(40));
console.log(`DATABASE_URL: ${process.env.DATABASE_URL || '(not set)'}`);
console.log(`SUPABASE_URL: ${process.env.SUPABASE_URL || '(not set)'}`);
console.log(`SUPABASE_ANON_KEY: ${process.env.SUPABASE_ANON_KEY ? 'set' : '(not set)'}`);
console.log(`SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : '(not set)'}`);
console.log(`JWT_SECRET: ${process.env.JWT_SECRET ? 'set' : '(not set)'}`);
console.log(`PORT: ${process.env.PORT || '4000'}`);

// Test importing env config
try {
  const { env } = await import('./config/env.js');
  console.log('\n✅ Environment validation passed');
  console.log(`Loaded PORT: ${env.PORT}`);
  console.log(`Loaded SUPABASE_URL: ${env.SUPABASE_URL}`);
} catch (error) {
  console.log('\n❌ Environment validation failed:');
  console.log(error.message);
}
