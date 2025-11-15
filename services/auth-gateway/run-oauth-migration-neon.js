#!/usr/bin/env node
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import 'dotenv/config'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const sql = neon(process.env.DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>

async function runMigration() {
  try {
    console.log('📦 Reading OAuth migration file...')
    const migrationPath = join(__dirname, 'migrations', '002_oauth2_pkce.sql')
    const migrationSQL = readFileSync(migrationPath, 'utf-8')

    console.log('🚀 Running OAuth2 PKCE migration on Neon...')
    console.log(`   Database: ${process.env.DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>

    await sql(migrationSQL)

    console.log('✅ Migration completed successfully!')
    console.log('\n📋 Verifying tables...')

    const clients = await sql`SELECT client_id, client_name, status FROM oauth_clients`
    console.log(`✅ Found ${clients.length} OAuth clients:`)
    clients.forEach(c => console.log(`   - ${c.client_id}: ${c.client_name} (${c.status})`))

    console.log('\n🎉 OAuth flow is ready to use!')

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
}

runMigration()
