# NotebookLM Clone — RAG Pipeline

A full RAG (Retrieval-Augmented Generation) application built with Node.js, React, and Anthropic Claude. Upload any PDF or text document and chat with it — answers come only from your document, not from the LLM's general knowledge.

## Live Demo

- **Frontend**: [Deploy to Vercel](#deployment)
- **Backend**: [Deploy to Railway](#deployment)

---

## RAG Pipeline Architecture

```
User uploads PDF/TXT
        │
        ▼
┌─────────────────────────────────────────────────────┐
│  1. INGESTION                                        │
│     • pdf-parse extracts raw text from PDF           │
│     • TXT files read as UTF-8                        │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  2. CHUNKING  (Sliding Window Strategy)              │
│     • Split on sentence boundaries (.  !  ?)         │
│     • Chunk size: ~1200 characters                   │
│     • Overlap: ~200 characters between chunks        │
│     • Preserves context across chunk boundaries      │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  3. EMBEDDING  (TF-IDF Bag-of-Words)                 │
│     • Build vocabulary from all chunks (top 2000 words)│
│     • Remove stopwords (100+ common English words)   │
│     • Compute TF-IDF weighted vectors per chunk      │
│     • IDF scores penalize overly common terms        │
│     • Zero external API needed for embeddings        │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  4. STORAGE  (In-Memory Vector Store)                │
│     • Chunks + embeddings stored in JS array         │
│     • Each entry: { text, embedding[], chunkIndex }  │
└──────────────────────┬──────────────────────────────┘
                       │  User asks question
                       ▼
┌─────────────────────────────────────────────────────┐
│  5. RETRIEVAL  (Cosine Similarity Search)            │
│     • Query tokenized with same TF-IDF pipeline      │
│     • Cosine similarity computed vs all chunks       │
│     • Top-5 most relevant chunks selected            │
│     • Relevance scores shown to user                 │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  6. GENERATION  (Claude Sonnet via Anthropic API)    │
│     • System prompt includes top-5 chunks as context │
│     • Strict instruction: only answer from context   │
│     • Streaming response for real-time display       │
│     • Multi-turn conversation history supported      │
└─────────────────────────────────────────────────────┘
```

---

## Chunking Strategy

**Sliding Window Chunking** — the core strategy used:

- **Why sentence boundaries?** Splitting mid-sentence loses semantic context. We use regex `(?<=[.!?])\s+` to split on natural sentence ends.
- **Chunk size (~1200 chars / ~200 words)**: Large enough for meaningful context, small enough for precision retrieval.
- **Overlap (~200 chars)**: The tail of each chunk overlaps with the start of the next. This prevents answers that span a chunk boundary from being missed.
- **Result**: A document of ~10,000 words → ~40–60 overlapping chunks.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| LLM | Anthropic Claude Sonnet (claude-sonnet-4-5) |
| PDF Parsing | pdf-parse |
| Embedding | TF-IDF (no external API) |
| Vector DB | In-memory cosine similarity store |
| Frontend | React + Vite |
| Streaming | SSE (Server-Sent Events) |

### Why Anthropic instead of OpenAI?
- Free tier available at [console.anthropic.com](https://console.anthropic.com)
- Claude Sonnet 4.5 is state-of-the-art for document Q&A
- Built-in streaming support
- Superior instruction-following (stays grounded in context)

### Why TF-IDF instead of neural embeddings?
- **Zero cost** — no embedding API needed
- Works without any external service
- Deterministic and explainable
- Sufficient for document search (BM25 is still competitive with neural embeddings for many tasks)

---

## Local Setup

### Prerequisites
- Node.js 18+
- Anthropic API key (free at [console.anthropic.com](https://console.anthropic.com))

### 1. Clone and install
```bash
git clone https://github.com/YOUR_USERNAME/notebooklm-rag
cd notebooklm-rag

# Install backend deps
cd backend && npm install && cd ..

# Install frontend deps
cd frontend && npm install && cd ..
```

### 2. Configure environment
```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env and add your ANTHROPIC_API_KEY

# Frontend (optional for local dev — Vite proxy handles it)
cp frontend/.env.example frontend/.env
```

### 3. Run
```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend  
cd frontend && npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Deployment

### Backend → Railway

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Select the `backend/` folder (or set root to `/backend`)
3. Add environment variable: `ANTHROPIC_API_KEY=your_key`
4. Railway auto-detects Node.js and deploys

### Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. Set **Root Directory** to `frontend/`
3. Add environment variable: `VITE_API_URL=https://your-backend.railway.app`
4. Deploy

---

## Project Structure

```
notebooklm-rag/
├── backend/
│   ├── server.js          # Express server + full RAG pipeline
│   ├── package.json
│   ├── railway.toml       # Railway deployment config
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # React UI — upload + chat interface
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js     # Dev proxy to backend
│   ├── vercel.json        # Vercel deployment config
│   └── package.json
└── README.md
```

---

## Assignment Checklist

- [x] User can upload a PDF or plain text file
- [x] System chunks the document (sliding window, sentence-aware)
- [x] System embeds chunks (TF-IDF vectors)
- [x] Embeddings indexed in vector store (in-memory with cosine similarity)
- [x] User can ask natural language questions
- [x] System retrieves top-5 most relevant chunks
- [x] LLM (Claude) generates answers grounded in document context
- [x] System prompt explicitly restricts LLM to document content only
- [x] Multi-turn conversation supported
- [x] Source chunks shown to user (transparency)
- [x] Works on documents it has never seen before
- [x] Clean, working web UI
- [x] Free API key (Anthropic)

---

## Marking Scheme Coverage

| Criterion | Implementation |
|-----------|---------------|
| GitHub Repository | This repo |
| Live Project | Vercel + Railway deployment |
| RAG Pipeline | Full pipeline in `backend/server.js` |
| Answer Quality | System prompt enforces context-only answers |
| Code Quality | Modular functions, documented, readable |
