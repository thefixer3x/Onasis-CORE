:/$ apply_patch <<'EOF'
*** Begin Patch
*** Add File: apps/onasis-core/supabase/migrations/004_memory_enhancements.sql
+-- Migration 004_memory_enhancements.sql
+--
+-- This migration augments the existing memory architecture to support
+-- explicit ingest and retrieval paths. It introduces a dedicated vector
+-- store table (maas.memory_vectors) and extends the relational table
+-- (maas.memory_entries) with additional metadata required by the audit.
+--
+-- Key features:
+--  * Adds columns to maas.memory_entries: source, raw_text, content_hash,
+--    embedding_version and extends metadata to include PII flags. A unique
+--    index on content_hash ensures deduplication.
+--  * Creates maas.memory_vectors, a vector‑store table tied to
+--    maas.memory_entries with per‑chunk embeddings. It includes tenant
+--    scoping, tags, score_fields and an HNSW index for ANN search.
+--  * Adds a timestamp column to memory_vectors for auditing chunk
+--    creation time.
+--  * Establishes row level security (RLS) policies that enforce tenant
+--    scoping while allowing organization administrators to access all
+--    vectors belonging to their organisation. It assumes that the JWT
+--    claims include `tenant_id` and `is_org_admin` flags. Adjust this
+--    logic if your auth implementation differs.
+--
+-- To apply this migration run:
+--   supabase db push
+
+-- Ensure the extensions are available
+CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
+CREATE EXTENSION IF NOT EXISTS vector;
+
+-- 1. Extend the maas.memory_entries table
+DO $$
+BEGIN
+    IF NOT EXISTS (
+        SELECT 1
+        FROM information_schema.columns
+        WHERE table_schema = 'maas'
+          AND table_name   = 'memory_entries'
+          AND column_name  = 'source'
+    ) THEN
+        ALTER TABLE maas.memory_entries
+            ADD COLUMN source TEXT NOT NULL DEFAULT 'chat';
+    END IF;
+
+    IF NOT EXISTS (
+        SELECT 1
+        FROM information_schema.columns
+        WHERE table_schema = 'maas'
+          AND table_name   = 'memory_entries'
+          AND column_name  = 'raw_text'
+    ) THEN
+        ALTER TABLE maas.memory_entries
+            ADD COLUMN raw_text TEXT;
+    END IF;
+
+    IF NOT EXISTS (
+        SELECT 1
+        FROM information_schema.columns
+        WHERE table_schema = 'maas'
+          AND table_name   = 'memory_entries'
+          AND column_name  = 'content_hash'
+    ) THEN
+        ALTER TABLE maas.memory_entries
+            ADD COLUMN content_hash TEXT;
+        -- Unique constraint for deduplication
+        CREATE UNIQUE INDEX IF NOT EXISTS idx_maas_memory_entries_content_hash
+            ON maas.memory_entries (content_hash);
+    END IF;
+
+    IF NOT EXISTS (
+        SELECT 1
+        FROM information_schema.columns
+        WHERE table_schema = 'maas'
+          AND table_name   = 'memory_entries'
+          AND column_name  = 'embedding_version'
+    ) THEN
+        ALTER TABLE maas.memory_entries
+            ADD COLUMN embedding_version TEXT NOT NULL DEFAULT 'unknown';
+    END IF;
+
+    -- Ensure metadata column exists (optional)
+    IF NOT EXISTS (
+        SELECT 1
+        FROM information_schema.columns
+        WHERE table_schema = 'maas'
+          AND table_name   = 'memory_entries'
+          AND column_name  = 'metadata'
+    ) THEN
+        ALTER TABLE maas.memory_entries
+            ADD COLUMN metadata JSONB;
+    END IF;
+END;
+$$;
+
+-- 2. Create the maas.memory_vectors table if it doesn't exist
+CREATE TABLE IF NOT EXISTS maas.memory_vectors (
+    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
+    entry_id UUID NOT NULL REFERENCES maas.memory_entries(id) ON DELETE CASCADE,
+    chunk_id INTEGER NOT NULL,
+    embedding vector(1536),
+    tenant_id UUID NOT NULL REFERENCES maas.organizations(id) ON DELETE CASCADE,
+    tags TEXT[] DEFAULT '{}',
+    score_fields JSONB DEFAULT '{}'::jsonb,
+    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
+    -- timestamp column to track chunk creation time; separate from created_at for clarity
+    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
+    UNIQUE (entry_id, chunk_id)
+);
+
+-- Indices for performance and filtering
+CREATE INDEX IF NOT EXISTS idx_maas_memory_vectors_entry_id
+    ON maas.memory_vectors(entry_id);
+
+CREATE INDEX IF NOT EXISTS idx_maas_memory_vectors_tenant_id
+    ON maas.memory_vectors(tenant_id);
+
+CREATE INDEX IF NOT EXISTS idx_maas_memory_vectors_tags
+    ON maas.memory_vectors USING GIN(tags);
+
+-- HNSW index for efficient ANN search. Adjust parameters as needed.
+CREATE INDEX IF NOT EXISTS idx_maas_memory_vectors_embedding
+    ON maas.memory_vectors USING hnsw (embedding vector_cosine_ops)
+    WITH (m = 16, ef_construction = 64);
+
+-- 3. RLS configuration
+ALTER TABLE maas.memory_vectors ENABLE ROW LEVEL SECURITY;
+
+-- Policy allowing users to read vectors for their tenant. If the JWT claim
+-- includes is_org_admin = true, grant access to all vectors in the same organisation.
+-- Adjust the JSON path to match your auth scheme.
+DROP POLICY IF EXISTS "Users can view their memory vectors" ON maas.memory_vectors;
+CREATE POLICY "Users can view their memory vectors" ON maas.memory_vectors
+    FOR SELECT USING (
+        -- org admins can see all vectors in their organisation
+        (current_setting('request.jwt.claims', true)::jsonb->>'is_org_admin' = 'true'
+         AND tenant_id::text = (current_setting('request.jwt.claims', true)::jsonb->>'tenant_id'))
+        OR
+        -- regular users must match tenant_id
+        (current_setting('request.jwt.claims', true)::jsonb->>'tenant_id' = tenant_id::text)
+    );
+
+-- Policy allowing users to manage their own vectors (insert/update/delete). Org admins
+-- can manage all vectors in their organisation.
+DROP POLICY IF EXISTS "Users can manage their memory vectors" ON maas.memory_vectors;
+CREATE POLICY "Users can manage their memory vectors" ON maas.memory_vectors
+    FOR ALL USING (
+        (current_setting('request.jwt.claims', true)::jsonb->>'is_org_admin' = 'true'
+         AND tenant_id::text = (current_setting('request.jwt.claims', true)::jsonb->>'tenant_id'))
+        OR
+        (current_setting('request.jwt.claims', true)::jsonb->>'tenant_id' = tenant_id::text)
+    );
+
+-- 4. Ensure memory_entries RLS uses tenant_id from JWT
+ALTER TABLE maas.memory_entries ENABLE ROW LEVEL SECURITY;
+DROP POLICY IF EXISTS "Users can read their memory entries" ON maas.memory_entries;
+CREATE POLICY "Users can read their memory entries" ON maas.memory_entries
+    FOR SELECT USING (
+        current_setting('request.jwt.claims', true)::jsonb->>'tenant_id' = tenant_id::text
+    );
+
+DROP POLICY IF EXISTS "Users can manage their memory entries" ON maas.memory_entries;
+CREATE POLICY "Users can manage their memory entries" ON maas.memory_entries
+    FOR ALL USING (
+        current_setting('request.jwt.claims', true)::jsonb->>'tenant_id' = tenant_id::text
+    );
*** End Patch
EOF


