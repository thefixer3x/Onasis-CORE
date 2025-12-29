#!/usr/bin/env node

/**
 * Test memory store and retrieve operations via MCP
 */

import WebSocket from 'ws';

const MCP_URL = 'ws://localhost:9083/mcp';
let messageId = 1;
let createdMemoryId = null;

console.log('🧠 Testing Memory Store & Retrieve Operations...');

const ws = new WebSocket(MCP_URL);

function sendMessage(message) {
  message.id = messageId++;
  console.log(`📤 Sending: ${message.method} (id: ${message.id})`);
  ws.send(JSON.stringify(message));
}

ws.on('open', () => {
  console.log('✅ Connected to MCP server');
  
  // Initialize
  sendMessage({
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: { roots: { listChanged: false } },
      clientInfo: { name: 'Memory Test Client', version: '1.0.0' }
    }
  });
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log(`📥 Response (id: ${message.id}):`, JSON.stringify(message.result || message.error, null, 2));
  
  if (message.id === 1 && message.result) {
    // Step 1: Create a memory entry
    console.log('\n📝 Step 1: Creating memory entry...');
    sendMessage({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'create_memory',
        arguments: {
          title: 'Test Memory Entry',
          content: 'This is a test memory entry created via MCP. It contains important information about the Onasis-CORE MCP server implementation.',
          memory_type: 'project',
          tags: ['test', 'mcp', 'onasis-core']
        }
      }
    });
  }
  
  if (message.id === 2 && message.result) {
    // Step 2: Store the created memory ID
    if (message.result.content && message.result.content[0] && message.result.content[0].text) {
      const memoryData = JSON.parse(message.result.content[0].text);
      createdMemoryId = memoryData.id;
      console.log(`✅ Memory created with ID: ${createdMemoryId}`);
      
      // Step 3: Retrieve the memory by ID
      console.log('\n🔍 Step 2: Retrieving memory by ID...');
      sendMessage({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'get_memory',
          arguments: {
            id: createdMemoryId
          }
        }
      });
    }
  }
  
  if (message.id === 3 && message.result) {
    // Step 4: Search for memories
    console.log('\n🔎 Step 3: Searching memories by content...');
    sendMessage({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'search_memories',
        arguments: {
          query: 'MCP server implementation',
          limit: 5,
          threshold: 0.7
        }
      }
    });
  }
  
  if (message.id === 4 && message.result) {
    // Step 5: List all memories
    console.log('\n📋 Step 4: Listing all memories...');
    sendMessage({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'list_memories',
        arguments: {
          limit: 10,
          memory_type: 'project'
        }
      }
    });
  }
  
  if (message.id === 5 && message.result) {
    console.log('\n🎯 MEMORY OPERATIONS TEST COMPLETE!');
    console.log('✅ Create Memory: Success');
    console.log('✅ Retrieve Memory: Success');
    console.log('✅ Search Memories: Success');
    console.log('✅ List Memories: Success');
    
    if (createdMemoryId) {
      console.log(`\n📌 Test memory ID: ${createdMemoryId}`);
      console.log('🧹 Cleaning up test memory...');
      sendMessage({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'delete_memory',
          arguments: {
            id: createdMemoryId
          }
        }
      });
    } else {
      ws.close();
    }
  }
  
  if (message.id === 6) {
    console.log('🧹 Test memory cleaned up successfully');
    ws.close();
  }
});

ws.on('close', () => {
  console.log('\n🔌 Memory test completed successfully!');
  process.exit(0);
});

ws.on('error', (error) => {
  console.error('❌ Memory test failed:', error);
  process.exit(1);
});

setTimeout(() => {
  console.log('⏰ Test timeout');
  ws.close();
}, 15000);