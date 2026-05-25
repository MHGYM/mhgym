import { useState, useRef, useEffect } from 'react'
import { X, MessageCircle, Send } from 'lucide-react'

const WELCOME = {
  role: 'assistant',
  content: 'Hallo! Ik ben Maya, de assistent van MHGym 👋 Heb je vragen over onze lessen, personal training of lidmaatschappen? Ik help je graag!',
}

export default function MayaChatWidget() {
  const [open,     setOpen]     = useState(false)
  const [messages, setMessages] = useState([WELCOME])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => {
    if (!open) return
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      inputRef.current?.focus()
    }, 120)
  }, [open, messages.length])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg    = { role: 'user', content: text }
    const newHistory = [...messages, userMsg]
    setMessages(newHistory)
    setInput('')
    setLoading(true)

    try {
      const res  = await fetch('/api/chat/maya', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newHistory.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply || 'Er ging iets mis. Probeer het opnieuw.',
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Geen verbinding. Probeer het opnieuw of neem contact op via info@mhgym.nl.',
      }])
    } finally {
      setLoading(false)
    }
  }

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 9999, fontFamily: 'inherit' }}>

      {/* ── Chat panel ── */}
      {open && (
        <div style={{
          position: 'absolute', bottom: '4.75rem', right: 0,
          width: 'min(340px, calc(100vw - 2rem))',
          maxHeight: 'min(480px, calc(100vh - 8rem))',
          background: 'var(--surface, #1a1a1a)',
          border: '1px solid var(--border, #333)',
          borderRadius: '1rem',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>

          {/* Header */}
          <div style={{
            padding: '0.8rem 1rem',
            background: 'linear-gradient(135deg,#f5c200,#e0a800)',
            display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              background: '#000', color: '#f5c200',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: '1rem', flexShrink: 0, userSelect: 'none',
            }}>M</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: '#000', fontSize: '0.9rem', lineHeight: 1.2 }}>Maya</div>
              <div style={{ fontSize: '0.7rem', color: 'rgba(0,0,0,0.55)' }}>MHGym Assistent • Online</div>
            </div>
            <button onClick={() => setOpen(false)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#000', padding: 4, borderRadius: 6, touchAction: 'manipulation',
              display: 'flex', alignItems: 'center',
            }}>
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '0.75rem',
            display: 'flex', flexDirection: 'column', gap: '0.5rem',
          }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {m.role === 'assistant' && (
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    background: '#f5c200', color: '#000',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: '0.7rem', marginRight: 6, alignSelf: 'flex-end',
                  }}>M</div>
                )}
                <div style={{
                  maxWidth: '78%',
                  padding: '0.55rem 0.85rem',
                  borderRadius: m.role === 'user'
                    ? '1rem 1rem 0.25rem 1rem'
                    : '0.25rem 1rem 1rem 1rem',
                  background: m.role === 'user'
                    ? 'var(--accent, #f5c200)'
                    : 'var(--surface-2, #2a2a2a)',
                  color: m.role === 'user' ? '#000' : 'var(--text, #fff)',
                  fontSize: '0.85rem', lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                }}>
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                  background: '#f5c200', color: '#000',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: '0.7rem',
                }}>M</div>
                <div style={{
                  padding: '0.55rem 0.85rem',
                  borderRadius: '0.25rem 1rem 1rem 1rem',
                  background: 'var(--surface-2, #2a2a2a)',
                  color: 'var(--text-muted, #888)', fontSize: '0.85rem',
                }}>
                  Maya typt…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '0.6rem', borderTop: '1px solid var(--border, #333)',
            display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0,
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Stel een vraag…"
              disabled={loading}
              style={{
                flex: 1, background: 'var(--surface-2, #2a2a2a)',
                border: '1px solid var(--border, #333)', borderRadius: 8,
                padding: '0.5rem 0.75rem', fontSize: '0.85rem',
                color: 'var(--text, #fff)', outline: 'none',
                minWidth: 0,
              }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              style={{
                background: input.trim() && !loading ? '#f5c200' : 'var(--surface-2,#2a2a2a)',
                border: 'none', borderRadius: 8, padding: '0.5rem 0.6rem',
                cursor: loading || !input.trim() ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.2s', touchAction: 'manipulation', flexShrink: 0,
              }}
            >
              <Send size={16} color={input.trim() && !loading ? '#000' : 'var(--text-muted,#666)'} />
            </button>
          </div>
        </div>
      )}

      {/* ── Toggle button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Chat sluiten' : 'Chat met Maya'}
        style={{
          width: 56, height: 56, borderRadius: '50%', border: 'none',
          background: open ? 'var(--surface-2,#2a2a2a)' : 'linear-gradient(135deg,#f5c200,#e0a800)',
          cursor: 'pointer',
          boxShadow: open ? '0 4px 16px rgba(0,0,0,0.3)' : '0 4px 20px rgba(245,194,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s', touchAction: 'manipulation',
        }}
      >
        {open
          ? <X size={22} color="var(--text,#fff)" />
          : <MessageCircle size={22} color="#000" />
        }
      </button>

      {/* Pulse ring (only when closed) */}
      {!open && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '2px solid rgba(245,194,0,0.4)',
          animation: 'maya-pulse 2s ease-out infinite',
          pointerEvents: 'none',
        }} />
      )}

      <style>{`
        @keyframes maya-pulse {
          0%   { transform: scale(1);   opacity: 0.8; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
