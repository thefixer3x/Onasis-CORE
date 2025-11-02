# AI Services Onboarding Guide

**Version:** 1.0  
**Last Updated:** November 1, 2025

---

## Overview

Integrate with The Fixer Initiative's AI infrastructure:
- **Agent Banks** (6 tables) - AI memory & session management
- **SD-Ghost Protocol** (9 tables) - Memory-as-a-Service with vector search

---

## Agent Banks Integration

### Schema: `agent_banks`

#### Tables
1. **memories** - Core memory storage with vector embeddings
2. **memory_search_logs** - Search history & analytics
3. **sessions** - AI conversation sessions
4. **users** - Agent Banks users
5. **profiles** - User profiles
6. **settings** - User preferences

### Step 1: Create AI Agent User

\`\`\`sql
-- Register AI agent user
INSERT INTO agent_banks.users (
    email,
    full_name,
    metadata
) VALUES (
    'ai-agent@yourapp.com',
    'Your App AI Agent',
    jsonb_build_object(
        'app_id', 'app_your_service',
        'agent_type', 'assistant',
        'capabilities', ARRAY['chat', 'search', 'recommend']
    )
) RETURNING id;
\`\`\`

### Step 2: Store Memories

\`\`\`sql
-- Store conversation memory
INSERT INTO agent_banks.memories (
    user_id,
    memory_type,
    content,
    embedding,
    metadata
) VALUES (
    'agent-user-uuid',
    'conversation',
    'User asked about authentication setup...',
    '[0.1, 0.2, 0.3, ...]'::vector(1536),  -- OpenAI embedding
    jsonb_build_object(
        'app_id', 'app_your_service',
        'conversation_id', 'conv-123',
        'timestamp', NOW(),
        'entities', ARRAY['auth', 'oauth', 'setup']
    )
);
\`\`\`

### Step 3: Vector Search

\`\`\`sql
-- Find similar memories
SELECT 
    id,
    content,
    memory_type,
    1 - (embedding <=> '[query_embedding]'::vector) as similarity
FROM agent_banks.memories
WHERE user_id = 'agent-user-uuid'
ORDER BY embedding <=> '[query_embedding]'::vector
LIMIT 10;
\`\`\`

### Step 4: Track Sessions

\`\`\`sql
-- Create AI session
INSERT INTO agent_banks.sessions (
    user_id,
    session_type,
    status,
    metadata
) VALUES (
    'agent-user-uuid',
    'chat',
    'active',
    jsonb_build_object(
        'app_id', 'app_your_service',
        'context', 'user_onboarding',
        'messages_count', 0
    )
) RETURNING id;

-- Update session
UPDATE agent_banks.sessions
SET 
    status = 'completed',
    metadata = metadata || jsonb_build_object('messages_count', 25)
WHERE id = 'session-uuid';
\`\`\`

---

## SD-Ghost Protocol Integration

### Schema: `app_sd_ghost`

#### Tables
1. **memory_entries** - Persistent memory storage
2. **memory_access_patterns** - Usage analytics
3. **memory_search_analytics** - Search metrics
4. **ai_recommendations** - AI-generated suggestions
5. **ai_response_cache** - Cached AI responses
6. **ai_usage_logs** - API usage tracking
7. **users, profiles, settings** - User management

### Step 1: Store Memory Entry

\`\`\`sql
-- Create memory entry with vector
INSERT INTO app_sd_ghost.memory_entries (
    user_id,
    content,
    embedding,
    memory_type,
    metadata
) VALUES (
    'user-uuid',
    'Complete user authentication guide',
    '[embedding_vector]'::vector(1536),
    'documentation',
    jsonb_build_object(
        'source', 'internal_docs',
        'category', 'authentication',
        'tags', ARRAY['oauth', 'jwt', 'saml']
    )
) RETURNING id;
\`\`\`

### Step 2: Cache AI Responses

\`\`\`sql
-- Cache frequently used responses
INSERT INTO app_sd_ghost.ai_response_cache (
    query_hash,
    query_text,
    response_text,
    model_used,
    expires_at
) VALUES (
    md5('how to setup oauth'),
    'how to setup oauth',
    'To setup OAuth 2.0, follow these steps...',
    'gpt-4',
    NOW() + INTERVAL '24 hours'
) ON CONFLICT (query_hash) 
DO UPDATE SET 
    response_text = EXCLUDED.response_text,
    hit_count = app_sd_ghost.ai_response_cache.hit_count + 1,
    expires_at = EXCLUDED.expires_at;
\`\`\`

### Step 3: Track AI Usage

\`\`\`sql
-- Log AI API calls
INSERT INTO app_sd_ghost.ai_usage_logs (
    user_id,
    operation_type,
    model_name,
    tokens_used,
    cost,
    metadata
) VALUES (
    'user-uuid',
    'completion',
    'gpt-4-turbo',
    1500,
    0.03,
    jsonb_build_object(
        'endpoint', '/v1/chat/completions',
        'prompt_tokens', 500,
        'completion_tokens', 1000
    )
);
\`\`\`

### Step 4: Generate Recommendations

\`\`\`sql
-- Store AI recommendations
INSERT INTO app_sd_ghost.ai_recommendations (
    user_id,
    recommendation_type,
    content,
    confidence_score,
    metadata
) VALUES (
    'user-uuid',
    'next_action',
    'Based on your recent activity, consider setting up SSO',
    0.92,
    jsonb_build_object(
        'reasoning', 'User has configured OAuth, SSO is next logical step',
        'related_docs', ARRAY['/docs/sso-setup', '/docs/saml-config']
    )
);
\`\`\`

---

## Integration Examples

### Node.js (OpenAI SDK)
\`\`\`javascript
import { OpenAI } from 'openai';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function storeMemoryWithEmbedding(userId, content, metadata) {
    // Generate embedding
    const response = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: content
    });
    
    const embedding = response.data[0].embedding;
    
    // Store in Agent Banks
    await sql`
        INSERT INTO agent_banks.memories (
            user_id, content, embedding, metadata
        ) VALUES (
            ${userId},
            ${content},
            ${JSON.stringify(embedding)}::vector(1536),
            ${JSON.stringify(metadata)}::jsonb
        )
    `;
}

async function searchSimilarMemories(userId, query) {
    // Generate query embedding
    const response = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: query
    });
    
    const queryEmbedding = response.data[0].embedding;
    
    // Vector search
    const results = await sql`
        SELECT 
            id,
            content,
            metadata,
            1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
        FROM agent_banks.memories
        WHERE user_id = ${userId}
        ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
        LIMIT 10
    `;
    
    return results;
}
\`\`\`

### Python (LangChain)
\`\`\`python
from langchain.embeddings import OpenAIEmbeddings
from langchain.vectorstores import PGVector
import os

# Initialize
embeddings = OpenAIEmbeddings(openai_api_key=os.getenv('OPENAI_API_KEY'))
connection_string = os.getenv('DATABASE_URL')

# Vector store for Agent Banks
vector_store = PGVector(
    connection_string=connection_string,
    embedding_function=embeddings,
    collection_name='agent_banks_memories',
    table_name='memories'
)

# Store memory
vector_store.add_texts(
    texts=['User asked about OAuth setup'],
    metadatas=[{'app_id': 'app_your_service', 'user_id': 'uuid'}]
)

# Search
results = vector_store.similarity_search('oauth authentication', k=10)
\`\`\`

---

## Environment Variables

\`\`\`bash
# AI Services
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=postgresql://...

# Agent Banks
AGENT_BANKS_SCHEMA=agent_banks
VECTOR_DIMENSIONS=1536

# SD-Ghost
SD_GHOST_SCHEMA=app_sd_ghost
CACHE_TTL_HOURS=24
\`\`\`

---

## Monitoring

### Check AI Usage
\`\`\`sql
-- Daily AI costs
SELECT 
    DATE(created_at) as date,
    COUNT(*) as requests,
    SUM(tokens_used) as total_tokens,
    SUM(cost) as total_cost
FROM app_sd_ghost.ai_usage_logs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
\`\`\`

### Memory Storage Stats
\`\`\`sql
-- Memory growth
SELECT 
    memory_type,
    COUNT(*) as count,
    pg_size_pretty(SUM(length(content))) as content_size
FROM agent_banks.memories
GROUP BY memory_type;
\`\`\`

---

## Support

- **Agent Banks Script:** `/scripts/merge_agent_banks.sql`
- **SD-Ghost Script:** `/scripts/merge_complete_final.sql`
- **Vector Search:** Uses pgvector extension

✅ **AI integration ready!**
