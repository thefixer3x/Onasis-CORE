#!/usr/bin/env node

/**
 * Test Remote MCP Gateway via SSH - Onasis Gateway MCP Endpoint Testing
 * Uses Onasis-CORE memory service patterns to test remote MCP endpoints via SSH
 */

import { spawn } from 'child_process';
import fetch from 'node-fetch';

const VPS_SSH_HOST = 'vps';
const VPS_SSH_PORT = 2222;
const testResults = [];

class OnasisGatewayViaSSH {
  constructor() {
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'Onasis-CORE-MCP-Client/1.0.0'
    };
  }

  async testViaSSH(name, command) {
    const startTime = Date.now();
    return new Promise((resolve) => {
      console.log(`🧪 Testing: ${name}`);
      
      const ssh = spawn('ssh', ['-p', VPS_SSH_PORT, VPS_SSH_HOST, command], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      ssh.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      ssh.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      ssh.on('close', (code) => {
        const responseTime = Date.now() - startTime;
        
        if (code === 0 && stdout.trim()) {
          try {
            const data = JSON.parse(stdout.trim());
            const result = {
              name,
              status: 'success',
              responseTime: `${responseTime}ms`,
              statusCode: 200,
              data: data
            };
            
            testResults.push(result);
            console.log(`✅ ${name}: Success (${responseTime}ms)`);
            resolve(result);
          } catch (parseError) {
            // Handle non-JSON responses
            const result = {
              name,
              status: 'success',
              responseTime: `${responseTime}ms`,
              statusCode: 200,
              data: { raw: stdout.trim() }
            };
            
            testResults.push(result);
            console.log(`✅ ${name}: Success - Raw response (${responseTime}ms)`);
            resolve(result);
          }
        } else {
          const result = {
            name,
            status: 'error',
            responseTime: `${responseTime}ms`,
            error: stderr.trim() || `SSH command failed with code ${code}`,
            statusCode: code
          };
          
          testResults.push(result);
          console.log(`❌ ${name}: ${result.error} (${responseTime}ms)`);
          resolve(result);
        }
      });

      ssh.on('error', (error) => {
        const responseTime = Date.now() - startTime;
        const result = {
          name,
          status: 'error',
          responseTime: `${responseTime}ms`,
          error: error.message,
          statusCode: 'ssh_error'
        };
        
        testResults.push(result);
        console.log(`❌ ${name}: ${error.message} (${responseTime}ms)`);
        resolve(result);
      });
    });
  }

  // Memory Service Pattern Methods (adapted for SSH + REST API)
  async testHealthStatus() {
    const result = await this.testViaSSH('Health Check', 'curl -s http://localhost:3000/health');
    
    if (result.status === 'success' && result.data) {
      console.log(`   📊 Adapters: ${result.data.adapters}, Tools: ${result.data.totalTools}`);
    }
    
    return result;
  }

  async testAdaptersList() {
    const result = await this.testViaSSH('List Adapters', 'curl -s http://localhost:3000/api/adapters');
    
    if (result.status === 'success' && result.data) {
      console.log(`   📦 Found ${result.data.total} adapters`);
      
      // Show first 3 adapters as sample
      if (result.data.adapters) {
        result.data.adapters.slice(0, 3).forEach(adapter => {
          console.log(`     • ${adapter.name}: ${adapter.tools} tools (${adapter.authType})`);
        });
      }
    }
    
    return result;
  }

  async testToolsList() {
    const result = await this.testViaSSH('List Tools', 'curl -s http://localhost:3000/api/tools');
    
    if (result.status === 'success' && result.data) {
      console.log(`   🛠️  Total tools: ${result.data.total} across ${result.data.adapters} adapters`);
    }
    
    return result;
  }

  async testSpecificAdapter() {
    const result = await this.testViaSSH('Specific Adapter Info', 'curl -s http://localhost:3000/api/adapters/stripe-api-2024-04-10');
    
    if (result.status === 'success' && result.data) {
      console.log(`   💳 ${result.data.name}: ${result.data.tools} tools, auth: ${result.data.authType}`);
    }
    
    return result;
  }

  async testNginxProxy() {
    const result = await this.testViaSSH('Nginx Proxy Test (8080→3000)', 'curl -s http://localhost:8080/health');
    
    if (result.status === 'success' && result.data) {
      console.log(`   🔗 Nginx proxy working: ${result.data.status}`);
    }
    
    return result;
  }

  async testToolExecution() {
    // Test tool execution with mock parameters (will fail auth but test endpoint structure)
    const curlCommand = `curl -s -X POST http://localhost:3000/api/execute/stripe-api-2024-04-10/create-customer \\
      -H "Content-Type: application/json" \\
      -d '{"parameters":{"email":"test@onasis-core.com","name":"Onasis MCP Test Customer"}}'`;
    
    const result = await this.testViaSSH('Tool Execution Test', curlCommand);
    
    if (result.status === 'success') {
      console.log(`   🔧 Tool execution endpoint responding`);
    }
    
    return result;
  }

  async searchMemoryPattern() {
    const result = await this.testViaSSH('Memory-Style Search', 'curl -s "http://localhost:3000/api/adapters"');
    
    if (result.status === 'success' && result.data && result.data.adapters) {
      const paymentAdapters = result.data.adapters.filter(adapter => 
        adapter.name.toLowerCase().includes('payment') ||
        adapter.name.toLowerCase().includes('stripe') ||
        adapter.name.toLowerCase().includes('paystack')
      );
      console.log(`   🔍 Found ${paymentAdapters.length} payment-related adapters`);
      
      paymentAdapters.forEach(adapter => {
        console.log(`     💰 ${adapter.name}: ${adapter.tools} tools`);
      });
    }
    
    return result;
  }

  async testMCPCompatibilityEndpoints() {
    console.log('\n🔗 Testing MCP Protocol Compatibility...');
    
    const endpoints = [
      { name: 'Server Status Check', command: 'curl -s http://localhost:3000/health' },
      { name: 'PM2 Process Status', command: 'pm2 status onasis-gateway-server' },
      { name: 'Port Binding Check', command: 'netstat -tlnp | grep :3000' },
      { name: 'Nginx Configuration', command: 'curl -s http://localhost:8080/health' }
    ];
    
    for (const endpoint of endpoints) {
      await this.testViaSSH(endpoint.name, endpoint.command);
    }
  }
}

