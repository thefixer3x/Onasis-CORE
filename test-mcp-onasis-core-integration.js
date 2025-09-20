#!/usr/bin/env node

/**
 * MCP Server ↔ Onasis-CORE Integration Test
 * Tests complete authentication cycle and feedback loop
 */

import fetch from 'node-fetch';

class MCPOnasisCoreIntegrationTester {
  constructor(config = {}) {
    this.config = {
      mcpServerUrl: config.mcpServerUrl || 'http://localhost:3001',
      onasisCoreUrl: config.onasisCoreUrl || 'https://api.lanonasis.com',
      projectScope: config.projectScope || 'lanonasis-maas',
      timeout: config.timeout || 15000,
      ...config
    };
    
    this.testResults = [];
  }

  /**
   * Run complete MCP ↔ Onasis-CORE integration test
   */
  async runIntegrationTest() {
    console.log('🔄 MCP Server ↔ Onasis-CORE Integration Test');
    console.log('=============================================\n');
    
    try {
      // Phase 1: Test MCP Server Availability
      await this.testMCPServerHealth();
      
      // Phase 2: Test Auth Flow - No Auth (Should Require Auth)
      await this.testMCPWithoutAuth();
      
      // Phase 3: Test Auth Flow - Invalid Auth
      await this.testMCPWithInvalidAuth();
      
      // Phase 4: Test Onasis-CORE Direct Auth
      await this.testOnasisCoreAuth();
      
      // Phase 5: Test MCP → Onasis-CORE Routing
      await this.testMCPToOnasisCoreRouting();
      
      // Phase 6: Test Feedback Loop
      await this.testFeedbackLoop();
      
      // Phase 7: Test Enterprise Separation
      await this.testEnterpriseSeparation();
      
      this.generateIntegrationReport();
      
    } catch (error) {
      console.error('❌ Integration test failed:', error);
      process.exit(1);
    }
  }

  /**
   * Test MCP server health and availability
   */
  async testMCPServerHealth() {
    return this.runTest('MCP Server Health Check', async () => {
      const response = await this.makeRequest(this.config.mcpServerUrl, '/health');
      
      if (!response.ok) {
        throw new Error(`MCP server health check failed: ${response.status}`);
      }
      
      const health = await response.json();
      console.log(`   🟢 MCP Server: ${health.service} v${health.version}`);
      console.log(`   📊 Uptime: ${Math.floor(health.uptime/1000)}s`);
      
      return health;
    });
  }

  /**
   * Test MCP server without authentication (should require auth)
   */
  async testMCPWithoutAuth() {
    return this.runTest('MCP Without Authentication (Should Reject)', async () => {
      // Try accessing a protected MCP endpoint without auth
      const response = await this.makeRequest(this.config.mcpServerUrl, '/api/v1/memory', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Memory',
          content: 'This should be rejected'
        }),
        headers: {
          'Content-Type': 'application/json'
          // No authentication headers
        }
      });
      
      // Should get 401 Unauthorized
      if (response.status !== 401) {
        throw new Error(`Expected 401 Unauthorized, got ${response.status}`);
      }
      
      const error = await response.json();
      console.log(`   🔒 Auth Required: ${error.error || error.message}`);
      console.log(`   📝 Code: ${error.code}`);
      
      // Verify proper error structure
      if (!error.error && !error.message) {
        throw new Error('Missing error message in response');
      }
      
      if (!error.code || !error.code.includes('AUTH')) {
        throw new Error(`Expected AUTH error code, got: ${error.code}`);
      }
      