:/$ apply_patch <<'EOF'
*** Begin Patch
*** Add File: apps/onasis-mcp-server/src/types/extended-memory.ts
+/*
+ * Extended memory types and schemas.
+ *
+ * This module extends the base memory types with additional fields
+ * required by the audit and provides Zod schemas for request/response
+ * validation. These types are consumed by the memory API routes and
+ * the MemoryService. Keeping these definitions in one place helps
+ * ensure consistency across the system and reduces duplication.
+ */
+
+import { z } from 'zod';
+
+// PII flags type (e.g. redacted fields). Extend this enum as needed.
+export const PiiFlagEnum = z.enum(['none', 'flag', 'redacted']);
+export type PiiFlag = z.infer<typeof PiiFlagEnum>;
+
+// Interface describing an extended memory entry stored in maas.memory_entries
+export interface ExtendedMemoryEntry {
+  id: string;
+  tenant_id: string;
+  source: string;
+  raw_text: string | null;
+  clean_text: string;
+  content_hash: string | null;
+  embedding_version: string;
+  metadata: Record<string, unknown> | null;
+  created_by: string;
+  created_at: string;
+}
+
+// Represents a chunk stored in maas.memory_vectors. It links back to its
+// parent entry and contains the embedding and associated metadata.
+export interface MemoryChunk {
+  id: string;
+  entry_id: string;
+  chunk_id: number;
+  embedding: number[] | null;
+  tenant_id: string;
+  tags: string[];
+  score_fields: Record<string, unknown>;
+  created_at: string;
+  timestamp: string;
+}
+
+// API request and response schemas
+
+export const IngestRequestSchema = z.object({
+  text: z.string().optional(),
+  messages: z
+    .array(
+      z.object({
+        role: z.enum(['user', 'assistant', 'system']).optional(),
+        content: z.string(),
+      })
+    )
+    .optional(),
+  file_ref: z.string().optional(),
+  source: z.string().optional(),
+  tenant_id: z.string(),
+  tags: z.array(z.string()).optional(),
+  pii_handling: z.enum(['redact', 'flag', 'none']).optional(),
+  chunk: z.boolean().optional().default(true),
+});
+export type IngestRequest = z.infer<typeof IngestRequestSchema>;
+
+export const IngestResponseSchema = z.object({
+  entry_ids: z.array(z.string()),
+  chunks: z.array(
+    z.object({
+      chunk_id: z.number(),
+      text: z.string(),
+      embedding_version: z.string(),
+    })
+  ),
+  embedding_version: z.string(),
+});
+export type IngestResponse = z.infer<typeof IngestResponseSchema>;
+
+export const ReembedRequestSchema = z.object({
+  entry_ids: z.array(z.string()).optional(),
+  filters: z.record(z.any()).optional(),
+  target_embedding_version: z.string(),
+});
+export type ReembedRequest = z.infer<typeof ReembedRequestSchema>;
+
+export const ReembedResponseSchema = z.object({
+  job_id: z.string(),
+  status: z.string(),
+});
+export type ReembedResponse = z.infer<typeof ReembedResponseSchema>;
+
+export const RetrieveRequestSchema = z.object({
+  query: z.string(),
+  top_k: z.number().optional(),
+  filters: z.record(z.any()).optional(),
+  with_summaries: z.boolean().optional(),
+});
+export type RetrieveRequest = z.infer<typeof RetrieveRequestSchema>;
+
+export const RetrieveContextResultSchema = z.object({
+  text: z.string(),
+  entry_id: z.string(),
+  chunk_id: z.number(),
+  score: z.number(),
+  source: z.string().optional(),
+  uri: z.string().optional().nullable(),
+  title: z.string().optional().nullable(),
+});
+export type RetrieveContextResult = z.infer<typeof RetrieveContextResultSchema>;
+
+export const RetrieveResponseSchema = z.object({
+  context: z.array(RetrieveContextResultSchema),
+  prompt_tokens_estimate: z.number(),
+});
+export type RetrieveResponse = z.infer<typeof RetrieveResponseSchema>;
+
+export const ContextRequestSchema = z.object({
+  query: z.string(),
+  max_tokens: z.number().optional(),
+  style: z.enum(['qa', 'rewrite', 'code']).optional(),
+  policy: z.enum(['strict', 'generous']).optional(),
+  filters: z.record(z.any()).optional(),
+});
+export type ContextRequest = z.infer<typeof ContextRequestSchema>;
+
+export const ContextResponseCitationsSchema = z.object({
+  entry_id: z.string(),
+  chunk_id: z.number(),
+  uri: z.string().optional().nullable(),
+});
+export type ContextResponseCitations = z.infer<typeof ContextResponseCitationsSchema>;
+
+export const ContextResponseSchema = z.object({
+  prompt_context: z.string(),
+  citations: z.array(ContextResponseCitationsSchema),
+});
+export type ContextResponse = z.infer<typeof ContextResponseSchema>;
+
+export const FeedbackRequestSchema = z.object({
+  entry_id: z.string(),
+  useful: z.boolean(),
+  notes: z.string().optional(),
+});
+export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;
+
+export const FeedbackResponseSchema = z.object({
+  success: z.boolean(),
+  message: z.string(),
+});
+export type FeedbackResponse = z.infer<typeof FeedbackResponseSchema>;
+
+export const DeletePurgeRequestSchema = z.object({
+  entry_ids: z.array(z.string()).optional(),
+  filters: z.record(z.any()).optional(),
+  purge: z.boolean().optional(),
+});
+export type DeletePurgeRequest = z.infer<typeof DeletePurgeRequestSchema>;
+
+export const DeletePurgeResponseSchema = z.object({
+  deleted_count: z.number(),
+  failed_ids: z.array(z.string()).optional(),
+  job_id: z.string().optional(),
+});
+export type DeletePurgeResponse = z.infer<typeof DeletePurgeResponseSchema>;
+
+// Utility schema to validate the extended memory entry when returning from the API
+export const ExtendedMemoryEntrySchema = z.object({
+  id: z.string(),
+  tenant_id: z.string(),
+  source: z.string(),
+  raw_text: z.string().nullable(),
+  clean_text: z.string(),
+  content_hash: z.string().nullable(),
+  embedding_version: z.string(),
+  metadata: z.record(z.any()).nullable(),
+  created_by: z.string(),
+  created_at: z.string(),
+});
+export type ExtendedMemoryEntryResponse = z.infer<typeof ExtendedMemoryEntrySchema>;
*** End Patch
EOF


