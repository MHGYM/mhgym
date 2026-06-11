import { useState, useEffect, useRef } from 'react'
import { Send } from 'lucide-react'
import api from '../api'

export default function MessagesPage() {
  const [messages, setMessages]   = useState([])
  const [input,    setInput]      = useState('')
  const [loading,  setLoading]    = useState(true)
  const [sending,  setSending]    = useState(false)
  const bottomRef  = useRef(null)
  const pollRef    = useRef(null)

  const load = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const r = await api.get('/messages')
      setMessages(r.data.messages || [])
    } catch (_) {}
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    // 10-seconden polling
    pollRef.current = setInterval(() => load(true), 10_000)
    return () => clearInterval(pollRef.current)
  }, [])

  // Scroll naar beneden bij nieuwe berichten
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setInput('')
    try {
      await api.post('/messages', { body: text })
      await load(true)
    } catch (_) {
      setInput(text) // terugzetten bij fout
    }
    setSending(false)
  }

  const handleKey = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }

  const fmtTime = s => new Date(s).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  const fmtDay  = s => new Date(s).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })

  // Groepeer berichten per dag voor datum-scheidingslijnen
  let lastDay = null

  return (
    <div className="page-container" style={{ display:'flex', flexDirection:'column', height:'calc(100dvh - 130px)', maxWidth:680, margin:'0 auto', padding:'0 1rem' }}>
      {/* Header */}
      <div style={{ padding:'1rem 0 0.75rem', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <h1 style={{ fontSize:'1.15rem', fontWeight:800, margin:0 }}>Berichten</h1>
        <p style={{ color:'var(--text-muted)', fontSize:'0.82rem', margin:'0.25rem 0 0' }}>
          Stuur een bericht naar de gym — we reageren zo snel mogelijk.
        </p>
      </div>

      {/* Berichtenstroom */}
      <div style={{ flex:1, overflowY:'auto', padding:'1rem 0', display:'flex', flexDirection:'column', gap:'0.5rem' }}>
        {loading && <p style={{ color:'var(--text-muted)', textAlign:'center', marginTop:'2rem' }}>Laden…</p>}

        {!loading && messages.length === 0 && (
          <div style={{ textAlign:'center', marginTop:'3rem', color:'var(--text-muted)' }}>
            <div style={{ fontSize:'2.5rem', marginBottom:'0.75rem' }}>💬</div>
            <p style={{ fontWeight:600, marginBottom:'0.25rem' }}>Nog geen berichten</p>
            <p style={{ fontSize:'0.85rem' }}>Stuur een bericht en we reageren zo snel mogelijk.</p>
          </div>
        )}

        {messages.map(msg => {
          const day = fmtDay(msg.created_at)
          const showDay = day !== lastDay
          lastDay = day
          const isAdmin = msg.sender === 'admin'

          return (
            <div key={msg.id}>
              {showDay && (
                <div style={{ textAlign:'center', margin:'0.75rem 0 0.5rem', fontSize:'0.72rem', color:'var(--text-muted)', display:'flex', alignItems:'center', gap:'0.5rem' }}>
                  <hr style={{ flex:1, border:'none', borderTop:'1px solid var(--border)' }}/>
                  {day}
                  <hr style={{ flex:1, border:'none', borderTop:'1px solid var(--border)' }}/>
                </div>
              )}
              <div style={{ display:'flex', justifyContent: isAdmin ? 'flex-start' : 'flex-end' }}>
                <div style={{
                  maxWidth:'75%',
                  background: isAdmin ? 'var(--surface-2)' : 'var(--accent)',
                  color: isAdmin ? 'var(--text)' : '#000',
                  borderRadius: isAdmin ? '4px 16px 16px 16px' : '16px 16px 4px 16px',
                  padding:'0.6rem 0.85rem',
                  fontSize:'0.875rem',
                  lineHeight:1.5,
                  wordBreak:'break-word',
                }}>
                  {isAdmin && (
                    <div style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--accent)', marginBottom:'0.2rem' }}>MHGym</div>
                  )}
                  <div>{msg.body}</div>
                  <div style={{ fontSize:'0.65rem', color: isAdmin ? 'var(--text-muted)' : 'rgba(0,0,0,0.5)', marginTop:'0.2rem', textAlign:'right' }}>
                    {fmtTime(msg.created_at)}
                    {!isAdmin && msg.read_at && <span style={{ marginLeft:4 }}>✓✓</span>}
                    {!isAdmin && !msg.read_at && <span style={{ marginLeft:4 }}>✓</span>}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Invoerveld */}
      <div style={{ borderTop:'1px solid var(--border)', padding:'0.75rem 0', flexShrink:0 }}>
        <div style={{ display:'flex', gap:'0.5rem', alignItems:'flex-end' }}>
          <textarea
            className="input"
            rows={2}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Typ een bericht… (Enter om te verzenden)"
            style={{ flex:1, resize:'none', fontSize:'0.9rem', lineHeight:1.5 }}
            disabled={sending}
          />
          <button
            className="btn btn-primary"
            onClick={send}
            disabled={!input.trim() || sending}
            style={{ flexShrink:0, height:56, width:48, padding:0, display:'flex', alignItems:'center', justifyContent:'center' }}
          >
            {sending
              ? <span className="spinner spinner-sm" style={{ borderColor:'rgba(0,0,0,0.3)', borderTopColor:'#000' }}/>
              : <Send size={18}/>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
