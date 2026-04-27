import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load plaintext .env
const plaintext = dotenv.config({ path: '.env' })

const SUPABASE_URL = plaintext.parsed?.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = plaintext.parsed?.SUPABASE_SERVICE_ROLE_KEY

console.log('Testing Supabase Email Configuration')
console.log('====================================')
console.log(`SUPABASE_URL: ${SUPABASE_URL}`)
console.log(`SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY ? '✓ Found' : '✗ Missing'}`)

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('\n✗ Missing required Supabase credentials')
  process.exit(1)
}

try {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  })

  // Test 1: Check Supabase connectivity
  console.log('\n1. Testing Supabase connectivity...')
  const { data, error } = await supabase.auth.admin.listUsers()
  if (error) {
    console.error('  ✗ Connection failed:', error.message)
    process.exit(1)
  }
  console.log('  ✓ Supabase connected successfully')
  console.log(`  Users count: ${data?.users?.length || 0}`)

  // Test 2: Try sending OTP to a test email
  console.log('\n2. Testing OTP sending via Supabase...')
  const testEmail = 'test-otp-' + Date.now() + '@test-lanonasis.com'
  console.log(`  Attempting to send OTP to: ${testEmail}`)
  
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email: testEmail,
    options: {
      shouldCreateUser: true
    }
  })

  if (otpError) {
    console.error('  ✗ OTP send failed:')
    console.error('    Message:', otpError.message)
    console.error('    Status:', otpError.status)
    console.error('    Code:', otpError.code)
    console.error('\n  Diagnosis: Supabase email configuration issue')
    console.error('  Action required: Configure email in Supabase project settings')
  } else {
    console.log('  ✓ OTP sent successfully')
  }

} catch (error) {
  console.error('Error during testing:', error.message)
  process.exit(1)
}
