const assert = require('assert');
const { sanitizeRequestBody } = require('../supabase-router');

// Basic unit test for PII stripping
const input = {
  user_id: 'u_123',
  email: 'test@example.com',
  nested: {
    name: 'Alice',
    credit_card: '4111'
  },
  safe: 'keepme'
};

const output = sanitizeRequestBody(input);

assert(!output.user_id, 'user_id should be removed');
assert(!output.email, 'email should be removed');
assert(!output.nested.name, 'nested.name should be removed');
assert(!output.nested.credit_card, 'nested.credit_card should be removed');
assert.strictEqual(output.safe, 'keepme', 'safe field should be preserved');

console.log('sanitize.test.js passed');

