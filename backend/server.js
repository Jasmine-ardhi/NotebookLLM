import 'dotenv/config';
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { QdrantClient } from "@qdrant/js-client-rest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// app.use(cors());
app.use(cors({ origin: "*" }));
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Initialize Groq client (uses OpenAI-compatible API)
const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// ─── Qdrant Client ────────────────────────────────────────────────────────────
const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || "http://localhost:6333",
  ...(process.env.QDRANT_API_KEY && { apiKey: process.env.QDRANT_API_KEY }),
});

const COLLECTION = "notebooklm";

let documentTitle = "";
let currentVectorSize = 0; // ← tracks actual vocab size after buildVocab()

// ─── Chunking Strategy: Sliding Window with Overlap ───────────────────────────
function chunkText(text, chunkSize = 1200, overlap = 200) {
  const chunks = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let current = "";
  let chunkIndex = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    if ((current + " " + sentence).length > chunkSize && current.length > 0) {
      chunks.push({ text: current.trim(), chunkIndex });
      let overlap_text = current.slice(-overlap);
      current = overlap_text + " " + sentence;
      chunkIndex++;
    } else {
      current = current ? current + " " + sentence : sentence;
    }
  }
  if (current.trim()) {
    chunks.push({ text: current.trim(), chunkIndex });
  }
  return chunks;
}

// ─── TF-IDF Bag-of-Words Embedding ────────────────────────────────────────────
const idfCache = {};
let totalDocs = 0;

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

const STOPWORDS = new Set([
  "the","and","for","are","but","not","you","all","can","her","was","one",
  "our","out","day","get","has","him","his","how","man","new","now","old",
  "see","two","way","who","boy","did","its","let","put","say","she","too",
  "use","with","that","this","from","have","they","will","been","each",
  "than","then","them","were","what","when","which","would","there","their",
  "about","could","other","into","more","some","also","these","those",
]);

function computeTFIDF(tokens, vocab) {
  const tf = {};
  tokens.forEach((t) => (tf[t] = (tf[t] || 0) + 1));
  const total = tokens.length || 1;
  const vec = new Array(vocab.length).fill(0);
  vocab.forEach((word, i) => {
    if (tf[word]) {
      const tfidfVal = (tf[word] / total) * Math.log(1 + (totalDocs / (idfCache[word] || 1)));
      vec[i] = tfidfVal;
    }
  });
  return vec;
}

let globalVocab = [];

function buildVocab(chunks) {
  const freq = {};
  // Reset IDF cache for new document
  Object.keys(idfCache).forEach(k => delete idfCache[k]);

  chunks.forEach(({ text }) => {
    const tokens = tokenize(text);
    tokens.forEach((t) => (freq[t] = (freq[t] || 0) + 1));
    const unique = new Set(tokens);
    unique.forEach((t) => (idfCache[t] = (idfCache[t] || 0) + 1));
  });
  totalDocs = chunks.length;

  // Use however many unique words exist — cap at 2000
  globalVocab = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2000)
    .map(([w]) => w);

  // ── KEY FIX: track the REAL vocab size ──────────────────────────────────────
  currentVectorSize = globalVocab.length;
  console.log(`📐 Vocab built: ${currentVectorSize} unique words`);
}

