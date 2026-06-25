import { useState, useEffect } from 'react'
import { Plus, X, Check, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import api from '../../api'

const STATUS_COLOR = {
  active:    { bg:'#d1fae5', color:'#059669' },
  cancelled: { bg:'#fee2e2', color:'#dc2626' },
  expired:   { bg:'#f3f4f6', color:'#6b7280' },
}

function Badge({ status }) {
  const s = STATUS_COLOR[status] || STATUS_COLOR.expired
  return (
    <span style={{ background:s.bg, color:s.color, borderRadius:99, padding:'2px 8px', fontSize:'0.72rem', fontWeight:700 }}>
      {status}
    </span>
  )
}

export default function AdminSubscriptions() {
  const [subs, setSubs]       = useState([])
  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]       = useState({ user_id:'', start_date: new Date().toISOString().split('T')[0], end_date:'', price_paid:'', notes:'' })
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState('')
  const [userFilter, setUserFilter] = useState('')

  const load = async () => {
    setLoading(true)
    const [s, u] = await Promise.all([
      api.get('/training/admin/subscriptions').then(r => r.data.subscriptions),
      api.get('/training/admin/users').then(r => r.data.users),
    ])
    setSubs(s); setUsers(u); setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (e) => {
    e.preventDefault(); setErr(''); setSaving(true)
    try {
      await api.post('/training/admin/subscriptions', {
        ...form,
        user_id: Number(form.user_id),
        price_paid: form.price_paid ? Number(form.price_paid) : null,
        end_date: form.end_date || null,
      })
      setShowForm(false)
      setForm({ user_id:'', start_date: new Date().toISOString().split('T')[0], end_date:'', price_paid:'', notes:'' })
      load()
    } catch (e) { setErr(e.response?.data?.error || 'Fout bij opslaan.') }
    finally { setSaving(false) }
  }

  const handleCancel = async (id) => {
    if (!confirm('Abonnement annuleren?')) return
    await api.delete(`/training/admin/subscriptions/${id}`)
    load()
  }

  const filteredUsers = users.filter(u =>
    !userFilter ||
    u.email.toLowerCase().includes(userFilter.toLowerCase()) ||
    `${u.first_name} ${u.last_name}`.toLowerCase().includes(userFilter.toLowerCase())
  )

  const activeCount = subs.filter(s => s.effective_status === 'active').length

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 style={{ margin:0, fontSize:'1.1rem' }}>Trainingsabonnementen</h2>
          <div style={{ color:'var(--text-muted)', fontSize:'0.82rem', marginTop:2 }}>
            {activeCount} actief van {subs.length} totaal
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn" onClick={load} title="Vernieuwen" style={{ padding:'6px 10px' }}>
            <RefreshCw size={14} />
          </button>
          <button className="btn btn-primary" onClick={() => setShowForm(v => !v)} style={{ display:'flex', alignItems:'center', gap:6 }}>
            {showForm ? <ChevronUp size={14} /> : <Plus size={14} />}
            Nieuw abonnement
          </button>
        </div>
      </div>

      {/* New subscription form */}
      {showForm && (
        <form onSubmit={handleCreate} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:20, marginBottom:24 }}>
          <h3 style={{ margin:'0 0 16px', fontSize:'0.95rem' }}>Abonnement toewijzen</h3>
          {err && <div style={{ color:'var(--error,#dc2626)', fontSize:'0.83rem', marginBottom:12 }}>{err}</div>}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={{ fontSize:'0.8rem', fontWeight:600, display:'block', marginBottom:4 }}>Lid *</label>
              <input
                placeholder="Zoek op naam of e-mail..."
                value={userFilter}
                onChange={e => setUserFilter(e.target.value)}
                style={{ width:'100%', padding:'7px 10px', border:'1px solid var(--border)', borderRadius:6, fontSize:'0.85rem', marginBottom:6, boxSizing:'border-box' }}
              />
              <select
                required
                value={form.user_id}
                onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))}
                style={{ width:'100%', padding:'7px 10px', border:'1px solid var(--border)', borderRadius:6, fontSize:'0.85rem', boxSizing:'border-box' }}
              >
                <option value="">-- selecteer lid --</option>
                {filteredUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.first_name} {u.last_name} ({u.email}){u.has_training ? ' ✓ actief' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize:'0.8rem', fontWeight:600, display:'block', marginBottom:4 }}>Startdatum *</label>
              <input type="date" required value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                style={{ width:'100%', padding:'7px 10px', border:'1px solid var(--border)', borderRadius:6, fontSize:'0.85rem', boxSizing:'border-box' }} />
            </div>

            <div>
              <label style={{ fontSize:'0.8rem', fontWeight:600, display:'block', marginBottom:4 }}>Einddatum (leeg = onbeperkt)</label>
              <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                style={{ width:'100%', padding:'7px 10px', border:'1px solid var(--border)', borderRadius:6, fontSize:'0.85rem', boxSizing:'border-box' }} />
            </div>

            <div>
              <label style={{ fontSize:'0.8rem', fontWeight:600, display:'block', marginBottom:4 }}>Betaald bedrag (€)</label>
              <input type="number" step="0.01" min="0" placeholder="0.00" value={form.price_paid} onChange={e => setForm(f => ({ ...f, price_paid: e.target.value }))}
                style={{ width:'100%', padding:'7px 10px', border:'1px solid var(--border)', borderRadius:6, fontSize:'0.85rem', boxSizing:'border-box' }} />
            </div>

            <div>
              <label style={{ fontSize:'0.8rem', fontWeight:600, display:'block', marginBottom:4 }}>Notities</label>
              <input placeholder="Optioneel..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                style={{ width:'100%', padding:'7px 10px', border:'1px solid var(--border)', borderRadius:6, fontSize:'0.85rem', boxSizing:'border-box' }} />
            </div>
          </div>

          <div style={{ display:'flex', gap:8 }}>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ display:'flex', alignItems:'center', gap:6 }}>
              <Check size={14} />{saving ? 'Opslaan...' : 'Opslaan'}
            </button>
            <button type="button" className="btn" onClick={() => setShowForm(false)} style={{ display:'flex', alignItems:'center', gap:6 }}>
              <X size={14} />Annuleren
            </button>
          </div>
        </form>
      )}

      {/* Subscriptions table */}
      {loading ? (
        <div style={{ color:'var(--text-muted)', textAlign:'center', padding:40 }}>Laden...</div>
      ) : subs.length === 0 ? (
        <div style={{ color:'var(--text-muted)', textAlign:'center', padding:40 }}>Nog geen trainingsabonnementen.</div>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.85rem' }}>
            <thead>
              <tr style={{ borderBottom:'2px solid var(--border)' }}>
                {['Lid','E-mail','Status','Start','Einde','Nog over','Betaald','Aangemaakt door','Notities',''].map(h => (
                  <th key={h} style={{ padding:'8px 10px', textAlign:'left', color:'var(--text-muted)', fontWeight:600, fontSize:'0.75rem', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subs.map(s => (
                <tr key={s.id} style={{ borderBottom:'1px solid var(--border)', background: s.effective_status==='active' ? 'transparent' : 'var(--bg)' }}>
                  <td style={{ padding:'9px 10px', fontWeight:600 }}>{s.first_name} {s.last_name}</td>
                  <td style={{ padding:'9px 10px', color:'var(--text-muted)' }}>{s.email}</td>
                  <td style={{ padding:'9px 10px' }}><Badge status={s.effective_status} /></td>
                  <td style={{ padding:'9px 10px', whiteSpace:'nowrap' }}>{s.start_date?.slice(0,10)}</td>
                  <td style={{ padding:'9px 10px', whiteSpace:'nowrap' }}>{s.end_date?.slice(0,10) || '∞'}</td>
                  <td style={{ padding:'9px 10px', whiteSpace:'nowrap' }}>
                    {s.effective_status === 'active' && s.days_remaining != null ? `${Math.max(0, Math.round(s.days_remaining))} dagen` : '—'}
                  </td>
                  <td style={{ padding:'9px 10px' }}>{s.price_paid != null ? `€${Number(s.price_paid).toFixed(2)}` : '—'}</td>
                  <td style={{ padding:'9px 10px', color:'var(--text-muted)' }}>{s.created_by_first ? `${s.created_by_first} ${s.created_by_last}` : '—'}</td>
                  <td style={{ padding:'9px 10px', color:'var(--text-muted)', maxWidth:180 }}>{s.notes || '—'}</td>
                  <td style={{ padding:'9px 10px' }}>
                    {s.effective_status === 'active' && (
                      <button className="btn" onClick={() => handleCancel(s.id)}
                        style={{ padding:'4px 10px', fontSize:'0.75rem', color:'var(--error,#dc2626)', borderColor:'var(--error,#dc2626)' }}>
                        Annuleer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
