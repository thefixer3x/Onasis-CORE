/**
 * Basic Usage Example
 * Demonstrates core functionality of the security service
 */

import { ApiKeyService } from '../index.js';

async function basicExample() {
  // Initialize service
  const apiKeyService = new ApiKeyService();

  // Create an API key
  console.log('Creating API key...');
  const apiKey = await apiKeyService.createApiKey({
    name: 'Test API Key',
    value: 'sk_test_123456789',
    keyType: 'api_key',
    environment: 'development',
    accessLevel: 'team',
    projectId: 'project-uuid',
    tags: ['test'],
    rotationFrequency: 90,
    metadata: {
      service: 'demo'
    }
  }, 'user-uuid');

  console.log('API Key created:', apiKey.id);

  // List API keys
  console.log('Listing API keys...');
  const keys = await apiKeyService.getApiKeys('org-uuid');
  console.log(`Found ${keys.length} API keys`);
}

// Run example
basicExample().catch(console.error);
