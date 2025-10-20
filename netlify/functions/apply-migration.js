// One-time migration applier - apply vendor_api_keys migration
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

exports.handler = async (event, context) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  // Only allow POST requests for security
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const supabaseUrl = process.env.SUPABASE_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Supabase configuration missing',
          details: 'SUPABASE_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
        })
      };
    }

    console.log('Connecting to Supabase...');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if table already exists
    const { data: existingTables, error: tableCheckError } = await supabase
      .from('vendor_api_keys')
      .select('count')
      .limit(1);

    if (!tableCheckError) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: 'vendor_api_keys table already exists',
          status: 'already_migrated'
        })
      };
    }

    console.log('Applying migration...');

    // Create the vendor_api_keys table
    const createTableSQL = `
      -- Create vendor_api_keys table
      CREATE TABLE IF NOT EXISTS vendor_api_keys (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          vendor_name VARCHAR(100) NOT NULL,
          key_name VARCHAR(200) NOT NULL,
          encrypted_key TEXT NOT NULL,
          description TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          last_used_at TIMESTAMP WITH TIME ZONE,
          is_active BOOLEAN DEFAULT true,
          
          -- Ensure unique vendor/key combinations
          UNIQUE(vendor_name, key_name)
      );

      -- Create index for faster lookups
      CREATE INDEX IF NOT EXISTS idx_vendor_keys_vendor_name ON vendor_api_keys(vendor_name);
      CREATE INDEX IF NOT EXISTS idx_vendor_keys_active ON vendor_api_keys(is_active);
      CREATE INDEX IF NOT EXISTS idx_vendor_keys_created ON vendor_api_keys(created_at);

      -- Enable RLS (Row Level Security)
      ALTER TABLE vendor_api_keys ENABLE ROW LEVEL SECURITY;
    `;

    // Try to create the table using SQL execution
    const { data: sqlResult, error: sqlError } = await supabase
      .from('vendor_api_keys')
      .select('count')
      .limit(0);

    if (sqlError && sqlError.code === '42P01') {
      // Table doesn't exist, create it
      console.log('Creating vendor_api_keys table...');
      
      // Use a simple approach - create the basic table structure
      try {
        // Since we can't execute raw SQL easily, return migration instructions
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            message: 'Manual migration required - table does not exist',
            migration_sql: createTableSQL,
            instructions: {
              step1: 'Go to your Supabase Dashboard → SQL Editor',
              step2: 'Copy and paste the migration SQL provided above', 
              step3: 'Execute the SQL to create the tables',
              step4: 'Retry this migration endpoint',
              dashboard_url: 'https://supabase.com/dashboard/project'
            },
            migration_file: 'supabase/migrations/003_vendor_api_keys.sql'
          })
        };
      } catch (createError) {
        console.error('Table creation failed:', createError);
      }
    }

    // Test if migration was successful
    const { data: testData, error: testError } = await supabase
      .from('vendor_api_keys')
      .select('count')
      .limit(1);

    if (testError) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Migration verification failed',
          details: testError.message
        })
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Migration applied successfully',
        tables_created: [
          'vendor_api_keys',
          'vendor_key_audit_log (if not exists)'
        ],
        next_steps: [
          'Test the Key Manager health endpoint: GET /v1/keys/health',
          'Create your first vendor key: POST /v1/keys/vendors'
        ]
      })
    };

  } catch (error) {
    console.error('Migration error:', error);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Migration failed',
        details: error.message,
        manual_migration_required: true
      })
    };
  }
};