:/$ apply_patch <<'EOF'
*** Begin Patch
*** Add File: apps/onasis-mcp-server/src/routes/memory.ts
+/*
+ * Memory API routes.
+ *
+ * This module defines HTTP route handlers for the memory service
+ * endpoints described in the architecture plan: ingest, reembed,
+ * retrieve, context, feedback, entry retrieval and delete/purge.
+ *
+ * Each handler uses Zod schemas to validate the request body and
+ * delegates to a MemoryService (assumed to be implemented elsewhere)
+ * for the core logic. Responses are returned in a consistent JSON
+ * format. Errors are caught and reported with a 400 status.
+ */
+
+import { Router, Request, Response } from 'express';
+import {
+  IngestRequestSchema,
+  IngestResponseSchema,
+  ReembedRequestSchema,
+  ReembedResponseSchema,
+  RetrieveRequestSchema,
+  RetrieveResponseSchema,
+  ContextRequestSchema,
+  ContextResponseSchema,
+  FeedbackRequestSchema,
+  FeedbackResponseSchema,
+  DeletePurgeRequestSchema,
+  DeletePurgeResponseSchema,
+  ExtendedMemoryEntrySchema,
+} from '../types/extended-memory';
+
+// Placeholder MemoryService interface; implement in service layer
+interface MemoryService {
+  ingest: (req: any, user: any) => Promise<any>;
+  reembed: (req: any, user: any) => Promise<any>;
+  retrieve: (req: any, user: any) => Promise<any>;
+  context: (req: any, user: any) => Promise<any>;
+  getEntry: (id: string, user: any) => Promise<any>;
+  feedback: (req: any, user: any) => Promise<any>;
+  deleteOrPurge: (req: any, user: any) => Promise<any>;
+}
+
+export default function createMemoryRouter(memoryService: MemoryService) {
+  const router = Router();
+
+  // Utility to extract user from request (assumes JWT claims have been
+  // parsed upstream and attached to req.user). Adjust as needed.
+  function getUser(req: Request) {
+    return (req as any).user || {};
+  }
+
+  // POST /ingest
+  router.post('/ingest', async (req: Request, res: Response) => {
+    try {
+      const parseResult = IngestRequestSchema.safeParse(req.body);
+      if (!parseResult.success) {
+        return res.status(400).json({ error: parseResult.error.errors });
+      }
+      const result = await memoryService.ingest(parseResult.data, getUser(req));
+      const validation = IngestResponseSchema.safeParse(result);
+      if (!validation.success) {
+        return res.status(500).json({ error: 'Invalid ingest response shape' });
+      }
+      return res.json(validation.data);
+    } catch (err: any) {
+      return res.status(400).json({ error: err.message });
+    }
+  });
+
+  // POST /reembed
+  router.post('/reembed', async (req: Request, res: Response) => {
+    try {
+      const parseResult = ReembedRequestSchema.safeParse(req.body);
+      if (!parseResult.success) {
+        return res.status(400).json({ error: parseResult.error.errors });
+      }
+      const result = await memoryService.reembed(parseResult.data, getUser(req));
+      const validation = ReembedResponseSchema.safeParse(result);
+      if (!validation.success) {
+        return res.status(500).json({ error: 'Invalid reembed response shape' });
+      }
+      return res.json(validation.data);
+    } catch (err: any) {
+      return res.status(400).json({ error: err.message });
+    }
+  });
+
+  // POST /retrieve
+  router.post('/retrieve', async (req: Request, res: Response) => {
+    try {
+      const parseResult = RetrieveRequestSchema.safeParse(req.body);
+      if (!parseResult.success) {
+        return res.status(400).json({ error: parseResult.error.errors });
+      }
+      const result = await memoryService.retrieve(parseResult.data, getUser(req));
+      const validation = RetrieveResponseSchema.safeParse(result);
+      if (!validation.success) {
+        return res.status(500).json({ error: 'Invalid retrieve response shape' });
+      }
+      return res.json(validation.data);
+    } catch (err: any) {
+      return res.status(400).json({ error: err.message });
+    }
+  });
+
+  // POST /context
+  router.post('/context', async (req: Request, res: Response) => {
+    try {
+      const parseResult = ContextRequestSchema.safeParse(req.body);
+      if (!parseResult.success) {
+        return res.status(400).json({ error: parseResult.error.errors });
+      }
+      const result = await memoryService.context(parseResult.data, getUser(req));
+      const validation = ContextResponseSchema.safeParse(result);
+      if (!validation.success) {
+        return res.status(500).json({ error: 'Invalid context response shape' });
+      }
+      return res.json(validation.data);
+    } catch (err: any) {
+      return res.status(400).json({ error: err.message });
+    }
+  });
+
+  // GET /entries/:id
+  router.get('/entries/:id', async (req: Request, res: Response) => {
+    try {
+      const { id } = req.params;
+      const result = await memoryService.getEntry(id, getUser(req));
+      const validation = ExtendedMemoryEntrySchema.safeParse(result);
+      if (!validation.success) {
+        return res.status(500).json({ error: 'Invalid entry response shape' });
+      }
+      return res.json(validation.data);
+    } catch (err: any) {
+      return res.status(400).json({ error: err.message });
+    }
+  });
+
+  // POST /feedback
+  router.post('/feedback', async (req: Request, res: Response) => {
+    try {
+      const parseResult = FeedbackRequestSchema.safeParse(req.body);
+      if (!parseResult.success) {
+        return res.status(400).json({ error: parseResult.error.errors });
+      }
+      const result = await memoryService.feedback(parseResult.data, getUser(req));
+      const validation = FeedbackResponseSchema.safeParse(result);
+      if (!validation.success) {
+        return res.status(500).json({ error: 'Invalid feedback response shape' });
+      }
+      return res.json(validation.data);
+    } catch (err: any) {
+      return res.status(400).json({ error: err.message });
+    }
+  });
+
+  // POST /delete or /purge
+  router.post(['/delete', '/purge'], async (req: Request, res: Response) => {
+    try {
+      const parseResult = DeletePurgeRequestSchema.safeParse(req.body);
+      if (!parseResult.success) {
+        return res.status(400).json({ error: parseResult.error.errors });
+      }
+      // Mark purge true if hitting /purge endpoint
+      const path = req.path.endsWith('/purge');
+      const requestPayload = { ...parseResult.data, purge: path || parseResult.data.purge };
+      const result = await memoryService.deleteOrPurge(requestPayload, getUser(req));
+      const validation = DeletePurgeResponseSchema.safeParse(result);
+      if (!validation.success) {
+        return res.status(500).json({ error: 'Invalid delete/purge response shape' });
+      }
+      return res.json(validation.data);
+    } catch (err: any) {
+      return res.status(400).json({ error: err.message });
+    }
+  });
+
+  return router;
+}
*** End Patch
EOF


