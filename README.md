# 📚 NotebookLM Clone — RAG-Powered Document Chat

A full **Retrieval-Augmented Generation (RAG)** application where users can upload any document and have a natural language conversation with it. Answers are grounded strictly in the document's content — not hallucinated from general knowledge.

**🌐 Live Demo:** [https://notebook-llm-ashen.vercel.app](https://notebook-llm-ashen.vercel.app)  
**⚙️ Backend API:** [https://notebookllm-loix.onrender.com](https://notebookllm-loix.onrender.com)

---

## 🎯 What It Does

Upload a PDF or TXT file → ask questions in plain English → get answers sourced directly from your document.

---

## 🏗️ RAG Pipeline

```
Upload PDF / TXT
      │
      ▼
┌─────────────────────────────────────────┐
│  1. INGESTION                           │
│     pdf-parse extracts raw text         │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  2. CHUNKING  (Sliding Window)          │
│     • Split on sentence boundaries      │
│     • Chunk size : ~1200 characters     │
│     • Overlap    : ~200 characters      │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  3. EMBEDDING  (TF-IDF)                 │
│     • Top-2000 word vocabulary          │
│     • Stopword removal                  │
│     • TF-IDF weighted vectors           │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  4. STORAGE  (In-Memory Vector Store)   │
│     • Array of { text, embedding[] }    │
└──────────────────┬──────────────────────┘
                   │  user asks a question
                   ▼
┌─────────────────────────────────────────┐
│  5. RETRIEVAL  (Cosine Similarity)      │
│     • Query embedded with same TF-IDF   │
│     • Top-5 chunks selected             │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  6. GENERATION  (Groq — Llama 3.3 70B)  │
│     • Context injected into prompt      │
│     • Streamed response to frontend     │
│     • Answers only from document        │
└─────────────────────────────────────────┘
```

---

## 🧩 Chunking Strategy

**Sliding Window with Sentence-Boundary Overlap**

The text is split using a regex that detects natural sentence endings (`.` `!` `?`). Chunks are built by accumulating sentences up to ~1200 characters. When a chunk is full, the last ~200 characters are carried over into the next chunk as overlap. This prevents answers that span a chunk boundary from being missed.

| Parameter | Value |
|-----------|-------|
| Chunk size | 1200 characters |
| Overlap | 200 characters |
| Split boundary | Sentence ends (`[.!?]`) |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite |
| Backend | Node.js + Express |
| LLM | Groq API — `llama-3.3-70b-versatile` (free) |
| Embeddings | TF-IDF (no external API) |
| Vector Store | In-memory cosine similarity |
| PDF Parsing | `pdf-parse` |
| Streaming | Server-Sent Events (SSE) |
| Frontend Deploy | Vercel |
| Backend Deploy | Render |

---

## 🚀 Local Setup

### Prerequisites
- Node.js 18+
- Free Groq API key → [console.groq.com](https://console.groq.com)

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/notebooklm-rag.git
cd notebooklm-rag
```

### 2. Backend setup

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` and add your key:

```env
GROQ_API_KEY=your_groq_api_key_here
PORT=3001
```

Start the backend:

```bash
npm run dev
# ✅ RAG server running on port 3001 (using Groq)
```

### 3. Frontend setup

```bash
cd frontend
npm install
cp .env.example .env
```

Open `.env` and set:

```env
VITE_API_URL=http://localhost:3001
```

Start the frontend:

```bash
npm run dev
# Open http://localhost:5173
```

---

## 🌍 Deployment

### Backend → Render

1. Go to [render.com](https://render.com) → **New Web Service** → connect your GitHub repo
2. Set **Root Directory** to `backend`
3. Set **Build Command** to `npm install`
4. Set **Start Command** to `npm start`
5. Add environment variable: `GROQ_API_KEY = your_key_here`
6. Deploy → your backend URL will be `https://your-app.onrender.com`

### Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project** → import from GitHub
2. Set **Root Directory** to `frontend`
3. Add environment variable: `VITE_API_URL = https://your-app.onrender.com`
4. Deploy

---

## 📁 Project Structure

```
notebooklm-rag/
├── backend/
│   ├── server.js          # Express server — full RAG pipeline
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # Upload + chat UI
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── README.md
```

---

## ✅ Assignment Checklist

| Requirement | Status |
|-------------|--------|
| Upload PDF or TXT | ✅ |
| Chunking strategy implemented | ✅ Sliding window with overlap |
| Embeddings generated | ✅ TF-IDF vectors |
| Vector store used | ✅ In-memory cosine similarity |
| Relevant chunks retrieved | ✅ Top-5 by cosine score |
| LLM answers from context only | ✅ Groq Llama 3.3 70B |
| Multi-turn conversation | ✅ |
| Source chunks shown to user | ✅ |
| Working frontend | ✅ React + Vite |
| Live deployed project | ✅ Vercel + Render |

---

## 📌 Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Required |
|----------|-------------|----------|
| `GROQ_API_KEY` | Free API key from [console.groq.com](https://console.groq.com) | ✅ Yes |
| `PORT` | Server port (default: 3001) | No |

### Frontend (`frontend/.env`)

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_API_URL` | Backend URL (empty string for local dev with Vite proxy) | For production |

---

## 🔑 Getting a Free Groq API Key

1. Go to [console.groq.com](https://console.groq.com)
2. Sign up for a free account
3. Navigate to **API Keys** → **Create API Key**
4. Copy the key and paste it into `backend/.env`

Groq's free tier includes generous rate limits and access to `llama-3.3-70b-versatile` — one of the most capable open models available.