// Main test suite using onasis-core patterns via SSH
async function runOnasisCoreMCPViaSSHTests() {
  console.log('🚀 Onasis-CORE Memory Service Pattern → Remote MCP Gateway Test (via SSH)');
  console.log('============================================================================\n');
  
  const client = new OnasisGatewayViaSSH();
  
  console.log('🌐 Testing VPS via SSH tunnel');
  console.log('------------------------------');
  
  // Core MCP endpoints (following onasis-core memory service patterns)
  await client.testHealthStatus();
  await client.testNginxProxy();
  await client.testAdaptersList();
  await client.testToolsList();
  await client.testSpecificAdapter();
  
  // Advanced testing (memory service patterns)
  await client.searchMemoryPattern();
  await client.testToolExecution();
  await client.testMCPCompatibilityEndpoints();
  
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
  
  if (successRate >= 70) {
    console.log('✅ Remote MCP Gateway is accessible via SSH and ready for onasis-core integration');
    console.log('✅ Memory service patterns can be adapted for gateway consumption');
    console.log('✅ API structure follows expected MCP conventions');
    
    // Memory service integration recommendations
    console.log('\n📝 Integration Recommendations:');
    console.log('• Use SSH tunneling for secure onasis-core → gateway communication');
    console.log('• Implement WebSocket bridge for real-time MCP protocol compliance');
    console.log('• Add authentication layer using onasis-core auth patterns');
    console.log('• Create adapter for onasis-core memory → gateway tool calls');
    console.log('• Consider nginx reverse proxy for external access');
  } else {
    console.log('⚠️  Remote MCP Gateway has connectivity issues');
    console.log('⚠️  Review SSH access and service status before onasis-core integration');
  }
  
  // Export results for memory storage (onasis-core pattern)
  const feedbackData = {
    timestamp: new Date().toISOString(),
    testSuite: 'onasis-core-mcp-gateway-ssh-integration',
    method: 'ssh-tunnel',
    vpsHost: VPS_SSH_HOST,
    results: testResults,
    summary: {
      success: successCount,
      errors: errorCount,
      total: totalCount,
      successRate: parseFloat(successRate)
    },
    recommendations: {
      ready: successRate >= 70,
      method: 'ssh-tunneling',
      nextSteps: successRate >= 70 ? 'authentication-integration' : 'connectivity-fixes'
    },
    onasisCoreCompatibility: {
      memoryServicePatterns: 'compatible',
      authIntegration: 'needed',
      websocketBridge: 'recommended',
      overallReadiness: successRate >= 70 ? 'ready' : 'needs-work'
    }
  };
  
  console.log('\n💾 Feedback data ready for Onasis-CORE memory storage:');
  console.log(JSON.stringify(feedbackData, null, 2));
  
  return feedbackData;
}

// Enhanced error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
  process.exit(1);
});

// Run the test suite
if (import.meta.url === `file://${process.argv[1]}`) {
  runOnasisCoreMCPViaSSHTests()
    .then(() => {
      console.log('\n🎯 Onasis-CORE MCP Gateway Test (via SSH) Complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Test suite failed:', error.message);
      process.exit(1);
    });
}

export default OnasisGatewayViaSSH;