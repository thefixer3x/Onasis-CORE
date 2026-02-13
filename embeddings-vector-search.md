Embeddings and Vector Search Architecture in LanOnasis
Created 8 February 2026 at 3:57
This map traces how LanOnasis generates vector embeddings using OpenAI models and performs semantic search using PostgreSQL pgvector across two main implementations: the primary mcp-core service and the legacy onasis-mcp service. Key entry points include memory creation with embedding generation [1b], semantic search execution [2b], hybrid search combining semantic and keyword matching [3b], and background job processing [4c].

AI generated guide
Motivation
When users create memories in LanOnasis, they need to be able to search them semantically - finding relevant content based on meaning, not just keyword matches. For example, searching for "financial performance" should find memories containing "quarterly revenue exceeded projections" even though they share no common words.

This requires converting text into vector embeddings - numerical representations that capture semantic meaning. The system must generate these embeddings during memory creation and store them alongside the content for later similarity searches.

Details
Memory Creation Flow
The entry point is MemoryToolImpl.createMemory() [1a], which orchestrates the entire process. Before storing anything, the system validates the content to ensure it meets safety and format requirements [memory-tool.ts:281].

The system extracts authentication metadata from the request - specifically user_id and organization_id - which are required for multi-tenant isolation [memory-tool.ts:296]. These UUIDs determine who owns the memory and enforce access control.

Embedding Generation
If vector search is enabled, the system calls EmbeddingService.generateEmbedding() [1b] with the combined title and content. This service implements caching, retry logic, and cost tracking [1c] to handle the external API dependency reliably.

The actual embedding generation happens via OpenAI's API [1d], using the text-embedding-3-small model to produce a 1536-dimensional vector. This vector numerically represents the semantic meaning of the text. The service includes exponential backoff retry logic [embedding.ts:292] to handle transient failures.

The API returns the embedding vector [embedding.ts:430], which is then included in the database insert payload.

Database Persistence
The system constructs an insertData object [memory-tool.ts:320] containing the title, content, metadata, and crucially, the embedding vector. This is inserted into PostgreSQL via Supabase [1e], where the vector is stored in a VECTOR(1536) column enabled by the pgvector extension.

Once persisted, the embedding enables fast approximate nearest neighbor (ANN) searches using specialized vector indexes (HNSW or IVFFlat), allowing the system to find semantically similar memories in milliseconds even across millions of entries.

