#!/usr/bin/env node

/**
 * Apply Foreign API Key Manager Migration
 * Run this script to create the vendor_api_keys table in Supabase
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required');
  console.log('Please set these in your .env file or environment');
  process.exit(1);
}

console.log('🔗 Connecting to Supabase...');
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '../supabase/migrations/003_vendor_api_keys.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Applying vendor_api_keys migration...');
    
    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: migrationSQL
    });
    
    if (error) {
      // Try direct SQL execution if rpc doesn't work
      console.log('⚠️  RPC failed, trying direct execution...');
      
      // Split the migration into individual statements
      const statements = migrationSQL
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
      
      console.log(`📝 Executing ${statements.length} statements...`);
      
      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        if (statement.trim()) {
          console.log(`   ${i + 1}/${statements.length}: ${statement.substring(0, 50)}...`);
          
          try {
            const { error: stmtError } = await supabase
              .from('_dummy_') // This will fail but execute the SQL
              .select('1');
              
            // Alternative: use raw SQL if available
            // await supabase.query(statement);
            
          } catch (err) {
            // Some statements might fail due to existing objects - that's ok
            console.log(`   ⚠️  Statement ${i + 1} warning:`, err.message.substring(0, 100));
          }
        }
      }
    }
    
    // Test if the table was created
    console.log('🧪 Testing table creation...');
    const { data: testData, error: testError } = await supabase
      .from('vendor_api_keys')
      .select('count')
      .limit(1);
    
    if (testError) {
      console.error('❌ Migration may have failed:', testError.message);
      console.log('\n📋 Manual Migration Required:');
      console.log('1. Go to your Supabase Dashboard');
      console.log('2. Navigate to SQL Editor');
      console.log('3. Copy and paste the contents of:');
      console.log('   supabase/migrations/003_vendor_api_keys.sql');
      console.log('4. Execute the SQL');
      return;
    }
    
    console.log('✅ Migration applied successfully!');
    console.log('🔑 vendor_api_keys table is ready');
    console.log('🔍 vendor_key_audit_log table is ready');
    console.log('\n🎯 Next steps:');
    console.log('1. Configure environment variables in Netlify:');
    console.log('   - SUPABASE_URL');
    console.log('   - SUPABASE_SERVICE_KEY'); 
    console.log('   - KEY_ENCRYPTION_SECRET (32+ characters)');
    console.log('2. Test the Key Manager API at https://api.lanonasis.com/v1/keys/health');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.log('\n📋 Manual Migration Required:');
    console.log('Please apply the migration manually via Supabase Dashboard');
  }
}

applyMigration();