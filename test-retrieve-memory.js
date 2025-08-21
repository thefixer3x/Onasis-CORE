#!/usr/bin/env node

import OnasisMCPClient from './external-mcp-client.js';

async function testRetrieveMemory() {
  const client = new OnasisMCPClient('ws://localhost:9083/mcp');
  
  try {
    console.log('🔗 Connecting to test memory retrieval...');
    await client.connect();
    
    // Test with the memory ID we just created
    const memoryId = 'b5a43488-563f-4648-bf2d-aeb4d29f5ad2';
    
    console.log(`📝 Retrieving memory with ID: ${memoryId}`);
    const memory = await client.getMemory(memoryId);
    console.log('✅ Retrieved memory:', JSON.stringify(memory, null, 2));
    
    console.log('\n🔍 Testing search for the same memory...');
    const searchResults = await client.searchMemories('External Client Test');
    console.log('✅ Search results:', JSON.stringify(searchResults, null, 2));
    
    console.log('\n📋 Testing list all memories...');
    const allMemories = await client.listMemories({ limit: 5 });
    console.log('✅ Memory list:', JSON.stringify(allMemories, null, 2));
    
    console.log('\n🎯 MEMORY RETRIEVE TEST COMPLETE!');
    
  } catch (error) {
    console.error('❌ Memory retrieve test failed:', error.message);
  } finally {
    client.close();
  }
}

testRetrieveMemory();