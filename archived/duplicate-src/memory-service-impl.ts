/**
 * Memory Service Implementation
 * Production-ready implementation of the Memory-as-a-Service core business logic
 * 
 * @module MemoryServiceImpl
 * @version 1.0.0
 * @author Lanonasis Team
 */

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import crypto from 'crypto';
import { Queue } from 'bullmq';
import { OpenAI } from 'openai';
import { encode } from 'gpt-tokenizer';
import pino from 'pino';

// Initialize logger with structured logging
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: 'memory-service',
    version: '1.0.0',
  },
});

// Initialize external services
const supabase = createClient(
  process.env.SUPABASE_URL=https://<project-ref>.supabase.co
  process.env.SUPABASE_SERVICE_KEY=REDACTED_SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Initialize job queue for async processing
const embeddingQueue = new Queue('embedding-jobs', {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
});

/**
 * Content processing utilities
 */
class ContentProcessor {
  private static readonly CHUNK_SIZE = 1500; // tokens
  private static readonly CHUNK_OVERLAP = 200; // tokens
  
  /**
   * Smart text chunking with sentence boundaries
   */
  static chunkText(text: string): string[] {
    const tokens = encode(text);
    const chunks: string[] = [];
    
    if (tokens.length <= this.CHUNK_SIZE) {
      return [text];
    }
    
    // Smart chunking: respect sentence boundaries
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let currentChunk = '';
    let currentTokenCount = 0;
    
    for (const sentence of sentences) {
      const sentenceTokens = encode(sentence).length;
      
      if (currentTokenCount + sentenceTokens > this.CHUNK_SIZE) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = sentence;
        currentTokenCount = sentenceTokens;
      } else {
        currentChunk += ' ' + sentence;
        currentTokenCount += sentenceTokens;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }
  
  /**
   * PII detection and handling
   */
  static handlePII(text: string, strategy: 'redact' | 'flag' | 'none'): {
    text: string;
    piiDetected: boolean;
    piiTypes: string[];
  } {
    const patterns = {
      email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
      ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
      creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
      ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    };
    
    let processedText = text;
    const detectedTypes: string[] = [];
    
    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) {
        detectedTypes.push(type);
        
        if (strategy === 'redact') {
          processedText = processedText.replace(pattern, '[REDACTED]');
        } else if (strategy === 'flag') {
          processedText = processedText.replace(pattern, (match) => `[PII:${type}:${match}]`);
        }
      }
    }
    
    return {
      text: processedText,
      piiDetected: detectedTypes.length > 0,
      piiTypes: detectedTypes,
    };
  }
  
  /**
   * Generate content hash for deduplication
   */
  static generateHash(content: string): string {
    return crypto
      .createHash('sha256')
      .update(content.toLowerCase().replace(/\s+/g, ' ').trim())
      .digest('hex');
  }
}

/**
 * Embedding service integration
 */
class EmbeddingService {
  private static readonly MODEL = 'text-embedding-3-large';
  private static readonly DIMENSIONS = 1536;
  
  /**
   * Generate embeddings using OpenAI
   */
  static async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await openai.embeddings.create({
        model: this.MODEL,
        input: text,
        dimensions: this.DIMENSIONS,
      });
      
      return response.data[0].embedding;
    } catch (error) {
      logger.error({ error }, 'Failed to generate embedding');
      throw new Error('Embedding generation failed');
    }
  }
  
  /**
   * Batch embedding generation with rate limiting
   */
  static async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    const batchSize = 100; // OpenAI batch limit
    const embeddings: number[][] = [];
    
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      try {
        const response = await openai.embeddings.create({
          model: this.MODEL,
          input: batch,
          dimensions: this.DIMENSIONS,
        });
        
        embeddings.push(...response.data.map(d => d.embedding));
        
        // Rate limiting: 3000 RPM for tier 2
        if (i + batchSize < texts.length) {
          await new Promise(resolve => setTimeout(resolve, 20)); // 20ms delay
        }
      } catch (error) {
        logger.error({ error, batch: i }, 'Batch embedding failed');
        throw error;
      }
    }
    
    return embeddings;
  }
}

/**
 * Main Memory Service Implementation
 */
