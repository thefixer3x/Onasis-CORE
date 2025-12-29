#!/usr/bin/env node

/**
 * Test Remote MCP Gateway - Onasis Gateway MCP Endpoint Testing
 * Uses Onasis-CORE memory service patterns to test remote MCP endpoints
 */

import fetch from 'node-fetch';

const REMOTE_MCP_URL = 'http://vps:8080'; // nginx proxy to port 3000
const VPS_DIRECT_URL = 'http://168.231.74.29:8080';
const testResults = [];

class OnasisGatewayClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'Onasis-CORE-MCP-Client/1.0.0'
    };
  }

  async testEndpoint(name, path, options = {}) {
    const startTime = Date.now();
    try {
      console.log(`🧪 Testing: ${name}`);
      
      const url = `${this.baseUrl}${path}`;
      const fetchOptions = {
        method: options.method || 'GET',
        headers: { ...this.defaultHeaders, ...(options.headers || {}) },
        timeout: 10000
      };
      
      if (options.data) {
        fetchOptions.body = JSON.stringify(options.data);
      }
      
      const response = await fetch(url, fetchOptions);
      const data = await response.json();
      
      const responseTime = Date.now() - startTime;
      const result = {
        name,
        status: 'success',
        responseTime: `${responseTime}ms`,
        statusCode: response.status,
        data: data
      };
      
      testResults.push(result);
      console.log(`✅ ${name}: ${response.status} (${responseTime}ms)`);
      
      if (options.validateResponse) {
        options.validateResponse(data);
      }
      
      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const result = {
        name,
        status: 'error', 
        responseTime: `${responseTime}ms`,
        error: error.message,
        statusCode: error.status || 'unknown'
      };
      
      testResults.push(result);
      console.log(`❌ ${name}: ${error.message} (${responseTime}ms)`);
      return result;
    }
  }

  // Memory Service Pattern Methods (adapted for REST API)
  async testHealthStatus() {
    return this.testEndpoint('Health Check', '/health', {
      validateResponse: (data) => {
        if (!data.status || data.status !== 'healthy') {
          throw new Error('Health check failed - status not healthy');
        }
        console.log(`   📊 Adapters: ${data.adapters}, Tools: ${data.totalTools}`);
      }
    });
  }

  async testAdaptersList() {
    return this.testEndpoint('List Adapters', '/api/adapters', {
      validateResponse: (data) => {
        if (!data.adapters || !Array.isArray(data.adapters)) {
          throw new Error('Invalid adapters response format');
        }
        console.log(`   📦 Found ${data.total} adapters`);
        
        // Show first 3 adapters as sample
        data.adapters.slice(0, 3).forEach(adapter => {
          console.log(`     • ${adapter.name}: ${adapter.tools} tools (${adapter.authType})`);
        });
      }
    });
  }

  async testToolsList() {
    return this.testEndpoint('List Tools', '/api/tools', {
      validateResponse: (data) => {
        if (!data.breakdown || typeof data.breakdown !== 'object') {
          throw new Error('Invalid tools response format');
        }
        console.log(`   🛠️  Total tools: ${data.total} across ${data.adapters} adapters`);
      }
    });
  }

  async testSpecificAdapter() {
    return this.testEndpoint('Specific Adapter Info', '/api/adapters/stripe-api-2024-04-10', {
      validateResponse: (data) => {
        if (!data.name || !data.tools) {
          throw new Error('Invalid adapter info response');
        }
        console.log(`   💳 ${data.name}: ${data.tools} tools, auth: ${data.authType}`);
      }
    });
  }

  async testToolExecution() {
    // Test tool execution with mock parameters (will fail auth but test endpoint structure)
    return this.testEndpoint('Tool Execution Test', '/api/execute/stripe-api-2024-04-10/create-customer', {
      method: 'POST',
      data: {
        parameters: {
          email: 'test@onasis-core.com',
          name: 'Onasis MCP Test Customer'
        }
      },
      validateResponse: (data) => {
        // Even with auth failure, we should get a structured error response
        console.log(`   🔧 Tool execution structure: ${typeof data}`);
      }
    });
  }

  // Memory pattern operations adapted for MCP testing
  async searchMemoryPattern() {
    // Test using onasis-core memory search pattern adapted for MCP gateway
    return this.testEndpoint('Memory-Style Search', '/api/adapters?search=payment&limit=5', {
      method: 'GET',
      validateResponse: (data) => {
        const paymentAdapters = data.adapters.filter(adapter => 
          adapter.name.toLowerCase().includes('payment') ||
          adapter.name.toLowerCase().includes('stripe') ||
          adapter.name.toLowerCase().includes('paystack')
        );
        console.log(`   🔍 Found ${paymentAdapters.length} payment-related adapters`);
        
        paymentAdapters.forEach(adapter => {
          console.log(`     💰 ${adapter.name}: ${adapter.tools} tools`);
        });
      }
    });
  }

  async testMCPCompatibilityEndpoints() {
    console.log('\n🔗 Testing MCP Protocol Compatibility...');
    
    // Test endpoints that mirror MCP tool patterns from onasis-core
    const endpoints = [
      { name: 'Root Info', path: '/' },
      { name: 'API Documentation', path: '/api' },
      { name: 'Metrics', path: '/metrics' },
      { name: 'Server Info', path: '/api/info' }
    ];
    
    for (const endpoint of endpoints) {
      await this.testEndpoint(endpoint.name, endpoint.path);
    }
  }
}

