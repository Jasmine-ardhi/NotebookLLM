import 'dotenv/config';
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import pdfParse from "pdf-parse/lib/pdf-parse.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Initialize Groq client (uses OpenAI-compatible API)
const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// ─── In-memory vector store (cosine similarity) ───────────────────────────────
// Structure: { id, text, embedding, metadata: { pageNum, chunkIndex } }
let vectorStore = [];
let documentTitle = "";

// ─── Chunking Strategy: Sliding Window with Overlap ───────────────────────────
// Chunk size: 500 tokens (~400 words), Overlap: 100 tokens (~80 words)
function chunkText(text, chunkSize = 1200, overlap = 200) {
  const chunks = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let current = "";
  let chunkIndex = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    if ((current + " " + sentence).length > chunkSize && current.length > 0) {
      chunks.push({ text: current.trim(), chunkIndex });
      // Overlap: rewind by ~overlap chars
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

// ─── TF-IDF Bag-of-Words Embedding (No external API required) ────────────────
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
  chunks.forEach(({ text }) => {
    const tokens = tokenize(text);
    tokens.forEach((t) => (freq[t] = (freq[t] || 0) + 1));
    // Update IDF cache
    const unique = new Set(tokens);
    unique.forEach((t) => (idfCache[t] = (idfCache[t] || 0) + 1));
  });
  totalDocs = chunks.length;
  // Top 2000 most frequent words as vocab
  globalVocab = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2000)
    .map(([w]) => w);
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

    // Reset store
    vectorStore = [];
    documentTitle = originalname;

    // Chunk
    const chunks = chunkText(rawText);

    // Build vocab for TF-IDF
    buildVocab(chunks);

    // Embed and store
    for (const chunk of chunks) {
      const embedding = tfidfEmbedding(chunk.text);
      vectorStore.push({ ...chunk, embedding });
    }

    res.json({
      success: true,
      documentTitle: originalname,
      totalChunks: vectorStore.length,
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
    if (vectorStore.length === 0) return res.status(400).json({ error: "No document loaded. Please upload a document first." });

    // Embed query
    const queryEmbedding = tfidfEmbedding(question);

    // Retrieve top-k chunks (k=5)
    const scored = vectorStore.map((chunk) => ({
      ...chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }));
    scored.sort((a, b) => b.score - a.score);
    const topChunks = scored.slice(0, 5);

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
    console.log("Model: llama-3.3-70b-versatile");
    
    const stream = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile", // Fast and capable model
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
    console.error("Full error:", JSON.stringify(err, null, 2));
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// GET /status
app.get("/status", (req, res) => {
  res.json({
    documentLoaded: vectorStore.length > 0,
    documentTitle,
    totalChunks: vectorStore.length,
  });
});

app.listen(PORT, () => console.log(`🚀 RAG server running on port ${PORT} (using Groq)`));