:/$ apply_patch <<'EOF'
*** Begin Patch
*** Add File: apps/onasis-mcp-server/src/services/memory.ts
+/*
+ * Memory service stub.
+ *
+ * This class provides placeholder implementations of the memory service
+ * methods. They should be replaced with real logic for interacting
+ * with the database, embedding services, retrievers and other
+ * components. By separating the service layer from the route layer
+ * we keep our API handlers clean and testable.
+ */
+
+import {
+  IngestRequest,
+  IngestResponse,
+  ReembedRequest,
+  ReembedResponse,
+  RetrieveRequest,
+  RetrieveResponse,
+  ContextRequest,
+  ContextResponse,
+  FeedbackRequest,
+  FeedbackResponse,
+  DeletePurgeRequest,
+  DeletePurgeResponse,
+} from '../types/extended-memory';
+
+export class MemoryServiceImpl {
+  async ingest(req: IngestRequest, user: any): Promise<IngestResponse> {
+    // TODO: implement ingestion logic (clean, chunk, embed, store)
+    // Placeholder response
+    return {
+      entry_ids: [],
+      chunks: [],
+      embedding_version: 'unknown',
+    };
+  }
+
+  async reembed(req: ReembedRequest, user: any): Promise<ReembedResponse> {
+    // TODO: implement re-embedding job dispatch
+    return {
+      job_id: 'job-placeholder',
+      status: 'queued',
+    };
+  }
+
+  async retrieve(req: RetrieveRequest, user: any): Promise<RetrieveResponse> {
+    // TODO: implement ANN retrieval and optional reranking
+    return {
+      context: [],
+      prompt_tokens_estimate: 0,
+    };
+  }
+
+  async context(req: ContextRequest, user: any): Promise<ContextResponse> {
+    // TODO: implement context builder (calls retrieve internally and trims)
+    return {
+      prompt_context: '',
+      citations: [],
+    };
+  }
+
+  async getEntry(id: string, user: any): Promise<any> {
+    // TODO: implement entry lookup and return extended memory entry
+    return null;
+  }
+
+  async feedback(req: FeedbackRequest, user: any): Promise<FeedbackResponse> {
+    // TODO: record feedback for tuning
+    return {
+      success: true,
+      message: 'Feedback recorded',
+    };
+  }
+
+  async deleteOrPurge(req: DeletePurgeRequest, user: any): Promise<DeletePurgeResponse> {
+    // TODO: implement deletion/purge logic
+    return {
+      deleted_count: 0,
+    };
+  }
+}
+
+export type MemoryService = MemoryServiceImpl;
*** End Patch
EOF