export class MemoryServiceImpl {
  /**
   * Ingest content into memory system
   */
  async ingest(params: {
    tenant_id: string;
    content: any;
    metadata?: any;
    pii_handling?: 'redact' | 'flag' | 'none';
    chunk?: boolean;
  }): Promise<{
    entry_id: string;
    chunks_created: number;
    tokens_processed: number;
    job_id?: string;
  }> {
    const startTime = Date.now();
    const traceId = crypto.randomUUID();
    
    logger.info({
      traceId,
      tenant_id: params.tenant_id,
      method: 'ingest',
      pii_handling: params.pii_handling,
      chunk: params.chunk,
    }, 'Starting content ingestion');
    
    try {
      // Extract text content based on input type
      let rawText = '';
      
      if (typeof params.content === 'string') {
        rawText = params.content;
      } else if (params.content.messages) {
        rawText = params.content.messages
          .map((m: any) => `${m.role}: ${m.content}`)
          .join('\n');
      } else if (params.content.file_ref) {
        // TODO: Implement file processing
        throw new Error('File processing not yet implemented');
      }
      
      // Handle PII if requested
      const piiResult = ContentProcessor.handlePII(
        rawText,
        params.pii_handling || 'none'
      );
      
      const processedText = piiResult.text;
      
      // Generate content hash for deduplication
      const contentHash = ContentProcessor.generateHash(processedText);
      
      // Check for existing content
      const { data: existing } = await supabase
        .from('memory_entries')
        .select('id')
        .eq('content_hash', contentHash)
        .eq('tenant_id', params.tenant_id)
        .single();
      
      if (existing) {
        logger.info({
          traceId,
          entry_id: existing.id,
          duplicate: true,
        }, 'Content already exists');
        
        return {
          entry_id: existing.id,
          chunks_created: 0,
          tokens_processed: 0,
        };
      }
      
      // Create memory entry
      const { data: entry, error: entryError } = await supabase
        .from('memory_entries')
        .insert({
          tenant_id: params.tenant_id,
          source: params.metadata?.source || 'api',
          raw_text: processedText,
          content_hash: contentHash,
          embedding_version: '3-large-1536',
          metadata: {
            ...params.metadata,
            pii_detected: piiResult.piiDetected,
            pii_types: piiResult.piiTypes,
            ingested_at: new Date().toISOString(),
          },
        })
        .select()
        .single();
      
      if (entryError) {
        throw entryError;
      }
      
      // Chunk if requested
      const chunks = params.chunk !== false
        ? ContentProcessor.chunkText(processedText)
        : [processedText];
      
      // Calculate tokens
      const tokensProcessed = chunks.reduce(
        (sum, chunk) => sum + encode(chunk).length,
        0
      );
      
      // Queue embedding generation
      const jobId = crypto.randomUUID();
      
      await embeddingQueue.add('generate-embeddings', {
        entry_id: entry.id,
        tenant_id: params.tenant_id,
        chunks,
        metadata: params.metadata,
      }, {
        jobId,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      });
      
      const duration = Date.now() - startTime;
      
      logger.info({
        traceId,
        entry_id: entry.id,
        chunks_created: chunks.length,
        tokens_processed: tokensProcessed,
        job_id: jobId,
        duration_ms: duration,
      }, 'Content ingestion completed');
      
      return {
        entry_id: entry.id,
        chunks_created: chunks.length,
        tokens_processed: tokensProcessed,
        job_id: jobId,
      };
      
    } catch (error) {
      logger.error({
        traceId,
        error,
      }, 'Content ingestion failed');
      
      throw error;
    }
  }
  
  /**
   * Retrieve similar content using vector search
   */
  async retrieve(params: {
    tenant_id: string;
    query: string;
    top_k?: number;
    filters?: any;
    with_summaries?: boolean;
  }): Promise<{
    results: Array<{
      entry_id: string;
      chunk_id: string;
      content: string;
      score: number;
      metadata: any;
    }>;
    query_embedding?: number[];
  }> {
    const startTime = Date.now();
    const traceId = crypto.randomUUID();
    
    logger.info({
      traceId,
      tenant_id: params.tenant_id,
      method: 'retrieve',
      top_k: params.top_k,
    }, 'Starting content retrieval');
    
    try {
      // Generate query embedding
      const queryEmbedding = await EmbeddingService.generateEmbedding(params.query);
      
      // Perform vector search using pgvector
      const { data: results, error } = await supabase.rpc('search_memories', {
        query_embedding: queryEmbedding,
        search_tenant_id: params.tenant_id,
        match_count: params.top_k || 10,
        filter_tags: params.filters?.tags || null,
        min_score: params.filters?.min_score || 0.7,
      });
      
      if (error) {
        throw error;
      }
      
      const duration = Date.now() - startTime;
      
      logger.info({
        traceId,
        results_count: results?.length || 0,
        duration_ms: duration,
      }, 'Content retrieval completed');
      
      return {
        results: results || [],
        query_embedding: queryEmbedding,
      };
      
    } catch (error) {
      logger.error({
        traceId,
        error,
      }, 'Content retrieval failed');
      
      throw error;
    }
  }
  
