import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'

const API = import.meta.env.VITE_API_URL || ''

function formatBytes(b) {
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'
  return (b / (1024 * 1024)).toFixed(1) + ' MB'
}

function ChunkBadge({ chunks }) {
  const [open, setOpen] = useState(false)
  if (!chunks?.length) return null
  return (
    <div style={{ marginTop: '10px' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '11px', color: 'var(--text-muted)',
          display: 'flex', alignItems: 'center', gap: '4px',
          fontFamily: 'var(--font-sans)', padding: 0,
          transition: 'color 0.2s'
        }}
        onMouseOver={e => e.currentTarget.style.color = 'var(--accent)'}
        onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
        {chunks.length} source chunks retrieved {open ? '▲' : '▼'}
      </button>
      {open && (
        <div style={{
          marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px'
        }}>
          {chunks.map((c, i) => (
            <div key={i} style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderLeft: '2px solid var(--accent)',
              borderRadius: '6px',
              padding: '8px 10px',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}>
              <span style={{ color: 'var(--accent)', fontWeight: 500, marginRight: '6px' }}>
                [{(c.score * 100).toFixed(0)}%]
              </span>
              {c.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Message({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{
      display: 'flex',
      flexDirection: isUser ? 'row-reverse' : 'row',
      gap: '12px',
      alignItems: 'flex-start',
      padding: '4px 0',
    }}>
      <div style={{
        width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
        background: isUser ? 'var(--accent-dim)' : 'var(--bg-card)',
        border: `1px solid ${isUser ? 'rgba(212,169,106,0.3)' : 'var(--border)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '13px',
      }}>
        {isUser ? '👤' : '📖'}
      </div>
      <div style={{
        maxWidth: '78%',
        background: isUser ? 'var(--accent-dim)' : 'var(--bg-card)',
        border: `1px solid ${isUser ? 'rgba(212,169,106,0.2)' : 'var(--border)'}`,
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        padding: '12px 16px',
        fontSize: '14px',
        lineHeight: 1.65,
        color: 'var(--text-primary)',
      }}>
        {msg.loading ? (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '2px 0' }}>
            {[0,1,2].map(i => (
              <div key={i} style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: 'var(--accent)',
                animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
        ) : (
          <>
            <div className="markdown-body">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
            {msg.chunks && <ChunkBadge chunks={msg.chunks} />}
          </>
        )}
      </div>
    </div>
  )
}

function UploadZone({ onUpload, uploading }) {
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()

  const handleFile = (file) => {
    if (!file) return
    if (!['application/pdf', 'text/plain'].includes(file.type)) {
      alert('Only PDF or TXT files are supported.')
      return
    }
    onUpload(file)
  }

  return (
    <div
      onClick={() => fileRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
      style={{
        border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border-accent)'}`,
        borderRadius: var_radius_lg,
        padding: '40px 32px',
        textAlign: 'center',
        cursor: uploading ? 'default' : 'pointer',
        background: dragOver ? 'var(--accent-glow)' : 'transparent',
        transition: 'all 0.2s',
        opacity: uploading ? 0.6 : 1,
      }}
    >
      <input ref={fileRef} type="file" accept=".pdf,.txt" style={{ display: 'none' }}
        onChange={e => handleFile(e.target.files[0])} />
      <div style={{ fontSize: '36px', marginBottom: '12px' }}>
        {uploading ? '⏳' : '📄'}
      </div>
      <p style={{ fontSize: '15px', color: 'var(--text-primary)', fontWeight: 500, marginBottom: '4px' }}>
        {uploading ? 'Processing document…' : 'Drop your document here'}
      </p>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
        {uploading ? 'Chunking, embedding, indexing…' : 'PDF or TXT · up to 20MB'}
      </p>
    </div>
  )
}

// hack to use CSS var in JSX
const var_radius_lg = 'var(--radius-lg)'

export default function App() {
  const [doc, setDoc] = useState(null)       // { title, chunks }
  const [uploading, setUploading] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const bottomRef = useRef()
  const textareaRef = useRef()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleUpload = async (file) => {
    setUploading(true)
    setUploadError('')
    const fd = new FormData()
    fd.append('document', file)
    try {
      const res = await fetch(`${API}/upload`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setDoc({ title: data.documentTitle, chunks: data.totalChunks })
      setMessages([{
        role: 'assistant',
        content: `📚 **${data.documentTitle}** loaded successfully!\n\n` +
          `I've processed it into **${data.totalChunks} semantic chunks** and indexed them for retrieval.\n\n` +
          `You can now ask me anything about this document. My answers will be grounded exclusively in its content.`,
        id: Date.now(),
      }])
    } catch (e) {
      setUploadError(e.message)
    } finally {
      setUploading(false)
    }
  }

  const handleSend = async () => {
    const q = input.trim()
    if (!q || thinking) return
    setInput('')
    const userMsg = { role: 'user', content: q, id: Date.now() }
    const loadingMsg = { role: 'assistant', content: '', loading: true, id: Date.now() + 1 }
    setMessages(prev => [...prev, userMsg, loadingMsg])
    setThinking(true)

    try {
      const history = messages
        .filter(m => !m.loading)
        .map(m => ({ role: m.role, content: m.content }))

      const res = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history }),
      })

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      let sourceChunks = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const raw = decoder.decode(value)
        const lines = raw.split('\n').filter(l => l.startsWith('data:'))
        for (const line of lines) {
          try {
            const json = JSON.parse(line.slice(5).trim())
            if (json.text) {
              fullText += json.text
              setMessages(prev => prev.map(m =>
                m.id === loadingMsg.id ? { ...m, content: fullText, loading: false } : m
              ))
            }
            if (json.done) {
              sourceChunks = json.chunks
              setMessages(prev => prev.map(m =>
                m.id === loadingMsg.id ? { ...m, content: fullText, loading: false, chunks: sourceChunks } : m
              ))
            }
            if (json.error) throw new Error(json.error)
          } catch {}
        }
      }
    } catch (e) {
      setMessages(prev => prev.map(m =>
        m.loading ? { ...m, content: `⚠️ ${e.message}`, loading: false } : m
      ))
    } finally {
      setThinking(false)
      textareaRef.current?.focus()
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const reset = () => {
    setDoc(null)
    setMessages([])
    setInput('')
    setUploadError('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <header style={{
        padding: '18px 28px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <h1 style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '22px',
            fontWeight: 400,
            letterSpacing: '-0.3px',
            color: 'var(--text-primary)',
          }}>
            NotebookLM
          </h1>
          <span style={{
            fontSize: '11px', color: 'var(--accent)',
            background: 'var(--accent-dim)',
            padding: '2px 8px', borderRadius: '20px',
            fontWeight: 500, letterSpacing: '0.5px',
          }}>RAG</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {doc && (
            <div style={{
              fontSize: '12px', color: 'var(--text-secondary)',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '20px',
              padding: '4px 12px',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)' }} />
              {doc.title.length > 30 ? doc.title.slice(0, 28) + '…' : doc.title}
              <span style={{ color: 'var(--text-muted)' }}>· {doc.chunks} chunks</span>
            </div>
          )}
          {doc && (
            <button onClick={reset} style={{
              background: 'none', border: '1px solid var(--border)',
              borderRadius: '8px', color: 'var(--text-muted)',
              cursor: 'pointer', padding: '5px 12px', fontSize: '12px',
              fontFamily: 'var(--font-sans)',
              transition: 'all 0.2s',
            }}
              onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              New doc
            </button>
          )}
        </div>
      </header>

      {/* Main area */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {!doc ? (
          // Upload screen
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '40px 28px',
          }}>
            <div style={{ width: '100%', maxWidth: '480px' }}>
              <div style={{ textAlign: 'center', marginBottom: '36px' }}>
                <h2 style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: '32px', fontWeight: 400,
                  color: 'var(--text-primary)',
                  lineHeight: 1.2, marginBottom: '10px',
                }}>
                  Chat with any document
                </h2>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Upload a PDF or text file. The full RAG pipeline — chunking,
                  embedding, retrieval — runs on your document.
                </p>
              </div>
              <UploadZone onUpload={handleUpload} uploading={uploading} />
              {uploadError && (
                <p style={{
                  marginTop: '12px', fontSize: '13px', color: 'var(--red)',
                  textAlign: 'center',
                }}>
                  ⚠️ {uploadError}
                </p>
              )}
              <div style={{
                marginTop: '28px',
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                gap: '10px',
              }}>
                {[
                  { icon: '✂️', label: 'Sliding window chunking', desc: '1200 char chunks, 200 overlap' },
                  { icon: '📐', label: 'TF-IDF embeddings', desc: 'Vocab-based vector space' },
                  { icon: '🎯', label: 'Cosine retrieval', desc: 'Top-5 chunks per query' },
                ].map(({ icon, label, desc }) => (
                  <div key={label} style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    padding: '12px',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '20px', marginBottom: '6px' }}>{icon}</div>
                    <p style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '3px' }}>{label}</p>
                    <p style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          // Chat screen
          <div style={{
            flex: 1, overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              flex: 1, overflowY: 'auto',
              padding: '20px 28px',
              display: 'flex', flexDirection: 'column', gap: '16px',
            }}>
              {messages.map(msg => (
                <Message key={msg.id} msg={msg} />
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Input bar */}
            <div style={{
              padding: '16px 28px 20px',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg)',
            }}>
              <div style={{
                display: 'flex', gap: '10px', alignItems: 'flex-end',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-accent)',
                borderRadius: '14px',
                padding: '10px 14px',
                transition: 'border-color 0.2s',
              }}
                onFocusCapture={e => e.currentTarget.style.borderColor = 'rgba(212,169,106,0.4)'}
                onBlurCapture={e => e.currentTarget.style.borderColor = 'var(--border-accent)'}
              >
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder={`Ask anything about ${doc.title}…`}
                  disabled={thinking}
                  style={{
                    flex: 1, background: 'none', border: 'none', outline: 'none',
                    resize: 'none', color: 'var(--text-primary)',
                    fontFamily: 'var(--font-sans)', fontSize: '14px',
                    lineHeight: 1.5, minHeight: '22px', maxHeight: '120px',
                    overflowY: 'auto',
                  }}
                  rows={1}
                  onInput={e => {
                    e.target.style.height = 'auto'
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || thinking}
                  style={{
                    background: input.trim() && !thinking ? 'var(--accent)' : 'var(--bg-hover)',
                    border: 'none', borderRadius: '8px',
                    width: '34px', height: '34px',
                    cursor: input.trim() && !thinking ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, transition: 'background 0.2s',
                    color: input.trim() && !thinking ? '#0e0e11' : 'var(--text-muted)',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'center' }}>
                Answers grounded in document content only · Powered by Claude Sonnet
              </p>
            </div>
          </div>
        )}
      </main>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1); }
        }
        .markdown-body p { margin-bottom: 0.6em; }
        .markdown-body p:last-child { margin-bottom: 0; }
        .markdown-body ul, .markdown-body ol { padding-left: 1.4em; margin: 0.4em 0; }
        .markdown-body li { margin-bottom: 0.3em; }
        .markdown-body code {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 4px;
          padding: 1px 5px;
          font-size: 12px;
          font-family: 'SF Mono', monospace;
        }
        .markdown-body pre {
          background: rgba(0,0,0,0.3);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px;
          overflow-x: auto;
          margin: 0.6em 0;
        }
        .markdown-body pre code { background: none; border: none; padding: 0; }
        .markdown-body strong { color: var(--accent); font-weight: 500; }
        .markdown-body h1,.markdown-body h2,.markdown-body h3 { 
          font-family: var(--font-serif); font-weight: 400; 
          margin: 0.8em 0 0.4em; color: var(--text-primary);
        }
        .markdown-body blockquote {
          border-left: 2px solid var(--accent);
          padding-left: 12px;
          color: var(--text-secondary);
          margin: 0.6em 0;
        }
      `}</style>
    </div>
  )
}
