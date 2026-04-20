import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getDatabase } from '../db/index.js';
import { ragDocuments } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { getProviderApiKey } from '../utils/llm.js';

const router = Router();
router.use(authMiddleware);

const CHUNK_SIZE = 800;     // characters per chunk
const CHUNK_OVERLAP = 100;  // overlap between chunks
const TOP_K = 4;            // chunks to retrieve
const EMBED_MODEL = 'text-embedding-3-small';

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end).trim());
    if (end === text.length) break;
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks.filter(c => c.length > 20);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

async function embedTexts(texts: string[], apiKey: string): Promise<number[][]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!response.ok) {
    const body = await response.text();
    let msg = `OpenAI embeddings failed: ${response.status}`;
    try { msg = (JSON.parse(body) as { error?: { message?: string } }).error?.message || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const data = await response.json() as { data: Array<{ embedding: number[] }> };
  return data.data.map(d => d.embedding);
}

// POST /api/rag/documents  — upload a text document and embed it
router.post('/documents', async (req: Request, res: Response) => {
  try {
    const { name, text } = req.body as { name?: string; text?: string };
    if (!name || !text || typeof name !== 'string' || typeof text !== 'string') {
      res.status(400).json({ error: 'name and text are required' });
      return;
    }
    const apiKey = await getProviderApiKey(req.userId!, 'openai');
    if (!apiKey) {
      res.status(400).json({ error: 'OpenAI API key required for embeddings' });
      return;
    }
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      res.status(400).json({ error: 'Document has no usable text content' });
      return;
    }

    // Embed in batches of 100
    const allEmbeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += 100) {
      const batch = await embedTexts(chunks.slice(i, i + 100), apiKey);
      allEmbeddings.push(...batch);
    }

    const db = getDatabase();
    const uid = req.userId!;
    const rows = chunks.map((chunk, idx) => ({
      id: randomUUID(),
      uid,
      name: name.trim().slice(0, 200),
      chunkIndex: idx,
      chunkText: chunk,
      embedding: JSON.stringify(allEmbeddings[idx]),
    }));
    await db.insert(ragDocuments).values(rows);
    res.json({ ok: true, chunks: rows.length, name: name.trim().slice(0, 200) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Upload failed';
    res.status(500).json({ error: msg });
  }
});

// GET /api/rag/documents  — list unique document names for the user
router.get('/documents', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;
    const rows = await db.select({
      name: ragDocuments.name,
      chunkIndex: ragDocuments.chunkIndex,
      createdAt: ragDocuments.createdAt,
    }).from(ragDocuments).where(eq(ragDocuments.uid, uid));

    // Group by name, count chunks, use earliest createdAt
    const map = new Map<string, { name: string; chunks: number; createdAt: string }>();
    for (const row of rows) {
      const existing = map.get(row.name);
      if (!existing) {
        map.set(row.name, { name: row.name, chunks: 1, createdAt: row.createdAt });
      } else {
        existing.chunks++;
        if (row.createdAt < existing.createdAt) existing.createdAt = row.createdAt;
      }
    }
    res.json({ documents: Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to list documents';
    res.status(500).json({ error: msg });
  }
});

// DELETE /api/rag/documents/:name  — delete all chunks for a document
router.delete('/documents/:name', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;
    const name = decodeURIComponent(req.params.name);
    await db.delete(ragDocuments).where(and(eq(ragDocuments.uid, uid), eq(ragDocuments.name, name)));
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Delete failed';
    res.status(500).json({ error: msg });
  }
});

// POST /api/rag/query  — retrieve top-k relevant chunks for a query
router.post('/query', async (req: Request, res: Response) => {
  try {
    const { query, topK = TOP_K } = req.body as { query?: string; topK?: number };
    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'query is required' });
      return;
    }
    const apiKey = await getProviderApiKey(req.userId!, 'openai');
    if (!apiKey) {
      res.status(400).json({ error: 'OpenAI API key required for embeddings' });
      return;
    }
    const [queryEmbedding] = await embedTexts([query], apiKey);
    const db = getDatabase();
    const uid = req.userId!;
    const rows = await db.select({
      name: ragDocuments.name,
      chunkText: ragDocuments.chunkText,
      embedding: ragDocuments.embedding,
    }).from(ragDocuments).where(eq(ragDocuments.uid, uid));

    if (rows.length === 0) {
      res.json({ chunks: [] });
      return;
    }

    const scored = rows.map(row => ({
      name: row.name,
      text: row.chunkText,
      score: cosineSimilarity(queryEmbedding, JSON.parse(row.embedding) as number[]),
    }));
    scored.sort((a, b) => b.score - a.score);
    res.json({ chunks: scored.slice(0, topK).map(({ name, text, score }) => ({ name, text, score })) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Query failed';
    res.status(500).json({ error: msg });
  }
});

export default router;