  /**
   * Build formatted context from retrieved results
   */
  async buildContext(params: {
    tenant_id: string;
    results: any[];
    style?: 'narrative' | 'bullets' | 'numbered';
    max_tokens?: number;
  }): Promise<{
    context: string;
    citations: any[];
    token_count: number;
  }> {
    const maxTokens = params.max_tokens || 2000;
    let currentTokens = 0;
    const includedResults: any[] = [];
    const citations: any[] = [];
    
    // Build context respecting token limit
    for (const result of params.results) {
      const resultTokens = encode(result.content).length;
      
      if (currentTokens + resultTokens > maxTokens) {
        break;
      }
      
      includedResults.push(result);
      currentTokens += resultTokens;
      
      citations.push({
        entry_id: result.entry_id,
        chunk_id: result.chunk_id,
        source: result.metadata?.source,
        score: result.score,
      });
    }
    
    // Format context based on style
    let context = '';
    
    switch (params.style) {
      case 'bullets':
        context = includedResults
          .map(r => `• ${r.content}`)
          .join('\n\n');
        break;
        
      case 'numbered':
        context = includedResults
          .map((r, i) => `${i + 1}. ${r.content}`)
          .join('\n\n');
        break;
        
      default: // narrative
        context = includedResults
          .map(r => r.content)
          .join('\n\n---\n\n');
    }
    
    return {
      context,
      citations,
      token_count: currentTokens,
    };
  }
  
  /**
   * Delete memory entries
   */
  async delete(params: {
    tenant_id: string;
    entry_ids?: string[];
    filters?: any;
  }): Promise<{
    deleted_count: number;
    failed_ids: string[];
  }> {
    try {
      let query = supabase
        .from('memory_entries')
        .delete()
        .eq('tenant_id', params.tenant_id);
      
      if (params.entry_ids && params.entry_ids.length > 0) {
        query = query.in('id', params.entry_ids);
      }
      
      if (params.filters?.tags) {
        query = query.contains('tags', params.filters.tags);
      }
      
      if (params.filters?.before) {
        query = query.lt('created_at', params.filters.before);
      }
      
      const { data, error } = await query.select('id');
      
      if (error) {
        throw error;
      }
      
      return {
        deleted_count: data?.length || 0,
        failed_ids: [],
      };
      
    } catch (error) {
      logger.error({ error }, 'Memory deletion failed');
      throw error;
    }
  }
  
  /**
   * Update embedding versions
   */
  async reembed(params: {
    tenant_id: string;
    target_version: string;
    entry_ids?: string[];
  }): Promise<{
    job_id: string;
    entries_queued: number;
  }> {
    const jobId = crypto.randomUUID();
    
    // Get entries needing re-embedding
    let query = supabase
      .from('memory_entries')
      .select('id, raw_text')
      .eq('tenant_id', params.tenant_id)
      .neq('embedding_version', params.target_version);
    
    if (params.entry_ids) {
      query = query.in('id', params.entry_ids);
    }
    
    const { data: entries, error } = await query;
    
    if (error) {
      throw error;
    }
    
    // Queue re-embedding jobs
    for (const entry of entries || []) {
      await embeddingQueue.add('reembed-entry', {
        entry_id: entry.id,
        tenant_id: params.tenant_id,
        text: entry.raw_text,
        target_version: params.target_version,
      }, {
        jobId: `${jobId}-${entry.id}`,
      });
    }
    
    return {
      job_id: jobId,
      entries_queued: entries?.length || 0,
    };
  }
}