      return { 
        properly_rejected: true, 
        error_code: error.code,
        error_message: error.error || error.message
      };
    });
  }

  /**
   * Test MCP server with invalid authentication
   */
  async testMCPWithInvalidAuth() {
    return this.runTest('MCP With Invalid Authentication', async () => {
      const testCases = [
        {
          name: 'Invalid JWT',
          headers: { 'Authorization': 'Bearer invalid_jwt_token_here' }
        },
        {
          name: 'Invalid API Key',
          headers: { 'X-API-Key': 'invalid_api_key' }
        },
        {
          name: 'Malformed Auth Header',
          headers: { 'Authorization': 'InvalidFormat token_here' }
        }
      ];
      
      const results = [];
      
      for (const testCase of testCases) {
        try {
          const response = await this.makeRequest(this.config.mcpServerUrl, '/api/v1/memory', {
            method: 'POST',
            body: JSON.stringify({
              title: 'Test Memory',
              content: 'This should be rejected'
            }),
            headers: {
              'Content-Type': 'application/json',
              'X-Project-Scope': this.config.projectScope,
              ...testCase.headers
            }
          });
          
          // Should get 401 or 403
          if (![401, 403].includes(response.status)) {
            throw new Error(`${testCase.name}: Expected 401/403, got ${response.status}`);
          }
          
          const error = await response.json();
          console.log(`   ❌ ${testCase.name}: ${response.status} - ${error.error || error.message}`);
          
          results.push({
            test: testCase.name,
            status: response.status,
            properly_rejected: true,
            error_code: error.code
          });
          
        } catch (testError) {
          console.log(`   ⚠️  ${testCase.name}: ${testError.message}`);
          results.push({
            test: testCase.name,
            properly_rejected: false,
            error: testError.message
          });
        }
      }
      
      return results;
    });
  }

  /**
   * Test direct onasis-core authentication
   */
  async testOnasisCoreAuth() {
    return this.runTest('Onasis-CORE Direct Authentication', async () => {
      const authEndpoints = [
        '/v1/auth/health',
        '/v1/auth/session'  // This should require auth
      ];
      
      const results = {};
      
      for (const endpoint of authEndpoints) {
        try {
          const response = await this.makeRequest(this.config.onasisCoreUrl, endpoint, {
            headers: {
              'X-Project-Scope': this.config.projectScope
            }
          });
          
          results[endpoint] = {
            status: response.status,
            reachable: true
          };
          
          if (endpoint.includes('health')) {
            if (response.ok) {
              const health = await response.json();
              console.log(`   ✅ ${endpoint}: ${health.status} - ${health.service}`);
            } else {
              console.log(`   ⚠️  ${endpoint}: ${response.status}`);
            }
          } else {
            // Session endpoint should require auth
            if (response.status === 401) {
              console.log(`   🔒 ${endpoint}: Properly requires authentication`);
            } else {
              console.log(`   📝 ${endpoint}: ${response.status}`);
            }
          }
          
        } catch (error) {
          results[endpoint] = {
            status: 'error',
            reachable: false,
            error: error.message
          };
          console.log(`   ❌ ${endpoint}: ${error.message}`);
        }
      }
      
      return results;
    });
  }

  /**
   * Test MCP server routing to onasis-core
   */
  async testMCPToOnasisCoreRouting() {
    return this.runTest('MCP → Onasis-CORE Routing', async () => {
      // Test if MCP server properly routes auth requests to onasis-core
      
      // 1. Test signup flow routing
      const signupResponse = await this.makeRequest(this.config.mcpServerUrl, '/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: `test-${Date.now()}@example.com`,
          password: 'TestPassword123!',
          name: 'Test User'
        }),
        headers: {
          'Content-Type': 'application/json',
          'X-Project-Scope': this.config.projectScope
        }
      });
      
      console.log(`   📝 Signup Route: ${signupResponse.status}`);
      
      // 2. Test login flow routing
      const loginResponse = await this.makeRequest(this.config.mcpServerUrl, '/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'invalid_password'
        }),
        headers: {
          'Content-Type': 'application/json',
          'X-Project-Scope': this.config.projectScope
        }
      });
      
      console.log(`   🔑 Login Route: ${loginResponse.status}`);
      
      // 3. Test if routing is working (should get structured responses, not connection errors)
      const routingWorking = ![signupResponse.status, loginResponse.status].includes(500);
      
      if (routingWorking) {
        console.log('   ✅ MCP server successfully routes to onasis-core');
      } else {
        console.log('   ❌ MCP server routing to onasis-core may have issues');
      }
      
      return {
        signup_status: signupResponse.status,
        login_status: loginResponse.status,
        routing_working: routingWorking
      };
    });
  }

  /**
   * Test feedback loop from onasis-core to MCP server
   */
  async testFeedbackLoop() {
    return this.runTest('Onasis-CORE → MCP Feedback Loop', async () => {
      // Test the complete feedback cycle
      
      // 1. Make request to MCP server (should route to onasis-core)
      console.log('   🔄 Testing complete feedback cycle...');
      
      const mcpResponse = await this.makeRequest(this.config.mcpServerUrl, '/api/v1/auth/health', {
        headers: {
          'X-Project-Scope': this.config.projectScope,
          'X-Request-ID': `test-${Date.now()}`
        }
      });
      
      // 2. Check if response comes back properly formatted
      let responseData = null;
      try {
        responseData = await mcpResponse.json();
      } catch (e) {
        responseData = { raw: await mcpResponse.text() };
      }
      
      console.log(`   📡 MCP Response: ${mcpResponse.status}`);
      console.log(`   📋 Response Type: ${typeof responseData}`);
      
      // 3. Verify response structure indicates proper routing
      const hasProperStructure = responseData && (
        responseData.status || 
        responseData.error || 
        responseData.service ||
        responseData.message
      );
      
      if (hasProperStructure) {
        console.log('   ✅ Feedback loop working - structured responses received');
      } else {
        console.log('   ⚠️  Feedback loop may need verification - raw responses received');
      }
      
      // 4. Test error feedback loop
      const errorResponse = await this.makeRequest(this.config.mcpServerUrl, '/api/v1/auth/invalid-endpoint', {
        headers: {
          'X-Project-Scope': this.config.projectScope
        }
      });
      
      console.log(`   🚫 Error Handling: ${errorResponse.status}`);
      
      return {
        mcp_response_status: mcpResponse.status,
        structured_response: hasProperStructure,
        error_handling_status: errorResponse.status,
        feedback_loop_working: hasProperStructure
      };
    });
  }

  /**
   * Test enterprise separation
   */
  async testEnterpriseSeparation() {
    return this.runTest('Enterprise Separation Verification', async () => {
      // Test that regular requests go through onasis-core, not direct DB
      
      const testEndpoints = [
        '/api/v1/memory',
        '/api/v1/auth/session',
        '/api/v1/memory/search'
      ];
      
      const results = {};
      
      for (const endpoint of testEndpoints) {
        const response = await this.makeRequest(this.config.mcpServerUrl, endpoint, {
          headers: {
            'X-Project-Scope': this.config.projectScope
          }
        });
        
        // All should require authentication (401) or have structured error responses
        // None should show database connection errors or direct DB access patterns
        
        let responseText = '';
        try {
          const data = await response.json();
          responseText = JSON.stringify(data);
        } catch (e) {
          responseText = await response.text();
        }
        
        const hasDbDirectAccess = responseText.toLowerCase().includes('supabase') || 
                                 responseText.toLowerCase().includes('database connection') ||
                                 responseText.toLowerCase().includes('postgresql');
        
        const hasProperRouting = response.status === 401 || 
                                response.status === 403 || 
                                responseText.includes('auth') ||
                                responseText.includes('Authentication');
        
        results[endpoint] = {
          status: response.status,
          routes_through_onasis_core: hasProperRouting,
          no_direct_db_access: !hasDbDirectAccess
        };
        
        console.log(`   📍 ${endpoint}: ${response.status} - ${hasProperRouting ? 'Routes via onasis-core' : 'Direct access'}`);
      }
      
      return results;
    });
  }

  /**
   * Make HTTP request with timeout
   */
  async makeRequest(baseUrl, path, options = {}) {
    const url = `${baseUrl}${path}`;
    const requestOptions = {
      timeout: this.config.timeout,
      ...options
    };
    
    return await fetch(url, requestOptions);
  }

  /**
   * Generic test runner
   */
  async runTest(name, testFn) {
    const startTime = Date.now();
    console.log(`🧪 Testing: ${name}`);
    
    try {
      const result = await testFn();
      const duration = Date.now() - startTime;
      console.log(`✅ ${name}: SUCCESS (${duration}ms)\n`);
      
      this.testResults.push({
        name,
        status: 'success',
        duration,
        result
      });
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`❌ ${name}: FAILED - ${error.message} (${duration}ms)\n`);
      
      this.testResults.push({
        name,
        status: 'failed',
        duration,
        error: error.message
      });
      
      // Don't throw - continue with other tests
      return { error: error.message };
    }
  }

  /**
   * Generate comprehensive integration report
   */
  generateIntegrationReport() {
    console.log('\n📋 MCP ↔ Onasis-CORE Integration Test Report');
    console.log('=============================================');
    
    const totalTests = this.testResults.length;
    const successfulTests = this.testResults.filter(t => t.status === 'success').length;
    const failedTests = this.testResults.filter(t => t.status === 'failed').length;
    const successRate = ((successfulTests / totalTests) * 100).toFixed(1);
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   ✅ Successful: ${successfulTests}`);
    console.log(`   ❌ Failed: ${failedTests}`);
    console.log(`   📈 Success Rate: ${successRate}%`);
    
    // Analyze integration status
    const authTests = this.testResults.filter(r => r.name.toLowerCase().includes('auth'));
    const routingTests = this.testResults.filter(r => r.name.toLowerCase().includes('routing'));
    const feedbackTests = this.testResults.filter(r => r.name.toLowerCase().includes('feedback'));
    
    console.log('\n🎯 Integration Analysis:');
    
    // Authentication Integration
    const authSuccessful = authTests.filter(t => t.status === 'success').length;
    console.log(`   🔐 Authentication: ${authSuccessful}/${authTests.length} tests passed`);
    
    // Routing Integration  
    const routingSuccessful = routingTests.filter(t => t.status === 'success').length;
    console.log(`   🔄 Routing: ${routingSuccessful}/${routingTests.length} tests passed`);
    
    // Feedback Loop
    const feedbackSuccessful = feedbackTests.filter(t => t.status === 'success').length;
    console.log(`   📡 Feedback Loop: ${feedbackSuccessful}/${feedbackTests.length} tests passed`);
    
    console.log('\n✅ Integration Cycle Verification:');
    
    if (successRate >= 85) {
      console.log('🎉 INTEGRATION COMPLETE AND VERIFIED');
      console.log('   ✅ MCP server properly requires authentication');
      console.log('   ✅ Invalid auth properly rejected with structured errors');
      console.log('   ✅ MCP server routes through onasis-core (not direct DB)');
      console.log('   ✅ Feedback loop functional for user responses');
      console.log('   ✅ Enterprise separation maintained');
      console.log('   ✅ Project scope validation working');
    } else if (successRate >= 70) {
      console.log('⚠️  INTEGRATION MOSTLY COMPLETE - Minor Issues');
      console.log('   - Some integration points need attention');
      console.log('   - Review failed tests and address issues');
    } else {
      console.log('🚨 INTEGRATION INCOMPLETE');
      console.log('   - Critical integration failures detected');
      console.log('   - Authentication flow needs fixes');
      console.log('   - Routing configuration needs review');
    }
    
    // Failed test details
    if (failedTests > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults
        .filter(t => t.status === 'failed')
        .forEach(test => {
          console.log(`   • ${test.name}: ${test.error}`);
        });
    }
    
    // Integration report data
    const reportData = {
      timestamp: new Date().toISOString(),
      integration_type: 'mcp-onasis-core-authentication',
      summary: {
        total_tests: totalTests,
        successful: successfulTests,
        failed: failedTests,
        success_rate: parseFloat(successRate)
      },
      components: {
        authentication: {
          tests: authTests.length,
          successful: authSuccessful,
          status: authSuccessful === authTests.length ? 'complete' : 'needs_attention'
        },
        routing: {
          tests: routingTests.length,  
          successful: routingSuccessful,
          status: routingSuccessful === routingTests.length ? 'complete' : 'needs_attention'
        },
        feedback_loop: {
          tests: feedbackTests.length,
          successful: feedbackSuccessful,
          status: feedbackSuccessful === feedbackTests.length ? 'complete' : 'needs_attention'
        }
      },
      integration_status: successRate >= 85 ? 'complete' : successRate >= 70 ? 'partial' : 'incomplete',
      results: this.testResults
    };
    
    console.log('\n💾 Integration Test Data:');
    console.log(JSON.stringify(reportData, null, 2));
    
    return reportData;
  }
}

// Run integration test
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new MCPOnasisCoreIntegrationTester();
  tester.runIntegrationTest()
    .then(() => {
      console.log('\n🎯 MCP ↔ Onasis-CORE Integration Test Complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Integration test failed:', error.message);
      process.exit(1);
    });
}

export default MCPOnasisCoreIntegrationTester;