// Main test suite using onasis-core patterns
async function runOnasisCoreMCPTests() {
  console.log('🚀 Onasis-CORE Memory Service Pattern → Remote MCP Gateway Test');
  console.log('========================================\n');
  
  // Test both SSH alias and direct IP
  const testUrls = [
    { name: 'VPS SSH Alias', url: REMOTE_MCP_URL },
    { name: 'VPS Direct IP', url: VPS_DIRECT_URL }
  ];
  
  for (const testUrl of testUrls) {
    console.log(`\n🌐 Testing ${testUrl.name}: ${testUrl.url}`);
    console.log('----------------------------------------');
    
    const client = new OnasisGatewayClient(testUrl.url);
    
    // Core MCP endpoints (following onasis-core memory service patterns)
    await client.testHealthStatus();
    await client.testAdaptersList();
    await client.testToolsList();
    await client.testSpecificAdapter();
    
    // Advanced testing (memory service patterns)
    await client.searchMemoryPattern();
    await client.testToolExecution();
    await client.testMCPCompatibilityEndpoints();
  }
  
  // Generate feedback report using onasis-core style reporting
  console.log('\n📋 Test Results Summary (Onasis-CORE Memory Service Style)');
  console.log('===========================================================');
  
  const successCount = testResults.filter(r => r.status === 'success').length;
  const errorCount = testResults.filter(r => r.status === 'error').length;
  const totalCount = testResults.length;
  const successRate = ((successCount / totalCount) * 100).toFixed(1);
  
  console.log(`✅ Success: ${successCount}/${totalCount} (${successRate}%)`);
  console.log(`❌ Errors: ${errorCount}/${totalCount}`);
  
  if (errorCount > 0) {
    console.log('\n🔍 Failed Tests:');
    testResults.filter(r => r.status === 'error').forEach(result => {
      console.log(`   • ${result.name}: ${result.error}`);
    });
  }
  
  // Feedback for onasis-core integration
  console.log('\n💡 Feedback for Onasis-CORE Integration:');
  console.log('=========================================');
  
  if (successRate >= 80) {
    console.log('✅ Remote MCP Gateway is ready for onasis-core integration');
    console.log('✅ Memory service patterns can be adapted for gateway consumption');
    console.log('✅ API structure follows expected MCP conventions');
    
    // Memory service integration recommendations
    console.log('\n📝 Integration Recommendations:');
    console.log('• Add authentication layer for secure memory operations');
    console.log('• Implement rate limiting per memory service patterns');
    console.log('• Add WebSocket support for real-time MCP protocol compliance');
    console.log('• Create adapter for onasis-core memory → gateway tool calls');
  } else {
    console.log('⚠️  Remote MCP Gateway needs improvements before onasis-core integration');
    console.log('⚠️  Review failed endpoints and fix connectivity issues');
  }
  
  // Export results for memory storage
  const feedbackData = {
    timestamp: new Date().toISOString(),
    testSuite: 'onasis-core-mcp-gateway-integration',
    results: testResults,
    summary: {
      success: successCount,
      errors: errorCount,
      total: totalCount,
      successRate: parseFloat(successRate)
    },
    recommendations: {
      ready: successRate >= 80,
      nextSteps: successRate >= 80 ? 'authentication' : 'connectivity'
    }
  };
  
  console.log('\n💾 Feedback data ready for memory storage:', JSON.stringify(feedbackData, null, 2));
  
  return feedbackData;
}

// Enhanced error handling and reporting
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
  process.exit(1);
});

// Run the test suite
if (import.meta.url === `file://${process.argv[1]}`) {
  runOnasisCoreMCPTests()
    .then(() => {
      console.log('\n🎯 Onasis-CORE MCP Gateway Test Complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Test suite failed:', error.message);
      process.exit(1);
    });
}

export default OnasisGatewayClient;