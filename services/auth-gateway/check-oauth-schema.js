import { Pool } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
  ssl: { rejectUnauthorized: false },
});

async function checkSchema() {
  try {
    // Check columns of oauth_clients table
    const columnsResult = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'oauth_clients' 
      ORDER BY ordinal_position
    `);
    
    console.log('OAuth Clients table columns:');
    columnsResult.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });

    // Check a sample row to understand actual structure
    const sampleResult = await pool.query('SELECT * FROM oauth_clients LIMIT 1');
    if (sampleResult.rows.length > 0) {
      console.log('\nSample OAuth client structure:');
      console.log(JSON.stringify(sampleResult.rows[0], null, 2));
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkSchema();
