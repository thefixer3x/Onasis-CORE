#!/usr/bin/env node
/**
 * Pre-flight validation script for auth-gateway
 * Checks all requirements before starting PM2
 * Prevents restart loops by catching configuration errors early
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function checkmark() {
  return `${colors.green}✓${colors.reset}`
}

function crossmark() {
  return `${colors.red}✗${colors.reset}`
}

let hasErrors = false
let hasWarnings = false

log('\n🔍 Auth Gateway Pre-flight Check\n', 'cyan')

// 1. Check Node.js version
log('1. Checking Node.js version...', 'blue')
const nodeVersion = process.version
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0])
if (majorVersion >= 18) {
  log(`   ${checkmark()} Node.js ${nodeVersion} (>= 18 required)`, 'green')
} else {
  log(`   ${crossmark()} Node.js ${nodeVersion} - Version 18+ required!`, 'red')
  hasErrors = true
}

// 2. Check if .env file exists
log('\n2. Checking environment configuration...', 'blue')
const envPath = resolve(__dirname, '.env')
if (existsSync(envPath)) {
  log(`   ${checkmark()} .env file found`, 'green')
  
  // Parse .env file
  const envContent = readFileSync(envPath, 'utf-8')
  const envVars = {}
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
      envVars[match[1].trim()] = match[2].trim()
    }
  })
  
  // Check required variables
  const required = [
    'DATABASE_URL',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'JWT_SECRET',
  ]
  
  required.forEach(key => {
    const value = envVars[key]
    if (!value || value.includes('PASSWORD') || value.includes('[REDACTED') || value.includes('change-me')) {
      log(`   ${crossmark()} ${key} - Missing or placeholder value`, 'red')
      hasErrors = true
    } else {
      log(`   ${checkmark()} ${key} - Configured`, 'green')
    }
  })
  
  // Check JWT_SECRET length
  if (envVars.JWT_SECRET && envVars.JWT_SECRET.length < 32) {
    log(`   ${crossmark()} JWT_SECRET - Must be at least 32 characters (current: ${envVars.JWT_SECRET.length})`, 'red')
    hasErrors = true
  }
  
} else {
  log(`   ${crossmark()} .env file not found!`, 'red')
  log(`   Run: cp .env.example .env`, 'yellow')
  hasErrors = true
}

// 3. Check if node_modules exists
log('\n3. Checking dependencies...', 'blue')
const nodeModulesPath = resolve(__dirname, 'node_modules')
if (existsSync(nodeModulesPath)) {
  log(`   ${checkmark()} node_modules directory found`, 'green')
  
  // Check for critical dependencies
  const criticalDeps = ['express', '@neondatabase/serverless', '@supabase/supabase-js', 'tsx']
  criticalDeps.forEach(dep => {
    const depPath = resolve(nodeModulesPath, dep)
    if (existsSync(depPath)) {
      log(`   ${checkmark()} ${dep} installed`, 'green')
    } else {
      log(`   ${crossmark()} ${dep} not found`, 'red')
      hasErrors = true
    }
  })
} else {
  log(`   ${crossmark()} node_modules not found!`, 'red')
  log(`   Run: npm install`, 'yellow')
  hasErrors = true
}

// 4. Check if start.js exists
log('\n4. Checking entry point...', 'blue')
const startPath = resolve(__dirname, 'start.js')
if (existsSync(startPath)) {
  log(`   ${checkmark()} start.js found`, 'green')
} else {
  log(`   ${crossmark()} start.js not found!`, 'red')
  hasErrors = true
}

// 5. Check if src/index.ts exists
const indexPath = resolve(__dirname, 'src/index.ts')
if (existsSync(indexPath)) {
  log(`   ${checkmark()} src/index.ts found`, 'green')
} else {
  log(`   ${crossmark()} src/index.ts not found!`, 'red')
  hasErrors = true
}

// 6. Check if logs directory exists, create if not
log('\n5. Checking logs directory...', 'blue')
const logsPath = resolve(__dirname, 'logs')
if (!existsSync(logsPath)) {
  log(`   ${crossmark()} logs directory not found - will be created by PM2`, 'yellow')
  hasWarnings = true
} else {
  log(`   ${checkmark()} logs directory exists`, 'green')
}

// 7. Check if PM2 is installed
log('\n6. Checking PM2 installation...', 'blue')
try {
  const { execSync } = await import('child_process')
  const pm2Version = execSync('pm2 --version', { encoding: 'utf-8' }).trim()
  log(`   ${checkmark()} PM2 ${pm2Version} installed`, 'green')
} catch (error) {
  log(`   ${crossmark()} PM2 not found!`, 'red')
  log(`   Run: npm install -g pm2`, 'yellow')
  hasErrors = true
}

// 8. Check if port 4000 is available
log('\n7. Checking port availability...', 'blue')
try {
  const { execSync } = await import('child_process')
  const portCheck = execSync('lsof -ti:4000 2>/dev/null || echo "available"', { encoding: 'utf-8' }).trim()
  if (portCheck === 'available') {
    log(`   ${checkmark()} Port 4000 is available`, 'green')
  } else {
    log(`   ${crossmark()} Port 4000 is in use (PID: ${portCheck})`, 'yellow')
    log(`   You may need to stop the existing process or change PORT in .env`, 'yellow')
    hasWarnings = true
  }
} catch (error) {
  log(`   ${checkmark()} Port check skipped (lsof not available)`, 'yellow')
  hasWarnings = true
}

// Summary
log('\n' + '='.repeat(50), 'cyan')
if (hasErrors) {
  log('\n❌ Pre-flight check FAILED', 'red')
  log('Please fix the errors above before starting PM2\n', 'red')
  process.exit(1)
} else if (hasWarnings) {
  log('\n⚠️  Pre-flight check passed with warnings', 'yellow')
  log('Review warnings above, but safe to proceed\n', 'yellow')
  process.exit(0)
} else {
  log('\n✅ Pre-flight check PASSED', 'green')
  log('All systems ready for PM2 deployment!\n', 'green')
  process.exit(0)
}