Memory Creation with Embedding Flow (mcp-core)
1a
Memory Creation Entry Point
memory-tool.ts:275
async createMemory(data: MemoryRequest): Promise<MemoryResponse> {
Content validation
Extract user_id & organization_id
Generate embedding if enabled
1b
Trigger Embedding Generation
memory-tool.ts:313
const embeddingResult = await this.embeddingService.generateEmbedding(
1c
Embedding Service Handler
embedding.ts:276
async generateEmbedding(text: string): Promise<EmbeddingResult> {
Retry logic wrapper
OpenAI API call
1d
OpenAI API Call
embedding.ts:424
const response = await this.openaiClient.embeddings.create({
Returns 1536-dim vector
Build insertData with embedding
1e
Database Insert
memory-tool.ts:338
const { data: memory, error } = await this.supabase

AI generated guide
Motivation
When users search for memories in LanOnasis, they need to find content based on meaning, not just exact keyword matches. For example, searching for "financial performance" should return memories about "quarterly revenue" and "sales figures" even though they use different words. This requires converting text into mathematical vectors (embeddings) and using vector similarity search to find semantically related content.

The mcp-core service implements this by: (1) generating 1536-dimensional embeddings via OpenAI's API, (2) storing them in PostgreSQL with the pgvector extension, and (3) performing approximate nearest neighbor (ANN) search using HNSW indexes.

Details
Search Request Flow
When a user initiates a search [2a], the request flows through the SearchService which orchestrates the entire operation. The service first converts the search query text into a vector embedding [2b] by calling EmbeddingService.generateEmbedding(), which internally makes an OpenAI API call to generate a 1536-dimensional vector representation.

Vector Similarity Matching
With the query embedding in hand, the service invokes PostgreSQL's match_memories function via Supabase RPC [2c]. This is where the actual vector search happens. The SQL function uses dynamic query construction [2d] to support multiple distance metrics (cosine, euclidean, inner product).

Database-Level Optimization
The PostgreSQL function performs the heavy lifting: it filters memories where embeddings exist, calculates similarity scores (1 - cosine_distance), applies the similarity threshold, and orders results by distance [2e]. This ordering operation leverages the HNSW index (idx_memory_entries_embedding_hnsw_cosine) which enables efficient approximate nearest neighbor search without scanning every vector in the database.

HNSW (Hierarchical Navigable Small World) graphs provide better recall than the older IVFFlat indexes and don't require training. The index uses vector_cosine_ops to optimize for cosine distance calculations.

Result Processing
Once PostgreSQL returns the ranked results, the SearchService formats them into SearchResult[] objects [2f], adding metadata like similarity scores, ranks, and highlights. These structured results are then returned to the caller with execution time metrics and analytics.

Key Performance Characteristics
Embedding generation: ~100-300ms per query (OpenAI API latency)
Vector search: ~10-50ms for 10K-100K vectors (HNSW index)
Dimensionality: 1536 dimensions (OpenAI text-embedding-3-small/ada-002)
Distance metric: Cosine similarity (default), with euclidean and inner product support
Semantic Vector Search Flow (mcp-core)
Memory Tool Layer
2a
Search Request Entry
memory-tool.ts:519
const searchResponse = await this.searchService.search({
Search Service Layer
2b
Query Embedding Generation
search.ts:209
const { embedding } = await this.embeddingService.generateEmbedding(query.query);
EmbeddingService.generateEmbedding()
OpenAI API call
returns 1536-dim vector
2c
Vector Similarity RPC Call
search.ts:221
const { data, error } = await this.supabase.rpc('match_memories', {
PostgreSQL RPC invocation
2f
Results Formatting
search.ts:269
const results = this.formatResults(filteredData, 'semantic');
transform to SearchResult[]
Database Layer (PostgreSQL + pgvector)
match_memories() function
2d
Dynamic SQL Query Construction
002_enhanced_vector_search_and_queue.sql:50
RETURN QUERY EXECUTE format('
SELECT with similarity calc
WHERE embedding IS NOT NULL
AND similarity > threshold
2e
Vector Distance Ordering
002_enhanced_vector_search_and_queue.sql:67
ORDER BY me.embedding %s $1
uses HNSW index
vector_cosine_ops
RETURN QUERY results
returns ranked memories by similarity

AI generated guide
Motivation
When users search for memories in LanOnasis, they often need results that match both semantic meaning and exact keywords. Pure vector search might miss important exact matches (like searching for "Q4 2024" when the memory contains that exact phrase), while pure keyword search misses semantically similar content (like finding "quarterly revenue" when searching for "financial performance"). Hybrid search solves this by combining both approaches with configurable weights, giving users the best of both worlds [3b].

Details
Architecture
The hybrid search system lives in the mcp-core service and coordinates three main components:

EmbeddingService - Converts the search query into a 1536-dimensional vector using OpenAI's text-embedding models [3a]
PostgreSQL hybrid_search_memories function - Executes both search strategies in parallel using CTEs [3b]
SearchService - Orchestrates the flow and formats results
How It Works
When a search request arrives, the system first generates a query embedding by calling OpenAI's API [3a]. This vector representation captures the semantic meaning of the search query.

The search then invokes a PostgreSQL function that uses two Common Table Expressions (CTEs) running in parallel [3b]:

semantic_results CTE [3c] performs vector similarity search using pgvector's cosine distance operator (<=>) against the HNSW index [3c]. This finds memories that are semantically similar even if they use different words.

keyword_results CTE [3d] performs full-text search using PostgreSQL's ts_rank function, which scores memories based on exact keyword matches and word proximity [3d].

The final query merges these results using a LEFT JOIN and calculates a combined score [3e]:

combined_score = (semantic_score × semantic_weight) + (keyword_score × keyword_weight)
By default, semantic search gets 70% weight and keyword search gets 30%, but these are configurable. The results are sorted by this combined score and returned to the client [3f].

Performance Considerations
The system uses HNSW (Hierarchical Navigable Small World) indexes on the embedding column, which provide better recall than IVFFlat indexes for approximate nearest neighbor search. The hybrid approach fetches more candidates from the semantic search (2× the requested limit) to ensure good results after merging with keyword matches.

Hybrid Search Flow (mcp-core)
SearchService.search() entry
hybridSearch() orchestrator
3a
Generate Query Embedding
search.ts:349
const { embedding } = await this.embeddingService.generateEmbedding(query.query);
EmbeddingService.generateEmbedding()
OpenAI API call
3b
Hybrid Search RPC Invocation
search.ts:355
const { data, error } = await this.supabase.rpc('hybrid_search_memories', {
PostgreSQL Function
3c
Semantic CTE
002_enhanced_vector_search_and_queue.sql:99
WITH semantic_results AS (
Vector similarity search
pgvector <=> operator
3d
Keyword CTE
002_enhanced_vector_search_and_queue.sql:118
keyword_results AS (
Full-text search
ts_rank scoring
3e
Score Fusion
002_enhanced_vector_search_and_queue.sql:139
(s.semantic_score * semantic_weight + COALESCE(k.keyword_score, 0.0) * keyword_weight) as combined_score,
LEFT JOIN + weighted sum
3f
Return Combined Results
search.ts:370
combinedScore: item.combined_score,
Map to SearchResult[]

AI generated guide
Motivation
Generating embeddings via OpenAI's API is expensive and slow (typically 100-500ms per request). When users create memories, forcing them to wait for embedding generation creates poor UX and blocks the request thread. The solution is asynchronous embedding generation: immediately persist the memory without an embedding, return success to the user, then generate the embedding in a background worker process [4b].

This pattern enables:

Fast response times for memory creation (< 50ms instead of 500ms+)
Resilience - if OpenAI is down, memories still get created
Retry logic - failed embedding jobs can be automatically retried
Rate limiting - worker can throttle OpenAI requests to avoid quota issues
Details
Architecture
The system uses pg-boss as a PostgreSQL-based job queue. When createMemoryAsync() is called [4a], it:

Inserts the memory with embedding: null into the database [4a]
Enqueues a job via queueService.queueEmbeddingGeneration() with the memory ID and content [4b]
Returns immediately to the caller with the memory ID and job ID
Separately, a dedicated embedding worker runs continuously:

Registers handlers for embedding jobs using registerWorker() [4c]
Polls pg-boss for pending jobs (configurable polling interval)
When a job arrives, generates the embedding via OpenAI's API [4d, 4e]
Updates the memory in the database with the generated 1536-dimensional vector [4f]
Key Implementation Details
The worker uses OpenAI's text-embedding-ada-002 model [4e] which produces 1536-dimensional vectors. Text is truncated to 8000 characters before sending to avoid token limits.

The update operation [4f] uses the memory ID and organization ID to ensure proper isolation - workers can only update memories they're authorized to process.

Job priorities can be configured (HIGH, NORMAL, LOW) to ensure critical embeddings are generated first. The system supports automatic retries with exponential backoff if OpenAI requests fail.

Trade-offs
This async approach means search won't find newly created memories until their embeddings are generated (typically 1-5 seconds). For applications requiring immediate searchability, use the synchronous createMemory() method instead, which blocks until the embedding is ready.

Async Embedding Generation Workflow (onasis-mcp)
Memory Creation Request
4a
Create Memory Without Embedding
memoryService.ts:160
const { data: memory, error } = await this.supabase
Insert memory (embedding: null)
4b
Queue Background Job
memoryService.ts:172
const jobId = await queueService.queueEmbeddingGeneration(
queueService.queueEmbeddingGeneration()
Background Worker Process
Worker initialization
4c
Worker Registration
embeddingWorker.ts:72
await queueService.registerWorker<GenerateEmbeddingJobData>(
Polls pg-boss queue
Job execution handler
4d
Generate Embedding in Worker
embeddingWorker.ts:123
const embedding = await this.createEmbedding(data.content);
4e
OpenAI API Call
embeddingWorker.ts:315
const response = await this.openai.embeddings.create({
openai.embeddings.create()
Returns 1536-dim vector
4f
Update Memory with Embedding
embeddingWorker.ts:126
const { error } = await this.supabase
supabase.update(embedding)
Job completion/retry logic

AI generated guide
Motivation
When users search for memories in LanOnasis, they need semantic understanding, not just keyword matching. A query like "financial performance" should find memories about "quarterly revenue" and "sales growth" even though they don't share exact words. This requires converting text into vector embeddings (arrays of numbers that capture meaning) and using distance metrics to measure similarity.

The challenge: different use cases need different similarity measures. Cosine distance works well for general semantic similarity, Euclidean distance for absolute magnitude differences, and inner product for directional alignment. The onasis-mcp service solves this by supporting all three metrics dynamically [5d], letting users choose the best one for their needs.

Details
Search Flow
The search begins at SearchService.search() [5a], which validates options [5a] and routes to the appropriate search strategy. For semantic search, it first generates a query embedding [5b] by calling OpenAI's text-embedding-ada-002 model, converting the search text into a 1536-dimensional vector.

This query vector is then passed to PostgreSQL via match_memories_advanced() [5c], a database function that performs the actual similarity search.

Dynamic Distance Metric Selection
Inside the PostgreSQL function, a CASE statement [5d] selects the appropriate pgvector operator based on the requested metric:

Cosine similarity [5e]: Uses the <=> operator for normalized directional similarity
Euclidean distance: Uses the <-> operator (L2 distance) for absolute spatial distance
Inner product: Uses the <#> operator for dot product similarity
The function then dynamically constructs the SQL query [5f], inserting the chosen operator into both the WHERE clause (for filtering) and ORDER BY clause (for ranking).

Index Optimization
The query leverages HNSW (Hierarchical Navigable Small World) indexes created for each distance metric. These approximate nearest neighbor indexes enable sub-millisecond search across millions of vectors by organizing them into a graph structure, trading a small amount of accuracy for massive speed improvements over exact search.

The result: users get semantically relevant memories ranked by their chosen similarity metric, all in a single database round-trip.

Advanced Multi-Metric Vector Search (onasis-mcp)
5a
Search Entry Point
searchService.ts:153
async search(options: SearchOptions): Promise<SearchResponse> {
Validate options
Determine search type
Route to semanticSearch()
5b
Generate Query Embedding
searchService.ts:279
const queryEmbedding = await this.createEmbedding(options.query);
OpenAI API call
text-embedding-ada-002 model
5c
Call Advanced Search Function
searchService.ts:285
const { data, error } = await this.supabase.rpc('match_memories_advanced', {
match_memories_advanced()
PostgreSQL Function
SQL: match_memories_advanced()
5d
Distance Metric Selection
006_enhanced_vector_search.sql:55
CASE distance_metric
5e
Cosine Distance Operator
006_enhanced_vector_search.sql:57
distance_op := '<=>';
operator: '<=>'
WHEN 'euclidean'
operator: '<->'
WHEN 'inner_product'
operator: '<#>'
5f
Dynamic Ordering
006_enhanced_vector_search.sql:97
ORDER BY m.embedding %s $1
ORDER BY embedding [operator]
Uses HNSW index

AI generated guide
Motivation
When building semantic search for a memory system, you need to find memories based on meaning rather than exact keyword matches. For example, a search for "financial performance" should return memories about "quarterly revenue" and "sales figures" even though they use different words.

The solution is vector embeddings: converting text into high-dimensional numerical vectors where semantically similar content has similar vectors. PostgreSQL's pgvector extension enables storing these vectors and performing fast similarity searches directly in the database [6a].

The challenge is performance at scale. Comparing a query vector against millions of stored vectors using exact calculation is too slow. You need approximate nearest neighbor (ANN) indexes that trade a small amount of accuracy for massive speed improvements.

Details
Vector Storage
LanOnasis stores embeddings as 1536-dimensional vectors in PostgreSQL [6a]. This dimension matches OpenAI's text-embedding models (ada-002, 3-small, 3-large). Each memory entry has an embedding column of type VECTOR(1536) that holds the numerical representation of its content.

Index Types
The system uses two types of ANN indexes:

IVFFlat [6b] is the legacy approach - it partitions the vector space into clusters and only searches relevant clusters. It's simpler but requires training data and has lower recall.

HNSW (Hierarchical Navigable Small World) [6c, 6d, 6e] is the modern approach - it builds a multi-layer graph structure that enables fast approximate search with better recall than IVFFlat. The system creates three separate HNSW indexes, one for each distance metric:

Cosine distance (vector_cosine_ops) for measuring angular similarity [6c]
Euclidean distance (vector_l2_ops) for measuring straight-line distance [6d]
Inner product (vector_ip_ops) for measuring dot product similarity [6e]
Each HNSW index is configured with m=16 (connections per node) and ef_construction=64 (search depth during build).

Query Execution
When searching, the match_memories() function [6f] receives a query embedding and uses the pgvector distance operator (<=> for cosine) to find the nearest neighbors. The similarity score is calculated as 1 - distance to convert distance into a 0-1 similarity score [6f].

The HNSW index automatically accelerates this search, returning approximate results in milliseconds even with millions of vectors. PostgreSQL's query planner selects the appropriate index based on the distance operator used in the query.

PostgreSQL Vector Search Architecture
Table Schema Definition
memory_entries table
6a
Vector Column Definition
memory-schema.sql:12
embedding VECTOR(1536), -- OpenAI text-embedding-ada-002 dimensions
Index Layer (pgvector extension)
Legacy IVFFlat Index
6b
IVFFlat Index Creation
memory-schema.sql:63
CREATE INDEX IF NOT EXISTS idx_memory_entries_embedding ON memory_entries USING ivfflat(embedding vector_cosine_ops)
vector_cosine_ops
Enhanced HNSW Indexes
6c
HNSW Cosine Index
002_enhanced_vector_search_and_queue.sql:157
CREATE INDEX IF NOT EXISTS idx_memory_entries_embedding_hnsw_cosine
vector_cosine_ops (m=16)
6d
HNSW Euclidean Index
002_enhanced_vector_search_and_queue.sql:163
CREATE INDEX IF NOT EXISTS idx_memory_entries_embedding_hnsw_euclidean
vector_l2_ops (m=16)
6e
HNSW Inner Product Index
002_enhanced_vector_search_and_queue.sql:169
CREATE INDEX IF NOT EXISTS idx_memory_entries_embedding_hnsw_inner
vector_ip_ops (m=16)
Query Execution
match_memories() function
6f
Similarity Score Calculation
memory-schema.sql:100
1 - (me.embedding <=> query_embedding) as similarity,
1 - (embedding <=> query)

AI generated guide
Motivation
The LanOnasis CLI tool needs to provide offline vector search capabilities without depending on external APIs like OpenAI. When users work in environments without internet access or want to avoid API costs, they still need semantic search functionality. The local vector store [7a] solves this by implementing a lightweight, in-memory vector database that runs entirely in JavaScript without external dependencies.

The key tradeoff: instead of using sophisticated neural network embeddings from OpenAI (1536 dimensions, $0.0001 per 1K tokens), this implementation uses a simple hash-based embedding algorithm [7b] that generates 384-dimensional vectors purely from word hashing. While less accurate than neural embeddings, it's instant, free, and works offline.

Details
Embedding Generation
The system converts text into vectors using a deterministic hash function [7c]. Each word in the input is hashed to a position in the 384-dimensional vector, with values weighted by word position (earlier words get higher weights). The resulting vector is L2-normalized to enable cosine similarity comparisons [7b].

This approach captures basic lexical similarity—documents with shared vocabulary will have similar vectors—but misses semantic relationships that neural models capture (e.g., "car" and "automobile" won't be recognized as similar).

Storage Architecture
Memories are stored in a simple Map<string, {embedding, metadata, content}> [7a]. This in-memory structure provides O(1) lookup but doesn't persist across sessions. The entire vector store lives in the CLI process memory, making it suitable for small to medium-sized memory collections (thousands, not millions of entries).

Search Execution
Search queries follow the same embedding process [7d], then the system performs brute-force similarity comparison against all stored embeddings [7e]. For each stored memory, it computes cosine similarity using the standard dot product formula [7f]: dotProduct / (magnitudeA × magnitudeB) [7f]. Results are filtered by a similarity threshold (default 0.7) and sorted by score before returning the top K matches.

The brute-force approach is acceptable because the vector store targets small-scale, local use cases where the entire dataset fits in memory and search latency under 100ms is achievable even with thousands of vectors.

Local Vector Store (CLI - lanonasis-maas)
Memory Storage Flow
7a
Add Memory to Local Store
vector-store.ts:47
async addMemory(memoryId: string, content: string, metadata: any): Promise<void> {
7b
Generate Simple Embedding
vector-store.ts:48
const embedding = this.generateSimpleEmbedding(content);
Split text into words
7c
Word-Based Vector Generation
vector-store.ts:96
words.forEach((word, index) => {
Normalize vector (L2 norm)
Store in localEmbeddings Map
In-memory Map<memoryId, embedding>
Search Flow
searchMemories() entry point
7d
Search Query Embedding
vector-store.ts:54
const queryEmbedding = this.generateSimpleEmbedding(query);
Iterate over stored embeddings
7e
Compute Cosine Similarity
vector-store.ts:65
const similarity = this.cosineSimilarity(queryEmbedding, data.embedding);
Filter & sort by threshold
7f
Cosine Similarity Implementation
vector-store.ts:116
private cosineSimilarity(a: number[], b: number[]): number {
Compute dot product
Compute magnitudes
Return dotProduct / (magA * magB)

 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