function tfidfEmbedding(text) {
  const tokens = tokenize(text);
  if (globalVocab.length === 0) return [];
  return computeTFIDF(tokens, globalVocab);
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-10);
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// POST /upload — ingest document
app.post("/upload", upload.single("document"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { mimetype, originalname, buffer } = req.file;
    let rawText = "";

    if (mimetype === "application/pdf") {
      const parsed = await pdfParse(buffer);
      rawText = parsed.text;
    } else if (mimetype === "text/plain") {
      rawText = buffer.toString("utf-8");
    } else {
      return res.status(400).json({ error: "Only PDF or TXT files are supported" });
    }

    if (!rawText.trim()) {
      return res.status(400).json({ error: "Document appears to be empty or unreadable" });
    }

    documentTitle = originalname;

    // 1. Chunk
    const chunks = chunkText(rawText);

    // 2. Build vocab — this sets currentVectorSize to the REAL vocab length
    buildVocab(chunks);

    // 3. Recreate Qdrant collection using the ACTUAL vocab size ← KEY FIX
    await qdrant.recreateCollection(COLLECTION, {
      vectors: { size: currentVectorSize, distance: "Cosine" },
    });
    console.log(`✅ Qdrant collection recreated with vector size: ${currentVectorSize}`);

    // 4. Embed all chunks and upsert
    const points = chunks.map((chunk, i) => ({
      id: i,
      vector: tfidfEmbedding(chunk.text),
      payload: {
        text: chunk.text,
        chunkIndex: chunk.chunkIndex,
      },
    }));

    await qdrant.upsert(COLLECTION, { wait: true, points });

    console.log(`✅ Indexed "${originalname}" → ${points.length} chunks in Qdrant`);

    res.json({
      success: true,
      documentTitle: originalname,
      totalChunks: points.length,
      previewText: rawText.slice(0, 300) + "...",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /chat — RAG query
app.post("/chat", async (req, res) => {
  try {
    console.log("📩 Received chat request");
    console.log("API Key present?", !!process.env.GROQ_API_KEY);
    console.log("API Key starts with:", process.env.GROQ_API_KEY?.substring(0, 10));

    const { question, history = [] } = req.body;
    console.log("Question:", question);

    if (!question) return res.status(400).json({ error: "Question required" });

    // Check Qdrant has data
    const info = await qdrant.getCollection(COLLECTION).catch(() => null);
    if (!info || info.points_count === 0) {
      return res.status(400).json({ error: "No document loaded. Please upload a document first." });
    }

    // Embed query using the same vocab built during upload
    const queryEmbedding = tfidfEmbedding(question);

    // Retrieve top-5 chunks from Qdrant
    const searchResults = await qdrant.search(COLLECTION, {
      vector: queryEmbedding,
      limit: 5,
      with_payload: true,
    });

    const topChunks = searchResults.map(hit => ({
      text: hit.payload.text,
      score: hit.score,
    }));

    const context = topChunks
      .map((c, i) => `[Chunk ${i + 1} | Relevance: ${(c.score * 100).toFixed(1)}%]\n${c.text}`)
      .join("\n\n---\n\n");

    // Build conversation history for Groq
    const messages = [
      {
        role: "system",
        content: `You are a document Q&A assistant analyzing "${documentTitle}".

RULES:
1. Answer ONLY based on the provided document context below.
2. If the context doesn't contain enough information, say so clearly.
3. Quote relevant parts when helpful. Cite chunk numbers [Chunk N].
4. Never use outside knowledge — only what's in the document.
5. Be concise but thorough.

DOCUMENT CONTEXT:
${context}`
      },
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: question },
    ];

    // Stream response from Groq
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    console.log("🚀 Starting Groq API stream...");

    const stream = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      max_tokens: 1024,
      temperature: 0.3,
      stream: true,
    });

    console.log("✅ Stream created successfully");

    let fullText = "";
    let chunkCount = 0;

    for await (const chunk of stream) {
      chunkCount++;
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullText += content;
        res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
      }
    }

    console.log(`✅ Stream completed. Received ${chunkCount} chunks, ${fullText.length} chars`);

    res.write(`data: ${JSON.stringify({ done: true, chunks: topChunks.map(c => ({ text: c.text.slice(0, 150) + "...", score: c.score })) })}\n\n`);
    res.end();
  } catch (err) {
    console.error("❌ Chat error:", err);
    console.error("Error details:", err.message);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// GET /status
app.get("/status", async (req, res) => {
  try {
    const info = await qdrant.getCollection(COLLECTION);
    res.json({
      documentLoaded: info.points_count > 0,
      documentTitle,
      totalChunks: info.points_count,
    });
  } catch {
    res.json({ documentLoaded: false, documentTitle, totalChunks: 0 });
  }
});

app.listen(PORT, () => console.log(`🚀 RAG server running on port ${PORT} (using Groq + Qdrant)`));