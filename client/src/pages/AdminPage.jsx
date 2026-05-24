import { useState, useEffect, useRef } from 'react'
import {
  LayoutDashboard, Users, Calendar, CreditCard,
  Zap, AlertTriangle, Users2,
  Search, Plus, Check, X, Euro, Clock, Edit2, Trash2,
  Bell, PauseCircle, PlayCircle, Pin, Crown, Link, ChevronLeft, RefreshCw
} from 'lucide-react'
import api from '../api'

// ── Helpers ────────────────────────────────────────────────────────────────
const fmtDate  = (s) => s ? new Date(s).toLocaleDateString('nl-NL',{day:'numeric',month:'short',year:'numeric'}) : '—'
const fmtMoney = (n) => n != null ? `€${Number(n).toFixed(2)}` : '—'
const fmtDT    = (s) => s ? new Date(s).toLocaleString('nl-NL',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '—'

// ── Membership types ──────────────────────────────────────────────────────
const MEMBERSHIP_TYPES = [
  { key:'jeugd_jaar',            label:'Jeugd Jaar',              category:'Groepslessen', price_monthly:45  },
  { key:'jeugd_half_jaar',       label:'Jeugd Half jaar',         category:'Groepslessen', price_monthly:50  },
  { key:'jeugd_maand',           label:'Jeugd Maand',             category:'Groepslessen', price_monthly:55  },
  { key:'volwassenen_jaar',      label:'Volwassenen Jaar',        category:'Groepslessen', price_monthly:55  },
  { key:'volwassenen_half_jaar', label:'Volwassenen Half jaar',   category:'Groepslessen', price_monthly:60  },
  { key:'volwassenen_maand',     label:'Volwassenen Maand',       category:'Groepslessen', price_monthly:65  },
  { key:'vt_onbeperkt',          label:'Vrij Trainen Onbeperkt',  category:'Vrij Trainen', custom_price:true },
  { key:'vt_10x',                label:'Vrij Trainen 10x kaart',  category:'Vrij Trainen', custom_price:true },
  { key:'vt_dagpas',             label:'Vrij Trainen Dagpas',     category:'Vrij Trainen', custom_price:true },
  { key:'pt_losse_les',          label:'PT Losse les',            category:'PT',           price_per_lesson:70,  lessons:1  },
  { key:'pt_10_lessen',          label:'PT 10 lessen',            category:'PT',           price_per_lesson:60,  lessons:10 },
  { key:'pt_20_lessen',          label:'PT 20 lessen',            category:'PT',           price_per_lesson:58,  lessons:20 },
  { key:'pt_30_lessen',          label:'PT 30 lessen',            category:'PT',           price_per_lesson:56,  lessons:30 },
  { key:'pt_40_lessen',          label:'PT 40 lessen',            category:'PT',           price_per_lesson:54,  lessons:40 },
  { key:'pt_50_lessen',          label:'PT 50 lessen',            category:'PT',           price_per_lesson:52,  lessons:50 },
  { key:'pt_abo_1x',             label:'PT Abo 1x/week',          category:'PT Abo',       price_monthly:240, price_per_lesson:60 },
  { key:'pt_abo_2x',             label:'PT Abo 2x/week',          category:'PT Abo',       price_monthly:440, price_per_lesson:55 },
  { key:'pt_abo_3x',             label:'PT Abo 3x/week',          category:'PT Abo',       price_monthly:600, price_per_lesson:50 },
]

// ════════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════════
function DashboardSection() {
  const [data, setData] = useState(null)
  useEffect(() => { api.get('/admin/stats').then(r => setData(r.data)).catch(() => {}) }, [])
  if (!data) return <p style={{color:'var(--text-muted)'}}>Laden…</p>
  const s = data.stats
  return (
    <div>
      <div className="stats-grid">
        {[
          ['Leden',          s.member_count,              'var(--accent)'],
          ['Actieve abo\'s', s.active_members,            'var(--success)'],
          ['Omzet (maand)',  fmtMoney(s.month_revenue),   'var(--info)'],
          ['Totale omzet',   fmtMoney(s.total_revenue),   'var(--text-muted)'],
          ['Lessen',         s.class_count,               'var(--warning)'],
          ['Boekingen',      s.booking_count,             'var(--text-muted)'],
          ['Orders',         s.order_count,               'var(--text-muted)'],
          ['Producten',      s.product_count,             'var(--text-muted)'],
        ].map(([label, value, color]) => (
          <div key={label} className="stat-card">
            <p className="stat-label">{label}</p>
            <p className="stat-value" style={{color}}>{value}</p>
          </div>
        ))}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.5rem',marginTop:'1.5rem'}}>
        <div className="card">
          <h3 style={{marginBottom:'1rem'}}>Omzet per maand</h3>
          {data.revenue_by_month.map(r => (
            <div key={r.month} style={{display:'flex',justifyContent:'space-between',padding:'0.4rem 0',borderBottom:'1px solid var(--border)',fontSize:'0.875rem'}}>
              <span style={{color:'var(--text-muted)'}}>{r.month}</span>
              <span style={{fontWeight:600}}>{fmtMoney(r.revenue)}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <h3 style={{marginBottom:'1rem'}}>Populairste lessen</h3>
          {data.top_classes.map((c,i) => (
            <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'0.4rem 0',borderBottom:'1px solid var(--border)',fontSize:'0.875rem'}}>
              <div><span style={{fontWeight:600}}>{c.name}</span><span style={{color:'var(--text-muted)',marginLeft:8}}>{c.instructor}</span></div>
              <span style={{color:'var(--accent)',fontWeight:700}}>{c.bookings}×</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// LEDEN
// ════════════════════════════════════════════════════════════════════
function LedenSection() {
  const [members,       setMembers]       = useState([])
  const [search,        setSearch]        = useState('')
  const [loading,       setLoading]       = useState(true)
  const [selected,      setSelected]      = useState(null)
  const [detail,        setDetail]        = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [showAssign,    setShowAssign]    = useState(false)
  const [assignType,    setAssignType]    = useState(MEMBERSHIP_TYPES[0].key)
  const [assignPrice,   setAssignPrice]   = useState('')
  const [assignCash,    setAssignCash]    = useState(false)
  const [assignPaid,    setAssignPaid]    = useState(false)
  const [assignStart,   setAssignStart]   = useState(new Date().toISOString().split('T')[0])
  const [assignNotes,   setAssignNotes]   = useState('')
  const [showPtAdd,     setShowPtAdd]     = useState(false)
  const [ptLessons,     setPtLessons]     = useState('')
  const [ptNotes,       setPtNotes]       = useState('')
  const [editNotes,     setEditNotes]     = useState(false)
  const [notes,         setNotes]         = useState('')
  const [isCash,        setIsCash]        = useState(false)
  const timerRef = useRef(null)

  useEffect(() => { loadMembers() }, [])

  const loadMembers = async (q = '') => {
    setLoading(true)
    const r = await api.get(`/admin/members${q ? `?q=${encodeURIComponent(q)}` : ''}`)
    setMembers(r.data.members)
    setLoading(false)
  }

  const handleSearch = v => {
    setSearch(v)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => loadMembers(v), 350)
  }

  const openMember = async id => {
    setSelected(id); setLoadingDetail(true); setDetail(null)
    const r = await api.get(`/admin/members/${id}`)
    setDetail(r.data)
    setNotes(r.data.member.admin_notes || '')
    setIsCash(!!r.data.member.is_cash_payer)
    setLoadingDetail(false)
  }

  const selectedMtype = MEMBERSHIP_TYPES.find(t => t.key === assignType)
  const needsPrice = selectedMtype?.custom_price || selectedMtype?.category === 'PT' || selectedMtype?.category === 'PT Abo'

  const doAssign = async () => {
    try {
      await api.post(`/admin/members/${selected}/membership`, {
        membership_type_key: assignType,
        admin_price: needsPrice ? (parseFloat(assignPrice) || null) : null,
        is_cash: assignCash, cash_paid: assignPaid,
        start_date: assignStart, notes: assignNotes || undefined,
      })
      setShowAssign(false); openMember(selected); loadMembers(search)
    } catch (e) { alert(e.response?.data?.error || 'Fout') }
  }

  const doAddPt = async () => {
    try {
      await api.post(`/admin/members/${selected}/pt-lessons`, { lessons: parseInt(ptLessons), notes: ptNotes })
      setShowPtAdd(false); setPtLessons(''); setPtNotes(''); openMember(selected)
    } catch (e) { alert(e.response?.data?.error || 'Fout') }
  }

  const doSaveNotes = async () => {
    await api.put(`/admin/members/${selected}/notes`, { admin_notes: notes, is_cash_payer: isCash })
    setEditNotes(false); loadMembers(search)
  }

  const doPause = async () => {
    const paused = detail?.member?.membership_paused
    await api.put(`/admin/members/${selected}/pause`, { paused: !paused, reason: paused ? null : 'Admin actie' })
    openMember(selected); loadMembers(search)
  }

  const doMarkPaid = async mid => {
    await api.put(`/admin/members/${selected}/memberships/${mid}/paid`); openMember(selected)
  }

  const doDelete = async id => {
    if (!confirm('Lid definitief verwijderen?')) return
    await api.delete(`/admin/members/${id}`)
    setSelected(null); setDetail(null); loadMembers(search)
  }

  return (
    <div style={{display:'grid', gridTemplateColumns: selected ? '320px 1fr' : '1fr', gap:'1.5rem'}}>
      {/* Lijst */}
      <div>
        <div className="search-box" style={{marginBottom:'1rem'}}>
          <Search size={16} style={{color:'var(--text-muted)'}}/>
          <input className="search-input" placeholder="Zoek naam of e-mail…" value={search} onChange={e => handleSearch(e.target.value)}/>
        </div>
        {loading && <p style={{color:'var(--text-muted)',fontSize:'0.875rem'}}>Laden…</p>}
        <div style={{display:'flex',flexDirection:'column',gap:'0.4rem'}}>
          {members.map(m => (
            <div key={m.id} className={`member-row${selected===m.id?' active':''}`} onClick={() => openMember(m.id)}>
              <div className="member-row-avatar">{(m.first_name?.[0]||'?')+(m.last_name?.[0]||'')}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,fontSize:'0.875rem',display:'flex',alignItems:'center',gap:4,flexWrap:'wrap'}}>
                  {m.first_name} {m.last_name}
                  {m.is_cash_payer ? <span className="badge-warning">Cash</span> : null}
                  {m.membership_paused ? <span className="badge-error">Gepauzeerd</span> : null}
                </div>
                <div style={{fontSize:'0.75rem',color:'var(--text-muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.email}</div>
                {m.membership_name && (
                  <div style={{fontSize:'0.72rem',color:'var(--accent)',marginTop:1}}>
                    {m.membership_name}
                    {m.is_cash ? <span style={{marginLeft:4,color:m.cash_paid?'var(--success)':'var(--error)'}}>{m.cash_paid?'✓':'⚠'}</span> : null}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail paneel */}
      {selected && (
        <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
          {loadingDetail && <p style={{color:'var(--text-muted)'}}>Laden…</p>}
          {detail && (() => {
            const m = detail.member
            const activeMem = detail.memberships?.find(x => ['active','cancelling'].includes(x.status))
            return <>
              {/* Kop */}
              <div className="card" style={{display:'flex',alignItems:'center',gap:'1rem'}}>
                <div style={{width:50,height:50,borderRadius:'50%',background:'var(--accent)',color:'#000',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:'1.1rem',flexShrink:0}}>
                  {(m.first_name?.[0]||'?')+(m.last_name?.[0]||'')}
                </div>
                <div style={{flex:1}}>
                  <h3 style={{margin:0}}>{m.first_name} {m.last_name}</h3>
                  <p style={{color:'var(--text-muted)',fontSize:'0.85rem',margin:0}}>{m.email} · {m.phone||'—'}</p>
                  <div style={{display:'flex',gap:4,marginTop:4,flexWrap:'wrap'}}>
                    <span className="badge-neutral">{m.role}</span>
                    {m.is_cash_payer && <span className="badge-warning">Cash betaler</span>}
                    {m.membership_paused && <span className="badge-error">Gepauzeerd</span>}
                  </div>
                </div>
                <div style={{display:'flex',gap:'0.5rem',flexShrink:0}}>
                  <button className="btn btn-ghost btn-sm" onClick={doPause}>
                    {m.membership_paused ? <><PlayCircle size={14}/> Hervatten</> : <><PauseCircle size={14}/> Pauzeren</>}
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => doDelete(m.id)}><Trash2 size={13}/></button>
                </div>
              </div>

              {/* Notities */}
              <div className="card">
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'0.75rem'}}>
                  <h3 style={{margin:0}}>Admin notities</h3>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditNotes(e => !e)}><Edit2 size={13}/> {editNotes?'Annuleren':'Bewerken'}</button>
                </div>
                {editNotes ? (
                  <div style={{display:'flex',flexDirection:'column',gap:'0.6rem'}}>
                    <textarea className="input" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notities…" style={{resize:'vertical'}}/>
                    <label style={{display:'flex',alignItems:'center',gap:6,fontSize:'0.875rem',cursor:'pointer'}}>
                      <input type="checkbox" checked={isCash} onChange={e => setIsCash(e.target.checked)}/> Cash betaler
                    </label>
                    <button className="btn btn-primary btn-sm" style={{alignSelf:'flex-start'}} onClick={doSaveNotes}><Check size={13}/> Opslaan</button>
                  </div>
                ) : (
                  <p style={{color:m.admin_notes?'var(--text-2)':'var(--text-muted)',fontSize:'0.875rem',whiteSpace:'pre-wrap'}}>{m.admin_notes||'Geen notities'}</p>
                )}
              </div>

              {/* Lidmaatschap */}
              <div className="card">
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'0.75rem'}}>
                  <h3 style={{margin:0}}>Lidmaatschap</h3>
                  <div style={{display:'flex',gap:'0.5rem'}}>
                    <button className="btn btn-outline btn-sm" onClick={() => setShowAssign(s=>!s)}><Plus size={13}/> Toewijzen</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowPtAdd(s=>!s)}><Zap size={13}/> PT lessen</button>
                  </div>
                </div>

                {activeMem ? (
                  <div style={{padding:'0.75rem',background:'var(--surface-2)',borderRadius:'var(--r)',marginBottom:'0.75rem'}}>
                    <div style={{fontWeight:600}}>{activeMem.membership_name||activeMem.membership_type_key}</div>
                    <div style={{fontSize:'0.8rem',color:'var(--text-muted)',marginTop:3}}>
                      {fmtDate(activeMem.start_date)} – {activeMem.end_date?fmtDate(activeMem.end_date):'Doorlopend'}
                      {activeMem.is_cash && <span style={{marginLeft:8,color:activeMem.cash_paid?'var(--success)':'var(--error)'}}>
                        {activeMem.cash_paid?'✓ Cash betaald':'⚠ Cash onbetaald'}
                      </span>}
                    </div>
                    {activeMem.admin_price && <div style={{fontSize:'0.8rem',color:'var(--text-muted)'}}>Prijs: {fmtMoney(activeMem.admin_price)}</div>}
                    {activeMem.is_cash && !activeMem.cash_paid && (
                      <button className="btn btn-primary btn-sm" style={{marginTop:'0.5rem'}} onClick={() => doMarkPaid(activeMem.id)}>
                        <Check size={13}/> Betaling ontvangen
                      </button>
                    )}
                  </div>
                ) : <p style={{color:'var(--text-muted)',fontSize:'0.875rem',marginBottom:'0.75rem'}}>Geen actief lidmaatschap</p>}

                {m.pt_lessons_remaining > 0 && (
                  <div style={{padding:'0.5rem 0.75rem',background:'var(--accent-dim)',borderRadius:'var(--r)',fontSize:'0.85rem',color:'var(--accent)',marginBottom:'0.75rem'}}>
                    💪 {m.pt_lessons_remaining} PT lessen resterend
                  </div>
                )}

                {/* Assign form */}
                {showAssign && (
                  <div style={{padding:'1rem',background:'var(--surface-3)',borderRadius:'var(--r)',display:'flex',flexDirection:'column',gap:'0.6rem'}}>
                    <h4 style={{margin:0,fontSize:'0.875rem'}}>Lidmaatschap toewijzen</h4>
                    <select className="input" value={assignType} onChange={e => setAssignType(e.target.value)}>
                      {['Groepslessen','Vrij Trainen','PT','PT Abo'].map(cat => (
                        <optgroup key={cat} label={cat}>
                          {MEMBERSHIP_TYPES.filter(t => t.category===cat).map(t => (
                            <option key={t.key} value={t.key}>
                              {t.label}{t.price_monthly?` — €${t.price_monthly}/mnd`:''}{t.price_per_lesson?` — €${t.price_per_lesson}/les`:''}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    {needsPrice && (
                      <div>
                        <label className="input-label">{selectedMtype?.category==='PT Abo'?'Prijs/maand':'Prijs'} (€)</label>
                        <input className="input" type="number" value={assignPrice} onChange={e => setAssignPrice(e.target.value)} placeholder={selectedMtype?.price_monthly||selectedMtype?.price_per_lesson||''}/>
                      </div>
                    )}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.6rem'}}>
                      <div><label className="input-label">Startdatum</label><input className="input" type="date" value={assignStart} onChange={e => setAssignStart(e.target.value)}/></div>
                      <div style={{display:'flex',flexDirection:'column',gap:4,justifyContent:'flex-end'}}>
                        <label style={{display:'flex',alignItems:'center',gap:6,fontSize:'0.83rem',cursor:'pointer'}}><input type="checkbox" checked={assignCash} onChange={e=>setAssignCash(e.target.checked)}/> Cash betaler</label>
                        {assignCash && <label style={{display:'flex',alignItems:'center',gap:6,fontSize:'0.83rem',cursor:'pointer'}}><input type="checkbox" checked={assignPaid} onChange={e=>setAssignPaid(e.target.checked)}/> Al betaald</label>}
                      </div>
                    </div>
                    <input className="input" value={assignNotes} onChange={e=>setAssignNotes(e.target.value)} placeholder="Notitie (optioneel)"/>
                    <div style={{display:'flex',gap:'0.5rem'}}>
                      <button className="btn btn-primary btn-sm" onClick={doAssign}><Check size={13}/> Toewijzen</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setShowAssign(false)}><X size={13}/> Annuleren</button>
                    </div>
                  </div>
                )}

                {/* PT lessen */}
                {showPtAdd && (
                  <div style={{marginTop:'0.5rem',padding:'1rem',background:'var(--surface-3)',borderRadius:'var(--r)',display:'flex',flexDirection:'column',gap:'0.6rem'}}>
                    <h4 style={{margin:0,fontSize:'0.875rem'}}>PT lessen toevoegen</h4>
                    <div style={{display:'grid',gridTemplateColumns:'100px 1fr',gap:'0.6rem'}}>
                      <div><label className="input-label">Aantal</label><input className="input" type="number" min="1" value={ptLessons} onChange={e=>setPtLessons(e.target.value)} placeholder="5"/></div>
                      <div><label className="input-label">Notitie</label><input className="input" value={ptNotes} onChange={e=>setPtNotes(e.target.value)} placeholder="Bijv. inhaalles"/></div>
                    </div>
                    <div style={{display:'flex',gap:'0.5rem'}}>
                      <button className="btn btn-primary btn-sm" onClick={doAddPt}><Check size={13}/> Toevoegen</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setShowPtAdd(false)}><X size={13}/> Annuleren</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Boekingen */}
              {detail.bookings.length > 0 && (
                <div className="card">
                  <h3 style={{marginBottom:'0.75rem'}}>Groepslessen ({detail.bookings.length})</h3>
                  <div style={{maxHeight:180,overflowY:'auto',display:'flex',flexDirection:'column',gap:2}}>
                    {detail.bookings.map(b => (
                      <div key={b.id} style={{display:'flex',justifyContent:'space-between',padding:'0.35rem 0',borderBottom:'1px solid var(--border)',fontSize:'0.8rem'}}>
                        <span>{b.class_name}</span>
                        <span style={{color:'var(--text-muted)'}}>{fmtDT(b.date_time)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.pt_sessions.length > 0 && (
                <div className="card">
                  <h3 style={{marginBottom:'0.75rem'}}>PT sessies ({detail.pt_sessions.length})</h3>
                  <div style={{maxHeight:180,overflowY:'auto',display:'flex',flexDirection:'column',gap:2}}>
                    {detail.pt_sessions.map(p => (
                      <div key={p.id} style={{display:'flex',justifyContent:'space-between',padding:'0.35rem 0',borderBottom:'1px solid var(--border)',fontSize:'0.8rem'}}>
                        <span>{p.trainer}</span>
                        <span style={{color:p.status==='confirmed'?'var(--success)':'var(--text-muted)'}}>{fmtDT(p.date_time)} · {p.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          })()}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// PT AGENDA
// ════════════════════════════════════════════════════════════════════
function PTAgendaSection() {
  const [tab,      setTab]      = useState('pending')
  const [slots,    setSlots]    = useState([])
  const [bookings, setBookings] = useState([])
  const [balances, setBalances] = useState([])
  const [showNew,  setShowNew]  = useState(false)
  const [newSlot,  setNewSlot]  = useState({date_time:'',duration_minutes:60,trainer:'Mohammed',notes:''})

  const reload = () => {
    api.get('/pt/slots?all=1').then(r => setSlots(r.data.slots)).catch(() => {})
    api.get('/pt/bookings/admin').then(r => setBookings(r.data.bookings)).catch(() => {})
    api.get('/pt/balance/admin').then(r => setBalances(r.data.balances)).catch(() => {})
  }
  useEffect(reload, [])

  const createSlot = async () => {
    try { await api.post('/pt/slots', newSlot); reload(); setShowNew(false); setNewSlot({date_time:'',duration_minutes:60,trainer:'Mohammed',notes:''}) }
    catch(e) { alert(e.response?.data?.error || 'Fout') }
  }
  const confirm_ = async id => { await api.put(`/pt/bookings/${id}/confirm`); reload() }
  const decline_ = async id => { await api.put(`/pt/bookings/${id}/decline`); reload() }

  const pending   = bookings.filter(b => b.status === 'pending')
  const confirmed = bookings.filter(b => b.status === 'confirmed')

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1rem'}}>
        <div className="tab-bar">
          {[['pending',`Aanvragen (${pending.length})`],['confirmed','Bevestigd'],['slots','Slots'],['balances','Saldo']].map(([k,l]) => (
            <button key={k} className={`tab-btn${tab===k?' active':''}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        {tab==='slots' && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowNew(s=>!s)}>{showNew?<X size={13}/>:<Plus size={13}/>} Nieuw slot</button>
        )}
      </div>

      {tab==='slots' && (
        <div>
          {showNew && (
            <div className="card" style={{marginBottom:'1rem'}}>
              <h3 style={{marginBottom:'0.75rem'}}>Slot aanmaken</h3>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.75rem'}}>
                <div><label className="input-label">Datum & tijd</label><input className="input" type="datetime-local" value={newSlot.date_time} onChange={e=>setNewSlot({...newSlot,date_time:e.target.value})}/></div>
                <div><label className="input-label">Trainer</label><select className="input" value={newSlot.trainer} onChange={e=>setNewSlot({...newSlot,trainer:e.target.value})}>{['Mohammed','Ecrin','Joep'].map(t=><option key={t}>{t}</option>)}</select></div>
                <div><label className="input-label">Duur (min)</label><input className="input" type="number" value={newSlot.duration_minutes} onChange={e=>setNewSlot({...newSlot,duration_minutes:parseInt(e.target.value)})}/></div>
                <div><label className="input-label">Notities</label><input className="input" value={newSlot.notes} onChange={e=>setNewSlot({...newSlot,notes:e.target.value})}/></div>
              </div>
              <div style={{display:'flex',gap:'0.5rem',marginTop:'0.75rem'}}>
                <button className="btn btn-primary btn-sm" onClick={createSlot}><Check size={13}/> Aanmaken</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowNew(false)}><X size={13}/> Annuleren</button>
              </div>
            </div>
          )}
          {slots.map(s => (
            <div key={s.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.6rem 0.75rem',background:'var(--surface-2)',borderRadius:'var(--r)',marginBottom:'0.4rem'}}>
              <div>
                <div style={{fontWeight:600,fontSize:'0.875rem'}}>{fmtDT(s.date_time)}</div>
                <div style={{fontSize:'0.78rem',color:'var(--text-muted)'}}>{s.trainer} · {s.duration_minutes}min · {s.status}</div>
              </div>
              {s.first_name && <span style={{fontSize:'0.8rem',color:'var(--accent)'}}>→ {s.first_name} {s.last_name}</span>}
            </div>
          ))}
        </div>
      )}

      {tab==='pending' && (
        <div>
          {pending.length === 0 && <p style={{color:'var(--text-muted)'}}>Geen openstaande aanvragen</p>}
          {pending.map(b => (
            <div key={b.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.75rem',background:'var(--surface-2)',borderRadius:'var(--r)',marginBottom:'0.5rem'}}>
              <div>
                <div style={{fontWeight:600,fontSize:'0.875rem'}}>{b.first_name} {b.last_name}</div>
                <div style={{fontSize:'0.78rem',color:'var(--text-muted)'}}>{fmtDT(b.date_time)} · {b.trainer}</div>
                {b.extra_person ? <div style={{fontSize:'0.75rem',color:'var(--warning)'}}>+ Extra persoon</div> : null}
              </div>
              <div style={{display:'flex',gap:'0.5rem'}}>
                <button className="btn btn-sm" style={{background:'var(--success-dim)',color:'var(--success)'}} onClick={() => confirm_(b.id)}><Check size={13}/> Bevestig</button>
                <button className="btn btn-danger btn-sm" onClick={() => decline_(b.id)}><X size={13}/> Weiger</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab==='confirmed' && confirmed.map(b => (
        <div key={b.id} style={{display:'flex',justifyContent:'space-between',padding:'0.6rem 0.75rem',background:'var(--surface-2)',borderRadius:'var(--r)',marginBottom:'0.4rem',fontSize:'0.875rem'}}>
          <span style={{fontWeight:600}}>{b.first_name} {b.last_name}</span>
          <span style={{color:'var(--text-muted)'}}>{fmtDT(b.date_time)}</span>
        </div>
      ))}

      {tab==='balances' && balances.map(b => (
        <div key={b.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.6rem 0.75rem',background:'var(--surface-2)',borderRadius:'var(--r)',marginBottom:'0.4rem'}}>
          <div>
            <div style={{fontWeight:600,fontSize:'0.875rem'}}>{b.first_name} {b.last_name}</div>
            <div style={{fontSize:'0.78rem',color:'var(--text-muted)'}}>{b.email}</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontWeight:700,color:b.lessons_remaining<=3?'var(--warning)':'var(--success)'}}>{b.lessons_remaining} lessen</div>
            <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>van {b.lessons_total}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// BETALINGSFOUTEN — met detail modal
// ════════════════════════════════════════════════════════════════════
function PaymentDetailModal({ failureId, onClose, onRefresh }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy,    setBusy]    = useState(false)

  useEffect(() => {
    api.get(`/admin/payment-failures/${failureId}`)
      .then(r => { setData(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [failureId])

  const act = async (fn) => { setBusy(true); try { await fn() } catch(e) { alert(e.response?.data?.error||'Fout') } finally { setBusy(false) } }

  const remind    = () => act(async () => { await api.post(`/admin/payment-failures/${failureId}/remind`);  alert('Herinnering verstuurd.') })
  const sendLink  = () => act(async () => { const r = await api.post(`/admin/payment-failures/${failureId}/paylink`); alert(r.data.pay_link ? `Betaallink verstuurd: ${r.data.pay_link}` : 'Betaalverzoek verstuurd (geen Mollie link).') })
  const markPaid  = () => act(async () => { await api.put(`/admin/payment-failures/${failureId}/paid`);   onRefresh(); onClose() })
  const pauseMem  = () => act(async () => { await api.put(`/admin/payment-failures/${failureId}/pause`);  onRefresh(); onClose() })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:480 }}>
        <div className="modal-header">
          <button className="btn-icon" onClick={onClose}><ChevronLeft size={18}/></button>
          <h3>Betaling detail</h3>
          <button className="btn-icon" onClick={onClose}><X size={18}/></button>
        </div>

        {loading && <div style={{ padding:'2rem', textAlign:'center', color:'var(--text-muted)' }}>Laden…</div>}
        {data && (() => {
          const { failure: f, payment_history: hist, active_membership: mem } = data
          const daysOld = Math.floor((Date.now() - new Date(f.created_at)) / 86400000)
          const total   = Number(f.amount) + Number(f.surcharge_added || 0)
          return (
            <div style={{ padding:'1rem', display:'flex', flexDirection:'column', gap:'1rem' }}>
              {/* Lid info */}
              <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
                <div style={{ width:44,height:44,borderRadius:'50%',background:'var(--error)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,flexShrink:0 }}>
                  {(f.first_name?.[0]||'?')+(f.last_name?.[0]||'')}
                </div>
                <div>
                  <div style={{ fontWeight:700 }}>{f.first_name} {f.last_name}</div>
                  <div style={{ fontSize:'0.8rem', color:'var(--text-muted)' }}>{f.email} · {f.phone||'—'}</div>
                  {f.membership_paused ? <span className="badge-error" style={{ fontSize:'0.72rem' }}>Gepauzeerd</span> : null}
                </div>
              </div>

              {/* Bedrag + status */}
              <div style={{ background:'var(--surface-2)', borderRadius:8, padding:'0.75rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:'0.8rem', color:'var(--text-muted)' }}>Openstaand bedrag</div>
                  {f.description && <div style={{ fontSize:'0.82rem', color:'var(--text-2)', marginTop:2 }}>{f.description}</div>}
                  <div style={{ fontSize:'0.78rem', color:'var(--text-muted)', marginTop:4 }}>{f.failure_count}× mislukt · {daysOld} dag{daysOld!==1?'en':''} geleden</div>
                  {f.surcharge_added > 0 && <div style={{ fontSize:'0.75rem', color:'var(--error)' }}>incl. €{f.surcharge_added} stornerings­toeslag</div>}
                </div>
                <div style={{ fontWeight:900, fontSize:'1.4rem', color:'var(--error)' }}>{fmtMoney(total)}</div>
              </div>

              {/* Actief lidmaatschap */}
              {mem && (
                <div style={{ background:'var(--surface-2)', borderRadius:8, padding:'0.6rem 0.75rem', fontSize:'0.85rem' }}>
                  <span style={{ color:'var(--text-muted)' }}>Lidmaatschap: </span>
                  <span style={{ fontWeight:600 }}>{mem.membership_name}</span>
                  <span style={{ marginLeft:8, color:'var(--text-muted)' }}>{mem.status}</span>
                </div>
              )}

              {/* Reminder tracking */}
              <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', fontSize:'0.78rem' }}>
                {[['Dag 0', f.reminder_day0_sent], ['Dag 3', f.reminder_day3_sent], ['Dag 7', f.reminder_day7_sent]].map(([lbl, sent]) => (
                  <span key={lbl} style={{ padding:'2px 8px', borderRadius:12, background:sent?'var(--success-dim)':'var(--surface-3)', color:sent?'var(--success)':'var(--text-muted)' }}>
                    {lbl} {sent?'✓':'—'}
                  </span>
                ))}
                {f.auto_paused_at && <span style={{ padding:'2px 8px', borderRadius:12, background:'var(--error-dim,rgba(239,68,68,0.15))', color:'var(--error)' }}>Auto-gepauzeerd</span>}
              </div>

              {/* Actie knoppen */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem' }}>
                <button className="btn btn-ghost btn-sm" onClick={remind} disabled={busy}>
                  <Bell size={13}/> Herinnering
                </button>
                <button className="btn btn-ghost btn-sm" onClick={sendLink} disabled={busy}>
                  <Link size={13}/> Betaallink
                </button>
                <button className="btn btn-sm" style={{ background:'var(--success-dim)',color:'var(--success)' }} onClick={markPaid} disabled={busy}>
                  <Check size={13}/> Markeer betaald
                </button>
                <button className="btn btn-danger btn-sm" onClick={pauseMem} disabled={busy}>
                  <PauseCircle size={13}/> Pauzeer lid
                </button>
              </div>

              {/* Betaalhistorie */}
              {hist.length > 0 && (
                <div>
                  <p style={{ fontWeight:600, fontSize:'0.85rem', marginBottom:'0.5rem' }}>Betaalhistorie</p>
                  <div style={{ maxHeight:180, overflowY:'auto', display:'flex', flexDirection:'column', gap:2 }}>
                    {hist.map(p => (
                      <div key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.3rem 0.5rem', background:'var(--surface-2)', borderRadius:6, fontSize:'0.8rem' }}>
                        <span style={{ color:'var(--text-muted)' }}>{fmtDate(p.created_at)}</span>
                        <span>{p.description||'—'}</span>
                        <span style={{ fontWeight:700, color:p.status==='paid'?'var(--success)':'var(--error)' }}>{fmtMoney(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )
}

function BetalingenSection() {
  const [failures,    setFailures]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [selectedId,  setSelectedId]  = useState(null)

  const load = () => {
    setLoading(true)
    api.get('/admin/payment-failures').then(r => { setFailures(r.data.failures); setLoading(false) }).catch(() => setLoading(false))
  }

  useEffect(load, [])

  const runAutoRemind = async () => {
    try {
      const r = await api.post('/admin/payment-failures/auto-remind')
      alert(`Auto-herinneringen: dag0=${r.data.results.day0}, dag3=${r.data.results.day3}, dag7=${r.data.results.day7}, gepauzeerd=${r.data.results.auto_paused}`)
      load()
    } catch(e) { alert(e.response?.data?.error||'Fout') }
  }

  if (loading) return <p style={{color:'var(--text-muted)'}}>Laden…</p>

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
        <h2 style={{ margin:0 }}>Openstaande Betalingen</h2>
        <button className="btn btn-ghost btn-sm" onClick={runAutoRemind} title="Verwerk automatische herinneringen">
          <RefreshCw size={13}/> Auto-herinner
        </button>
      </div>
      {failures.length === 0 && (
        <div style={{textAlign:'center',padding:'4rem',color:'var(--text-muted)'}}>
          <p style={{fontSize:'3rem',marginBottom:'0.5rem'}}>✅</p>
          <p>Geen openstaande betalingen</p>
        </div>
      )}
      {failures.map(f => {
        const daysOld = Math.floor((Date.now() - new Date(f.created_at)) / 86400000)
        const total   = Number(f.amount) + Number(f.surcharge_added || 0)
        return (
          <div key={f.id} className="card"
            style={{ marginBottom:'0.75rem', borderColor:f.failure_count>=2?'var(--error)':'var(--border)', cursor:'pointer' }}
            onClick={() => setSelectedId(f.id)}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div>
                <div style={{fontWeight:700}}>{f.first_name} {f.last_name}</div>
                <div style={{fontSize:'0.85rem',color:'var(--text-muted)'}}>{f.email}</div>
                {f.description && <div style={{fontSize:'0.8rem',color:'var(--text-2)',marginTop:3}}>{f.description}</div>}
                <div style={{ display:'flex', gap:'0.4rem', marginTop:6, flexWrap:'wrap' }}>
                  {f.reminder_day0_sent ? <span style={{ fontSize:'0.72rem', padding:'1px 6px', borderRadius:10, background:'var(--surface-3)', color:'var(--text-muted)' }}>D0 ✓</span> : null}
                  {f.reminder_day3_sent ? <span style={{ fontSize:'0.72rem', padding:'1px 6px', borderRadius:10, background:'var(--surface-3)', color:'var(--text-muted)' }}>D3 ✓</span> : null}
                  {f.reminder_day7_sent ? <span style={{ fontSize:'0.72rem', padding:'1px 6px', borderRadius:10, background:'var(--surface-3)', color:'var(--text-muted)' }}>D7 ✓</span> : null}
                  {f.auto_paused_at ? <span style={{ fontSize:'0.72rem', padding:'1px 6px', borderRadius:10, background:'rgba(239,68,68,0.15)', color:'var(--error)' }}>Gepauzeerd</span> : null}
                </div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontWeight:800,fontSize:'1.2rem',color:'var(--error)'}}>{fmtMoney(total)}</div>
                {f.surcharge_added>0 && <div style={{fontSize:'0.75rem',color:'var(--error)'}}>incl. €{f.surcharge_added} toeslag</div>}
                <div style={{fontSize:'0.78rem',color:'var(--text-muted)',marginTop:2}}>{f.failure_count}× mislukt · {daysOld}d</div>
                <div style={{ fontSize:'0.72rem', color:'var(--accent)', marginTop:4 }}>Klik voor details →</div>
              </div>
            </div>
          </div>
        )
      })}

      {selectedId && (
        <PaymentDetailModal
          failureId={selectedId}
          onClose={() => setSelectedId(null)}
          onRefresh={load}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// VT AGENDA (Admin) — slots + boekingen beheren
// ════════════════════════════════════════════════════════════════════
function VTAgendaSection() {
  const [slots,      setSlots]      = useState([])
  const [members,    setMembers]    = useState([])
  const [tab,        setTab]        = useState('pending')
  const [showNew,    setShowNew]    = useState(false)
  const [newSlot,    setNewSlot]    = useState({ date:'', start_time:'08:00', end_time:'10:00', max_bookings:10, notes:'' })
  const [directSlot, setDirectSlot] = useState(null)
  const [selMember,  setSelMember]  = useState('')

  const today = new Date().toISOString().split('T')[0]
  const to    = new Date(Date.now() + 60*86400000).toISOString().split('T')[0]
  const HOURS = []
  for (let h = 8; h <= 22; h++) HOURS.push(`${String(h).padStart(2,'0')}:00`)

  const reload = () => {
    api.get(`/vt/admin/slots?from=${today}&to=${to}`).then(r => setSlots(r.data.slots || [])).catch(() => {})
    api.get('/admin/members').then(r => setMembers(r.data.members || [])).catch(() => {})
  }
  useEffect(reload, [])

  const pendingSlots   = slots.filter(s => Number(s.pending_count) > 0)
  const allUpcoming    = slots.filter(s => s.date >= today)
  const bookings       = slots.flatMap(s => (s.bookings||[]).map(b => ({...b, slot_date:s.date, slot_start:s.start_time, slot_end:s.end_time})))
  const pendingBooks   = bookings.filter(b => b.status === 'requested')
  const confirmedBooks = bookings.filter(b => b.status === 'confirmed')

  const createSlot = async () => {
    if (!newSlot.date || !newSlot.start_time || !newSlot.end_time) return alert('Vul datum en tijden in.')
    try {
      await api.post('/vt/admin/slots', newSlot)
      setShowNew(false); setNewSlot({ date:'', start_time:'08:00', end_time:'10:00', max_bookings:10, notes:'' }); reload()
    } catch(e) { alert(e.response?.data?.error||'Fout') }
  }

  const confirmB = async id => { await api.put(`/vt/admin/bookings/${id}/confirm`); reload() }
  const declineB = async id => { await api.put(`/vt/admin/bookings/${id}/decline`); reload() }

  const doDirectBook = async () => {
    if (!selMember || !directSlot) return
    try {
      await api.post(`/vt/admin/slots/${directSlot.id}/book-member`, { user_id: parseInt(selMember) })
      setDirectSlot(null); setSelMember(''); reload()
    } catch(e) { alert(e.response?.data?.error||'Fout') }
  }

  const deleteSlot = async id => {
    if (!confirm('Slot verwijderen? Alle aanvragen worden geannuleerd.')) return
    await api.delete(`/vt/admin/slots/${id}`); reload()
  }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem' }}>
        <div className="tab-bar">
          {[
            ['pending',  `Aanvragen (${pendingBooks.length})`],
            ['confirmed','Bevestigd'],
            ['slots',    `Slots (${allUpcoming.length})`],
          ].map(([k,l]) => <button key={k} className={`tab-btn${tab===k?' active':''}`} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        {tab === 'slots' && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowNew(s=>!s)}>
            {showNew ? <X size={13}/> : <Plus size={13}/>} Nieuw slot
          </button>
        )}
      </div>

      {/* Nieuw slot form */}
      {tab === 'slots' && showNew && (
        <div className="card" style={{ marginBottom:'1rem' }}>
          <h3 style={{ marginBottom:'0.75rem' }}>Slot aanmaken</h3>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
            <div><label className="input-label">Datum</label>
              <input className="input" type="date" min={today} value={newSlot.date} onChange={e => setNewSlot({...newSlot,date:e.target.value})}/></div>
            <div><label className="input-label">Max personen</label>
              <input className="input" type="number" min="1" value={newSlot.max_bookings} onChange={e => setNewSlot({...newSlot,max_bookings:parseInt(e.target.value)})}/></div>
            <div><label className="input-label">Van</label>
              <select className="input" value={newSlot.start_time} onChange={e => setNewSlot({...newSlot,start_time:e.target.value})}>
                {HOURS.map(h=><option key={h} value={h}>{h}</option>)}</select></div>
            <div><label className="input-label">Tot</label>
              <select className="input" value={newSlot.end_time} onChange={e => setNewSlot({...newSlot,end_time:e.target.value})}>
                {HOURS.filter(h=>h>newSlot.start_time).map(h=><option key={h} value={h}>{h}</option>)}</select></div>
            <div style={{ gridColumn:'span 2' }}><label className="input-label">Notities</label>
              <input className="input" value={newSlot.notes} onChange={e => setNewSlot({...newSlot,notes:e.target.value})} placeholder="Optioneel…"/></div>
          </div>
          <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.75rem' }}>
            <button className="btn btn-primary btn-sm" onClick={createSlot}><Check size={13}/> Aanmaken</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowNew(false)}><X size={13}/> Annuleren</button>
          </div>
        </div>
      )}

      {/* Aanvragen tab */}
      {tab === 'pending' && (
        <div>
          {pendingBooks.length === 0 && <p style={{ color:'var(--text-muted)' }}>Geen openstaande aanvragen</p>}
          {pendingBooks.map(b => (
            <div key={b.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.75rem', background:'var(--surface-2)', borderRadius:'var(--r)', marginBottom:'0.5rem' }}>
              <div>
                <div style={{ fontWeight:600, fontSize:'0.875rem' }}>{b.first_name} {b.last_name}</div>
                <div style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>{b.slot_date} · {b.slot_start}–{b.slot_end}</div>
                {b.notes && <div style={{ fontSize:'0.75rem', color:'var(--text-2)' }}>{b.notes}</div>}
              </div>
              <div style={{ display:'flex', gap:'0.5rem' }}>
                <button className="btn btn-sm" style={{ background:'var(--success-dim)',color:'var(--success)' }} onClick={() => confirmB(b.id)}><Check size={13}/> Bevestig</button>
                <button className="btn btn-danger btn-sm" onClick={() => declineB(b.id)}><X size={13}/> Weiger</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bevestigd tab */}
      {tab === 'confirmed' && (
        <div>
          {confirmedBooks.length === 0 && <p style={{ color:'var(--text-muted)' }}>Geen bevestigde boekingen</p>}
          {confirmedBooks.map(b => (
            <div key={b.id} style={{ display:'flex', justifyContent:'space-between', padding:'0.6rem 0.75rem', background:'var(--surface-2)', borderRadius:'var(--r)', marginBottom:'0.4rem', fontSize:'0.875rem' }}>
              <span style={{ fontWeight:600 }}>{b.first_name} {b.last_name}</span>
              <span style={{ color:'var(--text-muted)' }}>{b.slot_date} · {b.slot_start}–{b.slot_end}</span>
            </div>
          ))}
        </div>
      )}

      {/* Slots tab */}
      {tab === 'slots' && allUpcoming.map(s => (
        <div key={s.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.75rem', background:'var(--surface-2)', borderRadius:'var(--r)', marginBottom:'0.5rem' }}>
          <div>
            <div style={{ fontWeight:600, fontSize:'0.875rem' }}>{s.date} · {s.start_time}–{s.end_time}</div>
            <div style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>
              {s.booking_count}/{s.max_bookings} pers.
              {s.pending_count > 0 && <span style={{ marginLeft:6, color:'var(--warning)' }}>{s.pending_count} aanvraag{s.pending_count>1?'en':''}</span>}
              {s.confirmed_count > 0 && <span style={{ marginLeft:6, color:'var(--success)' }}>{s.confirmed_count} bevestigd</span>}
            </div>
            {s.notes && <div style={{ fontSize:'0.75rem', color:'var(--text-2)' }}>{s.notes}</div>}
          </div>
          <div style={{ display:'flex', gap:'0.5rem', flexShrink:0, alignItems:'center' }}>
            {directSlot?.id === s.id ? (
              <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
                <select className="input" style={{ minWidth:160, padding:'4px 8px', fontSize:'0.8rem' }} value={selMember} onChange={e => setSelMember(e.target.value)}>
                  <option value="">— Lid —</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
                </select>
                <button className="btn btn-primary btn-sm" onClick={doDirectBook}><Check size={13}/></button>
                <button className="btn btn-ghost btn-sm" onClick={() => setDirectSlot(null)}><X size={13}/></button>
              </div>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => setDirectSlot(s)}>
                <Plus size={13}/> Boek lid
              </button>
            )}
            <button className="btn btn-danger btn-sm" onClick={() => deleteSlot(s.id)}><Trash2 size={13}/></button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// COMMUNITY BEHEER
// ════════════════════════════════════════════════════════════════════
function CommunityBeheer() {
  const [posts,   setPosts]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/community?limit=50').then(r => { setPosts(r.data.posts); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const deletePost  = async id => { if (!confirm('Verwijderen?')) return; await api.delete(`/community/${id}`); setPosts(p => p.filter(x => x.id!==id)) }
  const togglePin   = async (id, pinned) => { await api.put(`/community/${id}/pin`,{pinned:!pinned}); setPosts(p => p.map(x => x.id===id?{...x,pinned:!pinned}:x)) }

  if (loading) return <p style={{color:'var(--text-muted)'}}>Laden…</p>

  return (
    <div>
      <h2 style={{marginBottom:'1.5rem'}}>Community berichten</h2>
      {posts.map(p => (
        <div key={p.id} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'0.75rem',background:'var(--surface-2)',borderRadius:'var(--r)',marginBottom:'0.4rem'}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:600,fontSize:'0.875rem',display:'flex',alignItems:'center',gap:4}}>
              {p.first_name} {p.last_name}
              {p.author_role==='admin' && <Crown size={12} style={{color:'var(--accent)'}}/>}
              {p.pinned && <Pin size={12} style={{color:'var(--accent)'}}/>}
            </div>
            {p.title && <div style={{fontWeight:700,color:'var(--text-2)',fontSize:'0.85rem'}}>{p.title}</div>}
            <div style={{fontSize:'0.8rem',color:'var(--text-muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.body}</div>
            <div style={{fontSize:'0.75rem',color:'var(--text-muted)',marginTop:2}}>❤ {p.like_count} · 💬 {p.comment_count} · {new Date(p.created_at).toLocaleDateString('nl-NL')}</div>
          </div>
          <div style={{display:'flex',gap:'0.25rem',flexShrink:0,marginLeft:'0.75rem'}}>
            <button className="btn-icon" onClick={() => togglePin(p.id,p.pinned)}><Pin size={13}/></button>
            <button className="btn-icon" onClick={() => deletePost(p.id)}><Trash2 size={13}/></button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// ROOSTER
// ════════════════════════════════════════════════════════════════════
function RoosterSection() {
  const [classes, setClasses] = useState([])
  const [tab,     setTab]     = useState('upcoming')
  const [showNew, setShowNew] = useState(false)
  const [form,    setForm]    = useState({name:'',instructor:'Mohammed',category:'kickboksen-recreanten',date_time:'',duration_minutes:60,max_capacity:18,location:'Zaal A'})

  useEffect(() => { api.get('/admin/classes').then(r => setClasses(r.data.classes)).catch(() => {}) }, [])

  const CATS = ['kickboksen-kids','kickboksen-recreanten','kickboksen-ladies-only','kickboksen-jeugd','boksen-recreanten','boksen-ladies-only','jeugd']
  const upcoming = classes.filter(c => new Date(c.date_time) > new Date() && c.status==='scheduled')
  const past     = classes.filter(c => new Date(c.date_time) <= new Date() || c.status!=='scheduled')

  const createClass = async () => {
    try {
      const r = await api.post('/admin/classes', form)
      setClasses(c => [r.data.class,...c]); setShowNew(false)
    } catch(e) { alert(e.response?.data?.error||'Fout') }
  }
  const cancelClass = async id => {
    if (!confirm('Les annuleren?')) return
    await api.delete(`/admin/classes/${id}`)
    setClasses(c => c.map(x => x.id===id?{...x,status:'cancelled'}:x))
  }

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div className="tab-bar">
          <button className={`tab-btn${tab==='upcoming'?' active':''}`} onClick={() => setTab('upcoming')}>Aankomend ({upcoming.length})</button>
          <button className={`tab-btn${tab==='past'?' active':''}`} onClick={() => setTab('past')}>Verleden</button>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNew(s=>!s)}>{showNew?<X size={13}/>:<Plus size={13}/>} Nieuwe les</button>
      </div>
      {showNew && (
        <div className="card" style={{marginBottom:'1rem'}}>
          <h3 style={{marginBottom:'0.75rem'}}>Nieuwe les</h3>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.75rem'}}>
            <div><label className="input-label">Naam</label><input className="input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div>
            <div><label className="input-label">Categorie</label><select className="input" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{CATS.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
            <div><label className="input-label">Trainer</label><select className="input" value={form.instructor} onChange={e=>setForm({...form,instructor:e.target.value})}>{['Mohammed','Ecrin','Joep'].map(t=><option key={t}>{t}</option>)}</select></div>
            <div><label className="input-label">Datum & tijd</label><input className="input" type="datetime-local" value={form.date_time} onChange={e=>setForm({...form,date_time:e.target.value})}/></div>
            <div><label className="input-label">Max deelnemers</label><input className="input" type="number" value={form.max_capacity} onChange={e=>setForm({...form,max_capacity:parseInt(e.target.value)})}/></div>
            <div><label className="input-label">Locatie</label><input className="input" value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/></div>
          </div>
          <div style={{display:'flex',gap:'0.5rem',marginTop:'0.75rem'}}>
            <button className="btn btn-primary btn-sm" onClick={createClass}><Check size={13}/> Aanmaken</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowNew(false)}><X size={13}/> Annuleren</button>
          </div>
        </div>
      )}
      {(tab==='upcoming'?upcoming:past).map(c => (
        <div key={c.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.6rem 0.75rem',background:'var(--surface-2)',borderRadius:'var(--r)',marginBottom:'0.4rem'}}>
          <div>
            <div style={{fontWeight:600,fontSize:'0.875rem'}}>{c.name}</div>
            <div style={{fontSize:'0.78rem',color:'var(--text-muted)'}}>{fmtDT(c.date_time)} · {c.instructor} · {c.confirmed_bookings}/{c.max_capacity}</div>
          </div>
          {c.status==='scheduled' ? (
            <button className="btn btn-danger btn-sm" onClick={() => cancelClass(c.id)}><X size={13}/></button>
          ) : <span style={{fontSize:'0.75rem',color:'var(--error)'}}>Geannuleerd</span>}
        </div>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// BETALINGEN OVERVIEW
// ════════════════════════════════════════════════════════════════════
function BetalingOverview() {
  const [payments, setPayments] = useState([])
  useEffect(() => { api.get('/admin/payments').then(r => setPayments(r.data.payments)).catch(() => {}) }, [])
  return (
    <div>
      <h2 style={{marginBottom:'1.5rem'}}>Alle betalingen</h2>
      {payments.map(p => (
        <div key={p.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.6rem 0.75rem',background:'var(--surface-2)',borderRadius:'var(--r)',marginBottom:'0.4rem'}}>
          <div>
            <div style={{fontWeight:600,fontSize:'0.875rem'}}>{p.first_name} {p.last_name}</div>
            <div style={{fontSize:'0.78rem',color:'var(--text-muted)'}}>{p.description||p.membership_name}</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontWeight:700,color:p.status==='paid'?'var(--success)':'var(--warning)'}}>{fmtMoney(p.amount)}</div>
            <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>{fmtDate(p.created_at)}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// HOOFD COMPONENT
// ════════════════════════════════════════════════════════════════════
const MENU = [
  { key:'dashboard',  label:'Dashboard',       Icon:LayoutDashboard },
  { key:'leden',      label:'Leden',            Icon:Users           },
  { key:'pt',         label:'PT Agenda',         Icon:Zap             },
  { key:'vt',         label:'Vrij Trainen',      Icon:Calendar        },
  { key:'betalingen', label:'Betalingsfouten',   Icon:AlertTriangle   },
  { key:'community',  label:'Community',         Icon:Users2          },
  { key:'rooster',    label:'Rooster',           Icon:Calendar        },
  { key:'payments',   label:'Betalingen',        Icon:CreditCard      },
]

export default function AdminPage() {
  const [section, setSection] = useState('dashboard')

  return (
    <div className="admin-page">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-title">Admin</div>
        {MENU.map(({ key, label, Icon }) => (
          <button key={key} className={`admin-menu-item${section===key?' active':''}`} onClick={() => setSection(key)}>
            <Icon size={15}/> {label}
          </button>
        ))}
      </aside>
      <main className="admin-content">
        {section==='dashboard'  && <DashboardSection/>}
        {section==='leden'      && <LedenSection/>}
        {section==='pt'         && <PTAgendaSection/>}
        {section==='vt'         && <VTAgendaSection/>}
        {section==='betalingen' && <BetalingenSection/>}
        {section==='community'  && <CommunityBeheer/>}
        {section==='rooster'    && <RoosterSection/>}
        {section==='payments'   && <BetalingOverview/>}
      </main>
    </div>
  )
}
