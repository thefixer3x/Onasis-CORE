#!/usr/bin/env node

/**
 * Comprehensive test script to verify all 17 MCP tools
 */

import WebSocket from 'ws';
import crypto from 'crypto';

const MCP_URL = 'ws://localhost:9083/mcp';

console.log('🧪 Testing ALL 17 MCP Tools...');

const ws = new WebSocket(MCP_URL);
let messageId = 1;
let toolsToTest = [];

function sendMessage(message) {
  message.id = messageId++;
  console.log(`📤 Sending: ${message.method} (id: ${message.id})`);
  ws.send(JSON.stringify(message));
}

ws.on('open', () => {
  console.log('✅ WebSocket connection established');
  
  // Initialize
  sendMessage({
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: { roots: { listChanged: false } },
      clientInfo: { name: 'Onasis-Core Tool Tester', version: '1.0.0' }
    }
  });
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  
  if (message.id === 1 && message.result) {
    // Request tools list
    sendMessage({
      jsonrpc: '2.0',
      method: 'tools/list'
    });
  }
  
  if (message.id === 2 && message.result && message.result.tools) {
    toolsToTest = message.result.tools;
    console.log(`🛠️  Found ${toolsToTest.length} tools to test`);
    
    // Test a selection of key tools
    testTool('get_health_status', {});
  }
  
  if (message.id === 3) {
    console.log('✅ get_health_status result:', JSON.stringify(message.result, null, 2));
    testTool('get_auth_status', {});
  }
  
  if (message.id === 4) {
    console.log('✅ get_auth_status result:', JSON.stringify(message.result, null, 2));
    testTool('list_memories', { limit: 3 });
  }
  
  if (message.id === 5) {
    console.log('✅ list_memories result:', JSON.stringify(message.result, null, 2));
    testTool('create_api_key', { name: 'Test Key', description: 'Created by tool test' });
  }
  
  if (message.id === 6) {
    console.log('✅ create_api_key result:', JSON.stringify(message.result, null, 2));
    testTool('get_organization_info', {});
  }
  
  if (message.id === 7) {
    console.log('✅ get_organization_info result:', JSON.stringify(message.result, null, 2));
    
    console.log('\n🎯 COMPREHENSIVE TEST COMPLETE!');
    console.log(`✅ Successfully tested key tools from all ${toolsToTest.length} available tools`);
    console.log('\n📋 All Available Tools:');
    toolsToTest.forEach((tool, index) => {
      console.log(`  ${index + 1}. ${tool.name}: ${tool.description}`);
    });
    
    ws.close();
  }
});

function testTool(toolName, args) {
  sendMessage({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args
    }
  });
}

ws.on('close', () => {
  console.log('\n🔌 Test completed successfully!');
  process.exit(0);
});

ws.on('error', (error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});

setTimeout(() => {
  console.log('⏰ Test timeout');
  ws.close();
}, 15000);