-- The "PageEmbedding" table was created for a planned pgvector backend that never
-- stored any embeddings. Semantic search now keeps vectors in per-project files next
-- to the Tantivy index (<index_dir>/projects/<project_id>/vectors/), so drop it.
DROP TABLE IF EXISTS "PageEmbedding";
