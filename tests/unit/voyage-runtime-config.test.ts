import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('Voyage runtime configuration guardrails', () => {
  it('pins memory write functions to voyage-4-large at 1024 dimensions', () => {
    const memoryCreate = readSource('supabase/functions/memory-create/index.ts');
    const memoryUpdate = readSource('supabase/functions/memory-update/index.ts');

    for (const source of [memoryCreate, memoryUpdate]) {
      expect(source).toContain('const DEFAULT_VOYAGE_MODEL = "voyage-4-large";');
      expect(source).toContain('const DEFAULT_VOYAGE_OUTPUT_DIMENSION = 1024;');
      expect(source).toContain('input_type: "document"');
      expect(source).toContain('output_dimension: getVoyageOutputDimension()');
      expect(source).toContain('output_dtype: "float"');
    }
  });

  it('keeps memory-search on the voyage rpc path with optional reranking', () => {
    const source = readSource('supabase/functions/memory-search/index.ts');

    expect(source).toContain('const DEFAULT_VOYAGE_MODEL = "voyage-4-large";');
    expect(source).toContain('const DEFAULT_VOYAGE_OUTPUT_DIMENSION = 1024;');
    expect(source).toContain('const DEFAULT_VOYAGE_RERANK_MODEL = "rerank-2.5";');
    expect(source).toContain('rpcFunction: "search_memories_voyage"');
    expect(source).toContain('input_type: "query"');
    expect(source).toContain('output_dimension: getVoyageOutputDimension()');
    expect(source).toContain('const semanticCandidateLimit = isVoyageRerankEnabled(provider)');
    expect(source).toContain('await voyageRerankResults(');
    expect(source).toContain('reranked,');
  });

  it('keeps the embeddings proxy defaulted to voyage-4-large with 1024-d output', () => {
    const source = readSource('supabase/functions/embeddings/index.ts');

    expect(source).toContain('const DEFAULT_MODEL = "voyage-4-large";');
    expect(source).toContain('const DEFAULT_OUTPUT_DIMENSION = 1024;');
    expect(source).toContain('"voyage-4-large"');
    expect(source).toContain('"voyage-4-lite"');
    expect(source).toContain('"voyage-4-nano"');
    expect(source).toContain('body.dimensions ??');
    expect(source).toContain('output_dimension: Number.isFinite(dimensions) && dimensions > 0');
    expect(source).toContain('output_dtype: "float"');
  });

  it('keeps intelligence-find-related provider-aware for voyage embeddings', () => {
    const source = readSource('supabase/functions/intelligence-find-related/index.ts');

    expect(source).toContain('["voyage_embedding", "embedding"]');
    expect(source).toContain('["embedding", "voyage_embedding"]');
    expect(source).toContain('.select("id, title, content, type, tags, embedding, voyage_embedding, created_at")');
    expect(source).toContain('const selectedEmbedding = selectCandidateEmbedding(');
    expect(source).toContain('embeddingProvider,');
    expect(source).toContain('embeddingDimensions,');
  });
});
