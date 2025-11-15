import pg from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>

const migrations = [
  '003_create_api_keys_table.sql',
  '006_api_key_management_service.sql',
];

try {
  console.log('🚀 Starting database migrations...\n');
  
  for (const migration of migrations) {
    const filePath = `migrations/${migration}`;
    
    if (!fs.existsSync(filePath)) {
      console.log(`⏭️  Skipping ${migration} (file not found)`);
      continue;
    }
    
    console.log(`📝 Running migration: ${migration}`);
    const sql = fs.readFileSync(filePath, 'utf8');
    await pool.query(sql);
    console.log(`✅ Migration ${migration} executed successfully\n`);
  }
  
  console.log('🎉 All migrations completed successfully!');
} catch (err) {
  console.error('❌ Migration failed:', err.message);
  console.error(err.stack);
  process.exit(1);
} finally {
  await pool.end();
}
