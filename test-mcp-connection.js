#!/usr/bin/env node

/**
 * Test script to verify MCP WebSocket connection and tool availability
 */

import WebSocket from 'ws';
import crypto from 'crypto';

const MCP_URL = 'ws://localhost:9083/mcp';
const TEST_API_KEY = 'sk-test-1234567890abcdef'; // Test API key

console.log('🧪 Testing MCP WebSocket Connection...');
console.log(`📡 Connecting to: ${MCP_URL}`);

// Create WebSocket connection without API key (test mode)
const ws = new WebSocket(MCP_URL);

ws.on('open', () => {
  console.log('✅ WebSocket connection established');
  
  // Send initialization message
  const initMessage = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {
        roots: {
          listChanged: false
        }
      },
      clientInfo: {
        name: 'Onasis-Core Test Client',
        version: '1.0.0'
      }
    }
  };
  
  console.log('📤 Sending initialization message...');
  ws.send(JSON.stringify(initMessage));
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log('📥 Received message:', JSON.stringify(message, null, 2));
    
    // If this is initialization response, request tools list
    if (message.id === 1 && message.result) {
      console.log('✅ Initialization successful');
      
      const toolsMessage = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list'
      };
      
      console.log('📤 Requesting tools list...');
      ws.send(JSON.stringify(toolsMessage));
    }
    
    // If this is tools list response, display available tools
    if (message.id === 2 && message.result && message.result.tools) {
      console.log('🛠️  Available MCP Tools:');
      message.result.tools.forEach((tool, index) => {
        console.log(`  ${index + 1}. ${tool.name}: ${tool.description}`);
      });
      
      console.log(`📊 Total tools available: ${message.result.tools.length}`);
      
      // Test calling a tool
      if (message.result.tools.length > 0) {
        const testTool = message.result.tools.find(t => t.name === 'search_memories');
        if (testTool) {
          const toolCallMessage = {
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: {
              name: 'search_memories',
              arguments: {
                query: 'test query',
                limit: 5
              }
            }
          };
          
          console.log('🧪 Testing search_memories tool...');
          ws.send(JSON.stringify(toolCallMessage));
        }
      }
    }
    
    // If this is tool call response
    if (message.id === 3) {
      console.log('🎯 Tool call response received');
      ws.close();
    }
    
  } catch (error) {
    console.error('❌ Error parsing message:', error);
    console.log('Raw message:', data.toString());
  }
});

ws.on('close', (code, reason) => {
  console.log(`🔌 Connection closed: ${code} - ${reason}`);
  process.exit(0);
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  process.exit(1);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log('⏰ Test timeout reached');
  ws.close();
}, 10000);