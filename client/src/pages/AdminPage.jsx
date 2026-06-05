import { useState, useEffect, useRef } from 'react'
import {
  LayoutDashboard, Users, Calendar, CreditCard,
  Zap, AlertTriangle, Users2,
  Search, Plus, Check, X, Euro, Clock, Edit2, Trash2,
  Bell, PauseCircle, PlayCircle, Pin, Crown, Link, ChevronLeft, RefreshCw,
  TrendingUp, Banknote, FileText, ChevronDown, ChevronUp
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
// ADD MEMBER VIA IBAN MODAL
// ════════════════════════════════════════════════════════════════════
function AddMemberModal({ onClose, onCreated }) {
  const [memberships,  setMemberships]  = useState([])
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '', iban: '', membership_id: '', payment_method: 'sepa'
  })
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  useEffect(() => {
    api.get('/memberships').then(r => {
      const mbs = r.data.memberships || []
      // Only groepslessen (have a monthly price suitable for SEPA)
      const suitable = mbs.filter(m => m.price_monthly && Number(m.price_monthly) > 0)
      setMemberships(suitable)
      if (suitable.length > 0 && !form.membership_id) {
        setForm(f => ({ ...f, membership_id: suitable[0].id }))
      }
    }).catch(() => {})
  }, [])

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  const submit = async () => {
    setError('')
    if (!form.first_name || !form.last_name || !form.email || !form.membership_id) {
      setError('Vul alle verplichte velden in.')
      return
    }
    // IBAN check alleen als SEPA en ingevuld
    let ibanClean = ''
    if (form.payment_method === 'sepa' && form.iban) {
      ibanClean = form.iban.replace(/\s/g, '').toUpperCase()
      if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$/.test(ibanClean)) {
        setError('Ongeldig IBAN formaat.')
        return
      }
    }
    setLoading(true)
    try {
      const r = await api.post('/admin/members/create-sepa', {
        ...form,
        iban: form.payment_method === 'sepa' ? (ibanClean || undefined) : undefined,
        membership_id: parseInt(form.membership_id),
      })
      setSuccess(r.data.message)
      onCreated?.()
    } catch (e) {
      setError(e.response?.data?.error || 'Fout bij aanmaken lid.')
    }
    setLoading(false)
  }

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex',
      alignItems:'center', justifyContent:'center', zIndex:1000, padding:'1rem'
    }}>
      <div className="card" style={{width:'100%', maxWidth:520, maxHeight:'90vh', overflowY:'auto'}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem'}}>
          <h2 style={{margin:0, fontSize:'1.1rem'}}>
            {form.payment_method === 'sepa' ? 'Nieuw lid via SEPA incasso' : 'Nieuw lid aanmaken'}
          </h2>
          <button className="btn-icon" onClick={onClose}><X size={18}/></button>
        </div>

        {success ? (
          <div>
            <div style={{background:'var(--success-dim,rgba(34,197,94,0.1))',border:'1px solid var(--success,#22c55e)',borderRadius:'var(--r)',padding:'1.25rem',marginBottom:'1rem'}}>
              <p style={{color:'var(--success,#22c55e)',fontWeight:600,margin:0}}>✓ {success}</p>
              <p style={{color:'var(--text-muted)',fontSize:'0.85rem',margin:'0.5rem 0 0'}}>
                De welkomstmail met tijdelijk wachtwoord is verstuurd. Het lid kan direct inloggen.
              </p>
            </div>
            <button className="btn btn-primary" onClick={onClose}>Sluiten</button>
          </div>
        ) : (
          <div style={{display:'flex', flexDirection:'column', gap:'0.75rem'}}>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem'}}>
              <div>
                <label className="input-label">Voornaam *</label>
                <input className="input" value={form.first_name} onChange={set('first_name')} placeholder="Jan"/>
              </div>
              <div>
                <label className="input-label">Achternaam *</label>
                <input className="input" value={form.last_name} onChange={set('last_name')} placeholder="de Vries"/>
              </div>
            </div>
            <div>
              <label className="input-label">E-mailadres *</label>
              <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="jan@email.nl"/>
            </div>
            <div>
              <label className="input-label">Telefoonnummer</label>
              <input className="input" type="tel" value={form.phone} onChange={set('phone')} placeholder="+31 6 12345678"/>
            </div>
            <div>
              <label className="input-label">Betalingswijze *</label>
              <select className="input" value={form.payment_method} onChange={set('payment_method')}>
                <option value="sepa">SEPA Incasso</option>
                <option value="jeugdfonds">Jeugdfonds Sport</option>
                <option value="volwassenenfonds">Volwassenenfonds</option>
                <option value="pgb">PGB</option>
                <option value="zin">Zorg in Natura (ZIN)</option>
                <option value="cash">Cash</option>
              </select>
            </div>
            {form.payment_method === 'sepa' && (
              <div>
                <label className="input-label">IBAN <span style={{fontWeight:400,color:'var(--text-muted)'}}>— optioneel</span></label>
                <input
                  className="input"
                  value={form.iban}
                  onChange={set('iban')}
                  placeholder="NL91 ABNA 0417 1643 00"
                  style={{fontFamily:'monospace', letterSpacing:'0.05em'}}
                />
                <p style={{fontSize:'0.75rem', color:'var(--text-muted)', marginTop:3}}>
                  Optioneel — voor SEPA incasso later in te vullen
                </p>
              </div>
            )}
            <div>
              <label className="input-label">Abonnement *</label>
              <select className="input" value={form.membership_id} onChange={set('membership_id')}>
                {memberships.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.category} — {m.name} · €{Number(m.price_monthly).toFixed(2)}/mnd
                  </option>
                ))}
              </select>
            </div>

            <div style={{background:'var(--surface-2)', borderRadius:'var(--r)', padding:'0.75rem', fontSize:'0.8rem', color:'var(--text-muted)', lineHeight:1.6}}>
              <strong style={{color:'var(--text-2)'}}>Wat er gebeurt:</strong><br/>
              {form.payment_method === 'sepa' && <>
                1. Account aangemaakt met tijdelijk wachtwoord<br/>
                2. Mollie klant + SEPA mandate aangemaakt<br/>
                3. Recurring subscription gestart (volgende maand)<br/>
                4. Welkomstmail verstuurd naar het lid
              </>}
              {form.payment_method === 'jeugdfonds' && <>
                1. Account aangemaakt met tijdelijk wachtwoord<br/>
                2. Lidmaatschap geactiveerd (Jeugdfonds Sport)<br/>
                3. Welkomstmail verstuurd — geen automatische incasso
              </>}
              {form.payment_method === 'volwassenenfonds' && <>
                1. Account aangemaakt met tijdelijk wachtwoord<br/>
                2. Lidmaatschap geactiveerd (Volwassenenfonds)<br/>
                3. Welkomstmail verstuurd — geen automatische incasso
              </>}
              {form.payment_method === 'pgb' && <>
                1. Account aangemaakt met tijdelijk wachtwoord<br/>
                2. Lidmaatschap geactiveerd (PGB)<br/>
                3. Welkomstmail verstuurd — declaratie verloopt via PGB
              </>}
              {form.payment_method === 'zin' && <>
                1. Account aangemaakt met tijdelijk wachtwoord<br/>
                2. Lidmaatschap geactiveerd (Zorg in Natura)<br/>
                3. Welkomstmail verstuurd — declaratie verloopt via ZIN
              </>}
              {form.payment_method === 'cash' && <>
                1. Account aangemaakt met tijdelijk wachtwoord<br/>
                2. Lidmaatschap geactiveerd (cash betaler)<br/>
                3. Welkomstmail verstuurd — betaling loopt via de balie
              </>}
            </div>

            {error && <p style={{color:'var(--error)', fontSize:'0.85rem', margin:0}}>{error}</p>}

            <div style={{display:'flex', gap:'0.75rem', paddingTop:'0.25rem'}}>
              <button className="btn btn-primary" onClick={submit} disabled={loading} style={{flex:1}}>
                {loading ? <span className="spinner spinner-sm"/> : <><Plus size={15}/> Lid aanmaken</>}
              </button>
              <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

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
  const [showAddMember, setShowAddMember] = useState(false)
  const [showAssign,    setShowAssign]    = useState(false)
  const [assignType,    setAssignType]    = useState(MEMBERSHIP_TYPES[0].key)
  const [assignPrice,   setAssignPrice]   = useState('')
  const [assignCash,    setAssignCash]    = useState(false)
  const [assignPaid,    setAssignPaid]    = useState(false)
  const [assignStart,   setAssignStart]   = useState(new Date().toISOString().split('T')[0])
  const [assignNotes,   setAssignNotes]   = useState('')
  const [assignPayment, setAssignPayment] = useState('mollie')    // 'mollie'|'cash'|'fonds'
  const [assignQuarter, setAssignQuarter] = useState('')          // kwartaalbedrag
  const [fondsType,     setFondsType]     = useState('jeugdsportfonds')
  const [fondsName,     setFondsName]     = useState('')
  const [fondsEnd,      setFondsEnd]      = useState('')
  const [fondsBedrag,   setFondsBedrag]   = useState('')
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
        is_cash: assignPayment === 'cash', cash_paid: assignPaid,
        start_date: assignStart, notes: assignNotes || undefined,
        payment_type: assignPayment,
        quarterly_amount: assignPayment === 'cash' ? (parseFloat(assignQuarter) || null) : null,
        fonds_type: assignPayment === 'fonds' ? fondsType : undefined,
        fonds_name: assignPayment === 'fonds' ? (fondsName || fondsType) : undefined,
        fonds_end_date: assignPayment === 'fonds' ? fondsEnd : undefined,
        fonds_amount_covered: assignPayment === 'fonds' ? (parseFloat(fondsBedrag) || null) : undefined,
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
      {showAddMember && (
        <AddMemberModal
          onClose={() => setShowAddMember(false)}
          onCreated={() => { loadMembers(search) }}
        />
      )}
      {/* Lijst */}
      <div>
        <div style={{display:'flex', gap:'0.5rem', marginBottom:'1rem', alignItems:'center'}}>
          <div className="search-box" style={{flex:1, margin:0}}>
            <Search size={16} style={{color:'var(--text-muted)'}}/>
            <input className="search-input" placeholder="Zoek naam of e-mail…" value={search} onChange={e => handleSearch(e.target.value)}/>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddMember(true)} title="Nieuw lid via SEPA incasso">
            <Plus size={14}/> SEPA
          </button>
        </div>
        {loading && <p style={{color:'var(--text-muted)',fontSize:'0.875rem'}}>Laden…</p>}
        <div style={{display:'flex',flexDirection:'column',gap:'0.4rem'}}>
          {members.map(m => (
            <div key={m.id} className={`member-row${selected===m.id?' active':''}`} onClick={() => openMember(m.id)}>
              <div className="member-row-avatar">{(m.first_name?.[0]||'?')+(m.last_name?.[0]||'')}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,fontSize:'0.875rem',display:'flex',alignItems:'center',gap:4,flexWrap:'wrap'}}>
                  {m.first_name} {m.last_name}
                  {m.payment_method === 'sepa'             && <span className="badge-info">SEPA</span>}
                  {m.payment_method === 'jeugdfonds'       && <span className="badge-success">Jeugdfonds</span>}
                  {m.payment_method === 'volwassenenfonds' && <span className="badge-success">V.fonds</span>}
                  {m.payment_method === 'pgb'              && <span className="badge-success">PGB</span>}
                  {m.payment_method === 'zin'              && <span className="badge-success">ZIN</span>}
                  {m.payment_method === 'cash'             && <span className="badge-warning">Cash</span>}
                  {m.is_cash_payer && !m.payment_method    ? <span className="badge-warning">Cash</span> : null}
                  {m.membership_paused ? <span className="badge-error">Gepauzeerd</span> : null}
                  {m.fonds_days_remaining != null && m.fonds_days_remaining <= 30 && (
                    m.fonds_days_remaining <= 0
                      ? <span className="badge-error">Fonds verlopen</span>
                      : <span className="badge-warning">Fonds: {Math.round(m.fonds_days_remaining)}d</span>
                  )}
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

                    {/* Type */}
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

                    {/* Prijs */}
                    {needsPrice && (
                      <div>
                        <label className="input-label">{selectedMtype?.category==='PT Abo'?'Prijs/maand':'Prijs'} (€)</label>
                        <input className="input" type="number" value={assignPrice} onChange={e => setAssignPrice(e.target.value)} placeholder={selectedMtype?.price_monthly||selectedMtype?.price_per_lesson||''}/>
                      </div>
                    )}

                    {/* Betalingsmethode */}
                    <div>
                      <label className="input-label">Betalingsmethode</label>
                      <div style={{display:'flex',gap:'0.4rem'}}>
                        {[['mollie','💳 Mollie'],['cash','💵 Cash kwartaal'],['fonds','🏛️ Fonds']].map(([k,l]) => (
                          <button key={k} className={`btn btn-sm${assignPayment===k?' btn-primary':' btn-ghost'}`} style={{flex:1,fontSize:'0.78rem'}} onClick={() => setAssignPayment(k)}>{l}</button>
                        ))}
                      </div>
                    </div>

                    {/* Cash kwartaal velden */}
                    {assignPayment === 'cash' && (
                      <div>
                        <label className="input-label">Kwartaalbedrag (€)</label>
                        <input className="input" type="number" placeholder="150" value={assignQuarter} onChange={e => setAssignQuarter(e.target.value)}/>
                        <p style={{fontSize:'0.75rem',color:'var(--text-muted)',marginTop:3}}>Elke 3 maanden te betalen aan de balie</p>
                      </div>
                    )}

                    {/* Fonds velden */}
                    {assignPayment === 'fonds' && (
                      <div style={{display:'flex',flexDirection:'column',gap:'0.5rem',padding:'0.6rem',background:'var(--surface-2)',borderRadius:'var(--r)'}}>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.5rem'}}>
                          <div>
                            <label className="input-label">Fonds type</label>
                            <select className="input" value={fondsType} onChange={e => setFondsType(e.target.value)}>
                              <option value="jeugdsportfonds">Jeugdsportfonds</option>
                              <option value="volwassenenfonds">Volwassenenfonds</option>
                              <option value="overig">Overig</option>
                            </select>
                          </div>
                          <div>
                            <label className="input-label">Fonds naam</label>
                            <input className="input" placeholder="Optioneel" value={fondsName} onChange={e => setFondsName(e.target.value)}/>
                          </div>
                          <div>
                            <label className="input-label">Einddatum fonds</label>
                            <input className="input" type="date" value={fondsEnd} onChange={e => setFondsEnd(e.target.value)}/>
                          </div>
                          <div>
                            <label className="input-label">Bedrag gedekt (€)</label>
                            <input className="input" type="number" placeholder="0" value={fondsBedrag} onChange={e => setFondsBedrag(e.target.value)}/>
                          </div>
                        </div>
                      </div>
                    )}

                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.6rem'}}>
                      <div><label className="input-label">Startdatum</label><input className="input" type="date" value={assignStart} onChange={e => setAssignStart(e.target.value)}/></div>
                      {assignPayment === 'mollie' && (
                        <div style={{display:'flex',flexDirection:'column',gap:4,justifyContent:'flex-end'}}>
                          <label style={{display:'flex',alignItems:'center',gap:6,fontSize:'0.83rem',cursor:'pointer'}}><input type="checkbox" checked={assignPaid} onChange={e=>setAssignPaid(e.target.checked)}/> Eerste betaling ontvangen</label>
                        </div>
                      )}
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

              {/* Betalingstype & kwartaal info */}
              {activeMem && (
                <div className="card">
                  <h3 style={{marginBottom:'0.75rem'}}>Betalingstype</h3>
                  <div style={{display:'flex',alignItems:'center',gap:'0.75rem',marginBottom:'0.5rem'}}>
                    {activeMem.payment_type === 'mollie' && <span className="badge-neutral">💳 Mollie (automatisch)</span>}
                    {activeMem.payment_type === 'cash'   && <span className="badge-warning">💵 Cash kwartaal</span>}
                    {activeMem.payment_type === 'fonds'  && <span style={{padding:'2px 8px',borderRadius:10,background:'rgba(99,102,241,0.2)',color:'#818cf8',fontSize:'0.78rem',fontWeight:600}}>🏛️ Fonds</span>}
                    {(!activeMem.payment_type || activeMem.payment_type === 'mollie') && null}
                  </div>

                  {/* Cash kwartaal tracking */}
                  {activeMem.payment_type === 'cash' && (
                    <div style={{background:'var(--surface-2)',borderRadius:8,padding:'0.6rem 0.75rem',display:'flex',flexDirection:'column',gap:'0.4rem'}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.85rem'}}>
                        <span style={{color:'var(--text-muted)'}}>Kwartaalbedrag</span>
                        <span style={{fontWeight:700}}>€{activeMem.quarterly_amount||'—'}</span>
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.85rem'}}>
                        <span style={{color:'var(--text-muted)'}}>Laatste betaling</span>
                        <span>{activeMem.last_quarter_paid?fmtDate(activeMem.last_quarter_paid):'—'}</span>
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.85rem'}}>
                        <span style={{color:'var(--text-muted)'}}>Volgende betaling</span>
                        {activeMem.next_quarter_due ? (
                          <span style={{fontWeight:700,color:new Date(activeMem.next_quarter_due)<new Date(Date.now()+14*86400000)?'var(--warning)':'var(--success)'}}>
                            {fmtDate(activeMem.next_quarter_due)}
                          </span>
                        ) : <span>—</span>}
                      </div>
                      <button className="btn btn-primary btn-sm" style={{marginTop:'0.4rem',alignSelf:'flex-start'}}
                        onClick={async () => {
                          const amount = prompt('Bedrag ontvangen (€):', activeMem.quarterly_amount||'150')
                          if (!amount) return
                          try {
                            const r = await api.put(`/cash/memberships/${activeMem.id}/quarterly-paid`, {
                              amount: parseFloat(amount),
                              note: `Cash kwartaalbetaling ontvangen`,
                            })
                            alert(`Geregistreerd! Volgende betaling: ${r.data.next_due}`)
                            openMember(selected)
                          } catch(e) { alert(e.response?.data?.error||'Fout') }
                        }}>
                        <Check size={13}/> Kwartaalbetaling ontvangen
                      </button>
                    </div>
                  )}

                  {/* Fonds info */}
                  {activeMem.payment_type === 'fonds' && detail.fonds?.length > 0 && (() => {
                    const fonds = detail.fonds[0]
                    const daysLeft = Number(fonds.days_remaining || 0)
                    const urgentColor = daysLeft < 7 ? 'var(--error)' : daysLeft < 14 ? 'var(--warning)' : 'var(--success)'
                    return (
                      <div style={{background:'var(--surface-2)',borderRadius:8,padding:'0.6rem 0.75rem',display:'flex',flexDirection:'column',gap:'0.4rem'}}>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.85rem'}}>
                          <span style={{color:'var(--text-muted)'}}>Fonds</span>
                          <span style={{fontWeight:600}}>{fonds.fonds_name||fonds.fonds_type}</span>
                        </div>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.85rem'}}>
                          <span style={{color:'var(--text-muted)'}}>Einddatum</span>
                          <span style={{fontWeight:700,color:urgentColor}}>{fonds.end_date} ({daysLeft > 0 ? `${Math.round(daysLeft)}d resterend` : 'VERLOPEN'})</span>
                        </div>
                        {fonds.amount_covered && (
                          <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.85rem'}}>
                            <span style={{color:'var(--text-muted)'}}>Bedrag gedekt</span>
                            <span>{fmtMoney(fonds.amount_covered)}</span>
                          </div>
                        )}
                        <button className="btn btn-outline btn-sm" style={{marginTop:'0.4rem',alignSelf:'flex-start'}}
                          onClick={async () => {
                            const newEnd = prompt('Nieuwe einddatum (YYYY-MM-DD):', fonds.end_date)
                            if (!newEnd) return
                            try {
                              await api.put(`/cash/fonds/${fonds.id}`, { end_date: newEnd, status: 'active' })
                              alert('Fonds verlengd!')
                              openMember(selected)
                            } catch(e) { alert(e.response?.data?.error||'Fout') }
                          }}>
                          Verlengen
                        </button>
                      </div>
                    )
                  })()}

                  {/* Cash betalingshistorie */}
                  {detail.cash_payments?.length > 0 && (
                    <div style={{marginTop:'0.75rem'}}>
                      <p style={{fontSize:'0.8rem',fontWeight:600,marginBottom:'0.4rem',color:'var(--text-muted)'}}>Cash betalingen</p>
                      <div style={{maxHeight:120,overflowY:'auto',display:'flex',flexDirection:'column',gap:2}}>
                        {detail.cash_payments.map(cp => (
                          <div key={cp.id} style={{display:'flex',justifyContent:'space-between',fontSize:'0.78rem',padding:'0.25rem 0',borderBottom:'1px solid var(--border)'}}>
                            <span style={{color:'var(--text-muted)'}}>{cp.payment_date}</span>
                            <span style={{color:'var(--text-2)'}}>{cp.payment_type} · {cp.note||'—'}</span>
                            <span style={{fontWeight:600,color:'var(--success)'}}>€{cp.amount}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

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
  const [form,    setForm]    = useState({name:'',instructor:'Mohammed',category:'kickboksen-recreanten',date_time:'',duration_minutes:60,max_capacity:18,location:'Zaal A',repeat_type:'none',repeat_weeks:4})

  useEffect(() => { api.get('/admin/classes').then(r => setClasses(r.data.classes)).catch(() => {}) }, [])

  const CATS = ['kickboksen-kids','kickboksen-recreanten','kickboksen-ladies-only','kickboksen-jeugd','boksen-recreanten','boksen-ladies-only','jeugd']
  const upcoming = classes.filter(c => new Date(c.date_time) > new Date() && c.status==='scheduled')
  const past     = classes.filter(c => new Date(c.date_time) <= new Date() || c.status!=='scheduled')

  const intervalLabel = form.repeat_type === 'weekly' ? 'week' : '2 weken'
  const repeatCount   = form.repeat_type !== 'none' ? Math.max(1, parseInt(form.repeat_weeks) || 4) : 1

  const createClass = async () => {
    try {
      const r = await api.post('/admin/classes', form)
      if (r.data.class) {
        setClasses(c => [r.data.class, ...c])
      } else {
        // recurring — reload full list so all occurrences appear
        const reload = await api.get('/admin/classes')
        setClasses(reload.data.classes)
        alert(r.data.message || `${r.data.count} lessen aangemaakt`)
      }
      setShowNew(false)
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
          {/* Repeat options */}
          <div style={{marginTop:'0.75rem',padding:'0.6rem 0.75rem',background:'var(--surface-3,rgba(255,255,255,0.04))',borderRadius:'var(--r)',display:'flex',alignItems:'center',gap:'1rem',flexWrap:'wrap'}}>
            <label className="input-label" style={{margin:0,whiteSpace:'nowrap'}}>Herhaling:</label>
            {[['none','Eenmalig'],['weekly','Wekelijks'],['biweekly','2-wekelijks']].map(([val,lbl]) => (
              <label key={val} style={{display:'flex',alignItems:'center',gap:'0.35rem',cursor:'pointer',fontSize:'0.85rem'}}>
                <input type="radio" name="repeat_type" value={val} checked={form.repeat_type===val} onChange={e=>setForm({...form,repeat_type:e.target.value})} style={{accentColor:'var(--primary)'}}/>
                {lbl}
              </label>
            ))}
            {form.repeat_type !== 'none' && (
              <label style={{display:'flex',alignItems:'center',gap:'0.4rem',fontSize:'0.85rem',marginLeft:'auto'}}>
                <input className="input" type="number" min={1} max={26} value={form.repeat_weeks} onChange={e=>setForm({...form,repeat_weeks:Math.min(26,Math.max(1,parseInt(e.target.value)||1))})} style={{width:'4rem',padding:'0.2rem 0.4rem'}}/>
                <span style={{color:'var(--text-muted)'}}>× elke {intervalLabel}</span>
              </label>
            )}
          </div>
          {form.repeat_type !== 'none' && (
            <p style={{fontSize:'0.78rem',color:'var(--primary)',margin:'0.4rem 0 0'}}>
              Maakt <strong>{repeatCount}</strong> lessen aan (elke {intervalLabel}, zelfde dag &amp; tijd)
            </p>
          )}
          <div style={{display:'flex',gap:'0.5rem',marginTop:'0.75rem'}}>
            <button className="btn btn-primary btn-sm" onClick={createClass}><Check size={13}/> {form.repeat_type!=='none'?`${repeatCount} lessen aanmaken`:'Aanmaken'}</button>
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
// INKOMEN DASHBOARD
// ════════════════════════════════════════════════════════════════════
function InkomenSection() {
  const now = new Date()
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`)
  const [data,  setData]  = useState(null)
  const [loading,setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/cash/income?month=${month}`)
      .then(r => { setData(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [month])

  if (loading) return <p style={{color:'var(--text-muted)'}}>Laden…</p>
  if (!data)   return <p style={{color:'var(--error)'}}>Fout bij laden</p>

  const { breakdown: bd, outstanding, expected_next_month: enm, fonds: f, cash_history } = data

  const rows = [
    { label:'💳 Mollie abonnementen', total:bd.mollie.total,          count:bd.mollie.count,          color:'#3b82f6' },
    { label:'💵 Cash lidmaatschap',   total:bd.cash_membership.total,  count:bd.cash_membership.count,  color:'#22c55e' },
    { label:'📆 Cash kwartaal',       total:bd.cash_quarter.total,     count:bd.cash_quarter.count,     color:'#a3e635' },
    { label:'💪 Cash PT sessies',     total:bd.cash_pt.total,          count:bd.cash_pt.count,          color:'#f59e0b', extra: bd.cash_pt.sessions ? `${bd.cash_pt.sessions} sessies` : null },
    { label:'🛍️ Winkel',             total:bd.shop.total,             count:bd.shop.count,             color:'#e879f9' },
  ]

  const months = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)
  }

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem'}}>
        <h2 style={{margin:0}}>Inkomen Dashboard</h2>
        <select className="input" style={{width:'auto'}} value={month} onChange={e => setMonth(e.target.value)}>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Totaal kaart */}
      <div style={{background:'var(--surface-2)',borderRadius:'var(--r)',padding:'1.25rem',marginBottom:'1.25rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:'0.8rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:1}}>Totale inkomsten {month}</div>
          <div style={{fontSize:'2rem',fontWeight:900,color:'var(--accent)',marginTop:4}}>{fmtMoney(data.total)}</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:'0.78rem',color:'var(--text-muted)'}}>Openstaand</div>
          <div style={{fontWeight:800,color:'var(--error)',fontSize:'1.1rem'}}>{fmtMoney(outstanding.total)}</div>
          <div style={{fontSize:'0.72rem',color:'var(--text-muted)'}}>{outstanding.count} onbetaald</div>
        </div>
      </div>

      {/* Uitsplitsing */}
      <div className="card" style={{marginBottom:'1.25rem'}}>
        <h3 style={{marginBottom:'1rem'}}>Uitsplitsing inkomsten</h3>
        {rows.map(r => (
          <div key={r.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.45rem 0',borderBottom:'1px solid var(--border)'}}>
            <div style={{display:'flex',alignItems:'center',gap:'0.6rem'}}>
              <div style={{width:10,height:10,borderRadius:'50%',background:r.color,flexShrink:0}}/>
              <span style={{fontSize:'0.875rem'}}>{r.label}</span>
              {r.extra && <span style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>({r.extra})</span>}
            </div>
            <div style={{textAlign:'right'}}>
              <span style={{fontWeight:700}}>{fmtMoney(r.total)}</span>
              {r.count > 0 && <span style={{marginLeft:8,fontSize:'0.75rem',color:'var(--text-muted)'}}>{r.count}×</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Verwacht volgende maand */}
      <div className="card" style={{marginBottom:'1.25rem'}}>
        <h3 style={{marginBottom:'0.75rem'}}>Verwacht volgende maand</h3>
        <div style={{display:'flex',gap:'1rem',flexWrap:'wrap'}}>
          {[
            ['💳 Mollie', enm.mollie],
            ['💵 Cash kwartaal', enm.cash, `${enm.cash_count} leden`],
            ['📊 Totaal', enm.total],
          ].map(([lbl, val, sub]) => (
            <div key={lbl} style={{flex:1,minWidth:120,background:'var(--surface-2)',borderRadius:8,padding:'0.75rem'}}>
              <div style={{fontSize:'0.78rem',color:'var(--text-muted)'}}>{lbl}</div>
              <div style={{fontWeight:800,fontSize:'1.15rem',color:'var(--success)',marginTop:2}}>{fmtMoney(val)}</div>
              {sub && <div style={{fontSize:'0.72rem',color:'var(--text-muted)'}}>{sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Fonds samenvatting */}
      <div className="card" style={{marginBottom:'1.25rem'}}>
        <h3 style={{marginBottom:'0.75rem'}}>Fonds leden</h3>
        <div style={{display:'flex',gap:'1rem'}}>
          <div style={{flex:1,background:'var(--surface-2)',borderRadius:8,padding:'0.75rem',textAlign:'center'}}>
            <div style={{fontSize:'0.78rem',color:'var(--text-muted)'}}>Actief</div>
            <div style={{fontWeight:800,fontSize:'1.5rem',color:'var(--success)'}}>{f.active}</div>
          </div>
          <div style={{flex:1,background:'var(--surface-2)',borderRadius:8,padding:'0.75rem',textAlign:'center'}}>
            <div style={{fontSize:'0.78rem',color:'var(--text-muted)'}}>Verloopt &lt;30d</div>
            <div style={{fontWeight:800,fontSize:'1.5rem',color:f.expiring>0?'var(--warning)':'var(--success)'}}>{f.expiring}</div>
          </div>
        </div>
      </div>

      {/* Cash historiek */}
      {cash_history?.length > 0 && (
        <div className="card">
          <h3 style={{marginBottom:'0.75rem'}}>Cash historiek (6 maanden)</h3>
          {cash_history.map(h => (
            <div key={h.month} style={{display:'flex',justifyContent:'space-between',padding:'0.35rem 0',borderBottom:'1px solid var(--border)',fontSize:'0.875rem'}}>
              <span style={{color:'var(--text-muted)'}}>{h.month}</span>
              <span style={{fontWeight:600}}>{fmtMoney(h.cash_total)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// CASH & FONDS SECTIE
// ════════════════════════════════════════════════════════════════════
function CashFondsSection() {
  const [tab, setTab] = useState('kwartaal')

  return (
    <div>
      <div className="tab-bar" style={{marginBottom:'1.5rem'}}>
        {[['kwartaal','💵 Kwartaal'],['fonds','🏛️ Fonds leden'],['cashpt','💪 Cash PT']].map(([k,l]) => (
          <button key={k} className={`tab-btn${tab===k?' active':''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'kwartaal' && <KwartaalTab/>}
      {tab === 'fonds'    && <FondsTab/>}
      {tab === 'cashpt'   && <CashPtTab/>}
    </div>
  )
}

function KwartaalTab() {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({
    user_id: '', amount: '', note: '',
    payment_date:    new Date().toISOString().split('T')[0],
    next_quarter_due: (() => { const d = new Date(); d.setMonth(d.getMonth()+3); return d.toISOString().split('T')[0] })(),
  })
  const [allMembers, setAllMembers] = useState([])
  const [editMem, setEditMem] = useState(null)
  const [editMemForm, setEditMemForm] = useState({ quarterly_amount: '', next_quarter_due: '' })

  const load = () => {
    setLoading(true)
    api.get('/cash/members').then(r => { setMembers(r.data.members||[]); setLoading(false) }).catch(() => setLoading(false))
  }
  useEffect(() => { load(); api.get('/admin/members').then(r => setAllMembers(r.data.members||[])).catch(() => {}) }, [])

  const markPaid = async mem => {
    const amount = prompt(`Bedrag ontvangen (€):`, mem.quarterly_amount||'150')
    if (!amount) return
    try {
      const r = await api.put(`/cash/memberships/${mem.membership_id}/quarterly-paid`, { amount: parseFloat(amount), note: 'Cash ontvangen' })
      alert(`✅ Volgende kwartaal: ${r.data.next_due}`)
      load()
    } catch(e) { alert(e.response?.data?.error||'Fout') }
  }

  const submitAdd = async () => {
    if (!addForm.user_id || !addForm.amount || !addForm.payment_date || !addForm.next_quarter_due)
      return alert('Vul alle verplichte velden in (*)')
    try {
      await api.post('/cash/members/payment', {
        user_id: addForm.user_id,
        amount: parseFloat(addForm.amount),
        payment_date: addForm.payment_date,
        next_quarter_due: addForm.next_quarter_due,
        note: addForm.note || undefined,
      })
      setShowAdd(false)
      setAddForm({
        user_id: '', amount: '', note: '',
        payment_date: new Date().toISOString().split('T')[0],
        next_quarter_due: (() => { const d = new Date(); d.setMonth(d.getMonth()+3); return d.toISOString().split('T')[0] })(),
      })
      load()
    } catch(e) { alert(e.response?.data?.error||'Fout') }
  }

  const processReminders = async () => {
    const r = await api.post('/cash/quarterly/process-reminders')
    alert(`Kwartaalherinneringen: ${r.data.results.admin_14d} admin, ${r.data.results.member_7d} leden`)
  }

  const processOverdue = async () => {
    const r = await api.post('/cash/quarterly/process-overdue')
    const n = r.data.results.newly_overdue
    alert(n > 0 ? `⚠️ ${n} lid${n !== 1 ? 'en' : ''} met achterstand gemeld (push + e-mail verstuurd).` : '✅ Geen nieuwe achterstanden gevonden.')
  }

  const startEditMem = (m) => {
    setEditMem(m.user_id)
    setEditMemForm({ quarterly_amount: m.quarterly_amount||'', next_quarter_due: m.next_quarter_due||'' })
  }

  const saveEditMem = async () => {
    try {
      await api.put(`/cash/members/${editMem}`, { quarterly_amount: parseFloat(editMemForm.quarterly_amount)||undefined, next_quarter_due: editMemForm.next_quarter_due||undefined })
      setEditMem(null); load()
    } catch(e) { alert(e.response?.data?.error||'Fout') }
  }

  const deleteMem = async (userId, name) => {
    if (!confirm(`${name} uitschrijven als cash betaler?`)) return
    try {
      await api.delete(`/cash/members/${userId}`)
      load()
    } catch(e) { alert(e.response?.data?.error||'Fout') }
  }

  const overdueCount = members.filter(m => Number(m.days_until_due||0) < 0).length

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem',flexWrap:'wrap',gap:'0.5rem'}}>
        <h2 style={{margin:0}}>
          Cash kwartaalbetalers
          {overdueCount > 0 && <span className="badge-error" style={{marginLeft:8,fontSize:'0.72rem'}}>{overdueCount} achterstallig</span>}
        </h2>
        <div style={{display:'flex',gap:'0.5rem',flexWrap:'wrap'}}>
          {overdueCount > 0 && (
            <button className="btn btn-sm" style={{background:'rgba(239,68,68,0.15)',color:'var(--error)'}} onClick={processOverdue}>
              <AlertTriangle size={13}/> Meld achterstanden
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={processReminders}><RefreshCw size={13}/> Verwerk herinneringen</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(s=>!s)}>
            {showAdd ? <><X size={13}/> Annuleren</> : <><Plus size={13}/> Betaling toevoegen</>}
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="card" style={{marginBottom:'1rem'}}>
          <h3 style={{marginBottom:'0.75rem'}}>Cash betaling registreren</h3>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.6rem'}}>
            <div style={{gridColumn:'span 2'}}>
              <label className="input-label">Lid *</label>
              <select className="input" value={addForm.user_id} onChange={e => setAddForm({...addForm,user_id:e.target.value})}>
                <option value="">— Selecteer lid —</option>
                {allMembers.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name} ({m.email})</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Bedrag (€) *</label>
              <input className="input" type="number" min="0" step="0.01" placeholder="150" value={addForm.amount} onChange={e => setAddForm({...addForm,amount:e.target.value})}/>
            </div>
            <div>
              <label className="input-label">Betaaldatum *</label>
              <input className="input" type="date" value={addForm.payment_date} onChange={e => setAddForm({...addForm,payment_date:e.target.value})}/>
            </div>
            <div>
              <label className="input-label">Volgende betaaldatum *</label>
              <input className="input" type="date" value={addForm.next_quarter_due} onChange={e => setAddForm({...addForm,next_quarter_due:e.target.value})}/>
            </div>
            <div>
              <label className="input-label">Notitie</label>
              <input className="input" placeholder="Optioneel" value={addForm.note} onChange={e => setAddForm({...addForm,note:e.target.value})}/>
            </div>
          </div>
          <div style={{display:'flex',gap:'0.5rem',marginTop:'0.75rem'}}>
            <button className="btn btn-primary btn-sm" onClick={submitAdd}><Check size={13}/> Opslaan</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}><X size={13}/> Annuleren</button>
          </div>
        </div>
      )}

      {loading && <p style={{color:'var(--text-muted)',fontSize:'0.875rem'}}>Laden…</p>}

      {!loading && members.length === 0 && (
        <div style={{textAlign:'center',padding:'3rem',color:'var(--text-muted)'}}>
          <p>Geen cash kwartaalbetalers</p>
          <p style={{fontSize:'0.8rem'}}>Klik op "Betaling toevoegen" om een eerste betaling te registreren.</p>
        </div>
      )}

      {!loading && members.map(m => {
        const days = Math.round(Number(m.days_until_due)||99)
        const urgent = days <= 7
        const warning = days <= 14
        const overdue = days < 0
        const isEditing = editMem === m.user_id
        return (
          <div key={m.membership_id} className="card" style={{marginBottom:'0.75rem',borderColor:urgent?'var(--error)':warning?'var(--warning)':'var(--border)'}}>
            {isEditing ? (
              <>
                <h4 style={{marginBottom:'0.6rem',color:'var(--text-2)'}}>Bewerken — {m.first_name} {m.last_name}</h4>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.5rem'}}>
                  <div>
                    <label className="input-label">Bedrag/kwartaal (€)</label>
                    <input className="input" type="number" min="0" step="0.01" value={editMemForm.quarterly_amount} onChange={e => setEditMemForm({...editMemForm,quarterly_amount:e.target.value})}/>
                  </div>
                  <div>
                    <label className="input-label">Volgende betaaldatum</label>
                    <input className="input" type="date" value={editMemForm.next_quarter_due} onChange={e => setEditMemForm({...editMemForm,next_quarter_due:e.target.value})}/>
                  </div>
                </div>
                <div style={{display:'flex',gap:'0.5rem',marginTop:'0.6rem'}}>
                  <button className="btn btn-primary btn-sm" onClick={saveEditMem}><Check size={13}/> Opslaan</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditMem(null)}><X size={13}/> Annuleren</button>
                </div>
              </>
            ) : (
              <>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                  <div>
                    <div style={{fontWeight:700,display:'flex',alignItems:'center',gap:6}}>
                      {m.first_name} {m.last_name}
                      {overdue && <span className="badge-error" style={{fontSize:'0.7rem'}}>ACHTERSTALLIG</span>}
                      {!overdue && urgent && <span className="badge-error" style={{fontSize:'0.7rem'}}>DEZE WEEK</span>}
                      {!overdue && !urgent && warning && <span className="badge-warning" style={{fontSize:'0.7rem'}}>BINNENKORT</span>}
                    </div>
                    <div style={{fontSize:'0.82rem',color:'var(--text-muted)'}}>{m.email}</div>
                    <div style={{fontSize:'0.82rem',marginTop:4}}>
                      {m.membership_name||m.membership_type_key} · €{m.quarterly_amount}/kwartaal
                    </div>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    <div style={{fontWeight:800,fontSize:'1.1rem',color:overdue?'var(--error)':urgent?'var(--warning)':'var(--text-2)'}}>
                      {m.next_quarter_due ? fmtDate(m.next_quarter_due) : '—'}
                    </div>
                    <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>
                      {overdue ? `${Math.abs(days)}d te laat` : `over ${days}d`}
                    </div>
                    {m.last_quarter_paid && <div style={{fontSize:'0.72rem',color:'var(--text-muted)'}}>Laatste: {fmtDate(m.last_quarter_paid)}</div>}
                  </div>
                </div>
                <div style={{display:'flex',gap:'0.5rem',marginTop:'0.6rem',flexWrap:'wrap'}}>
                  <button className="btn btn-sm" style={{background:'var(--success-dim)',color:'var(--success)'}} onClick={() => markPaid(m)}>
                    <Check size={13}/> Betaling ontvangen
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={() => startEditMem(m)}><Edit2 size={13}/> Bewerken</button>
                  <button className="btn btn-ghost btn-sm" style={{color:'var(--error)'}} onClick={() => deleteMem(m.user_id, `${m.first_name} ${m.last_name}`)}><Trash2 size={13}/> Verwijderen</button>
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

function FondsTab() {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [filterType, setFilterType] = useState('')
  const [form, setForm] = useState({ user_id:'', fonds_type:'jeugdsportfonds', fonds_name:'', start_date: new Date().toISOString().split('T')[0], end_date:'', notes:'' })
  const [allMembers, setAllMembers] = useState([])
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({})

  const load = () => {
    setLoading(true)
    const params = filterType ? `?type=${encodeURIComponent(filterType)}` : ''
    api.get(`/cash/fonds${params}`).then(r => { setMembers(r.data.members||[]); setLoading(false) }).catch(() => setLoading(false))
  }
  useEffect(() => {
    load()
    api.get('/admin/members').then(r => setAllMembers(r.data.members||[])).catch(() => {})
  }, [filterType])

  const processReminders = async () => {
    const r = await api.post('/cash/fonds/process-reminders')
    alert(`Fonds herinneringen: 30d=${r.data.results.month1}, 14d=${r.data.results.weeks2}, 7d=${r.data.results.week1}, gepauzeerd=${r.data.results.auto_paused}`)
  }

  const createFonds = async () => {
    if (!form.user_id || !form.end_date) return alert('Selecteer een lid en einddatum')
    try {
      await api.post('/cash/fonds', { ...form })
      setShowNew(false); setForm({ user_id:'', fonds_type:'jeugdsportfonds', fonds_name:'', start_date: new Date().toISOString().split('T')[0], end_date:'', notes:'' }); load()
    } catch(e) { alert(e.response?.data?.error||'Fout') }
  }

  const startEdit = (m) => {
    setEditId(m.id)
    setEditForm({ fonds_type: m.fonds_type||'jeugdsportfonds', fonds_name: m.fonds_name||'', start_date: m.start_date||'', end_date: m.end_date||'', notes: m.notes||'', status: m.status||'active' })
  }

  const saveFonds = async () => {
    try {
      await api.put(`/cash/fonds/${editId}`, editForm)
      setEditId(null); load()
    } catch(e) { alert(e.response?.data?.error||'Fout') }
  }

  const deleteFonds = async (id) => {
    if (!confirm('Fonds lidmaatschap verwijderen?')) return
    try {
      await api.delete(`/cash/fonds/${id}`)
      load()
    } catch(e) { alert(e.response?.data?.error||'Fout') }
  }

  const statusForDays = (days) => {
    if (days <= 0)  return { label: 'VERLOPEN', color: 'var(--error)' }
    if (days <= 7)  return { label: `${Math.round(days)}d — URGENT`, color: 'var(--error)' }
    if (days <= 30) return { label: `${Math.round(days)} dagen`, color: 'var(--warning)' }
    return { label: `${Math.round(days)} dagen`, color: 'var(--success)' }
  }

  if (loading) return <p style={{color:'var(--text-muted)'}}>Laden…</p>

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'0.75rem',flexWrap:'wrap',gap:'0.5rem'}}>
        <h2 style={{margin:0}}>Fonds leden</h2>
        <div style={{display:'flex',gap:'0.5rem',flexWrap:'wrap'}}>
          <select className="input" style={{height:32,padding:'0 8px',fontSize:'0.82rem',width:'auto'}}
            value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">Alle fondsen</option>
            <option value="jeugdsportfonds">Jeugdsportfonds</option>
            <option value="volwassenenfonds">Volwassenenfonds</option>
            <option value="overig">Overig</option>
          </select>
          <button className="btn btn-ghost btn-sm" onClick={processReminders}><RefreshCw size={13}/> Verwerk herinneringen</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowNew(s=>!s)}>{showNew?<X size={13}/>:<Plus size={13}/>} Nieuw fonds</button>
        </div>
      </div>

      {showNew && (
        <div className="card" style={{marginBottom:'1rem'}}>
          <h3 style={{marginBottom:'0.75rem'}}>Fonds lid toevoegen</h3>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.6rem'}}>
            <div style={{gridColumn:'span 2'}}>
              <label className="input-label">Lid *</label>
              <select className="input" value={form.user_id} onChange={e => setForm({...form,user_id:e.target.value})}>
                <option value="">— Selecteer lid —</option>
                {allMembers.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name} ({m.email})</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Fonds type *</label>
              <select className="input" value={form.fonds_type} onChange={e => setForm({...form,fonds_type:e.target.value})}>
                <option value="jeugdsportfonds">Jeugdsportfonds</option>
                <option value="volwassenenfonds">Volwassenenfonds</option>
                <option value="overig">Overig</option>
              </select>
            </div>
            <div>
              <label className="input-label">Fonds naam</label>
              <input className="input" placeholder="Optioneel (bijv. Stadjerspas)" value={form.fonds_name} onChange={e => setForm({...form,fonds_name:e.target.value})}/>
            </div>
            <div>
              <label className="input-label">Startdatum *</label>
              <input className="input" type="date" value={form.start_date} onChange={e => setForm({...form,start_date:e.target.value})}/>
            </div>
            <div>
              <label className="input-label">Verloopdatum *</label>
              <input className="input" type="date" value={form.end_date} onChange={e => setForm({...form,end_date:e.target.value})}/>
            </div>
            <div style={{gridColumn:'span 2'}}>
              <label className="input-label">Notities</label>
              <input className="input" value={form.notes} onChange={e => setForm({...form,notes:e.target.value})} placeholder="Optioneel"/>
            </div>
          </div>
          <div style={{display:'flex',gap:'0.5rem',marginTop:'0.75rem'}}>
            <button className="btn btn-primary btn-sm" onClick={createFonds}><Check size={13}/> Aanmaken</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowNew(false)}><X size={13}/> Annuleren</button>
          </div>
        </div>
      )}

      {members.length === 0 && !showNew && (
        <div style={{textAlign:'center',padding:'3rem',color:'var(--text-muted)'}}>
          <p>Geen fonds leden</p>
        </div>
      )}

      {members.map(m => {
        const days = Number(m.days_remaining || 0)
        const { label, color } = statusForDays(days)
        const isEditing = editId === m.id
        return (
          <div key={m.id} className="card" style={{marginBottom:'0.6rem',borderColor:days<=0?'var(--error)':days<=30?'var(--warning)':'var(--border)'}}>
            {isEditing ? (
              <>
                <h4 style={{marginBottom:'0.6rem',color:'var(--text-2)'}}>Fonds bewerken — {m.first_name} {m.last_name}</h4>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.5rem'}}>
                  <div>
                    <label className="input-label">Fonds type</label>
                    <select className="input" value={editForm.fonds_type} onChange={e => setEditForm({...editForm,fonds_type:e.target.value})}>
                      <option value="jeugdsportfonds">Jeugdsportfonds</option>
                      <option value="volwassenenfonds">Volwassenenfonds</option>
                      <option value="overig">Overig</option>
                    </select>
                  </div>
                  <div>
                    <label className="input-label">Fonds naam</label>
                    <input className="input" value={editForm.fonds_name} onChange={e => setEditForm({...editForm,fonds_name:e.target.value})} placeholder="Bijv. Stadjerspas"/>
                  </div>
                  <div>
                    <label className="input-label">Startdatum</label>
                    <input className="input" type="date" value={editForm.start_date} onChange={e => setEditForm({...editForm,start_date:e.target.value})}/>
                  </div>
                  <div>
                    <label className="input-label">Verloopdatum</label>
                    <input className="input" type="date" value={editForm.end_date} onChange={e => setEditForm({...editForm,end_date:e.target.value})}/>
                  </div>
                  <div>
                    <label className="input-label">Status</label>
                    <select className="input" value={editForm.status} onChange={e => setEditForm({...editForm,status:e.target.value})}>
                      <option value="active">Actief</option>
                      <option value="expired">Verlopen</option>
                      <option value="cancelled">Geannuleerd</option>
                    </select>
                  </div>
                  <div>
                    <label className="input-label">Notities</label>
                    <input className="input" value={editForm.notes} onChange={e => setEditForm({...editForm,notes:e.target.value})} placeholder="Optioneel"/>
                  </div>
                </div>
                <div style={{display:'flex',gap:'0.5rem',marginTop:'0.6rem'}}>
                  <button className="btn btn-primary btn-sm" onClick={saveFonds}><Check size={13}/> Opslaan</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}><X size={13}/> Annuleren</button>
                </div>
              </>
            ) : (
              <>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                  <div>
                    <div style={{fontWeight:700,display:'flex',alignItems:'center',gap:6}}>
                      {m.first_name} {m.last_name}
                      {days <= 0 && <span className="badge-error" style={{fontSize:'0.7rem'}}>VERLOPEN</span>}
                      {days > 0 && days <= 30 && <span className="badge-warning" style={{fontSize:'0.7rem'}}>VERLOOPT BINNENKORT</span>}
                    </div>
                    <div style={{fontSize:'0.8rem',color:'var(--text-muted)'}}>{m.email}</div>
                    <div style={{fontSize:'0.82rem',marginTop:3}}>
                      🏛️ {m.fonds_name||m.fonds_type}
                      {m.amount_covered ? <span style={{marginLeft:8,color:'var(--text-muted)'}}>€{m.amount_covered}</span> : null}
                    </div>
                    <div style={{fontSize:'0.78rem',marginTop:2,color:'var(--text-muted)'}}>
                      {fmtDate(m.start_date)} → {fmtDate(m.end_date)}
                    </div>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    <div style={{fontWeight:800,color,fontSize:'0.9rem'}}>{label}</div>
                    <div style={{fontSize:'0.75rem',color:'var(--text-muted)',marginTop:2}}>{m.status}</div>
                  </div>
                </div>
                <div style={{display:'flex',gap:'0.5rem',marginTop:'0.6rem',flexWrap:'wrap'}}>
                  <button className="btn btn-outline btn-sm" onClick={() => startEdit(m)}><Edit2 size={13}/> Bewerken</button>
                  <button className="btn btn-ghost btn-sm" style={{color:'var(--error)'}} onClick={() => deleteFonds(m.id)}><Trash2 size={13}/> Verwijderen</button>
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

function CashPtTab() {
  const [members,    setMembers]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [allMembers, setAllMembers] = useState([])
  const [showAdd,    setShowAdd]    = useState(null)   // user_id (per-member log form)
  const [showNew,    setShowNew]    = useState(false)  // top-level new PT member form
  const [addForm,    setAddForm]    = useState({ amount:'', sessions_paid:'', payment_date: new Date().toISOString().split('T')[0], note:'' })
  const [newForm,    setNewForm]    = useState({ user_id:'', amount:'', sessions_paid:'', payment_date: new Date().toISOString().split('T')[0], note:'' })

  const load = () => {
    setLoading(true)
    api.get('/cash/pt-overview').then(r => { setMembers(r.data.members||[]); setLoading(false) }).catch(() => setLoading(false))
  }
  useEffect(() => {
    load()
    api.get('/admin/members').then(r => setAllMembers(r.data.members||[])).catch(() => {})
  }, [])

  const logPayment = async (userId) => {
    if (!addForm.amount || !addForm.sessions_paid) return alert('Vul bedrag en aantal sessies in.')
    try {
      await api.post('/cash/payments', {
        user_id: userId,
        amount: parseFloat(addForm.amount),
        payment_date: addForm.payment_date,
        payment_type: 'pt',
        sessions_paid: parseInt(addForm.sessions_paid)||null,
        note: addForm.note,
      })
      setShowAdd(null); setAddForm({ amount:'', sessions_paid:'', payment_date: new Date().toISOString().split('T')[0], note:'' }); load()
    } catch(e) { alert(e.response?.data?.error||'Fout') }
  }

  const submitNew = async () => {
    if (!newForm.user_id || !newForm.amount || !newForm.sessions_paid) return alert('Selecteer een lid en vul bedrag en sessies in.')
    try {
      await api.post('/cash/payments', {
        user_id: newForm.user_id,
        amount: parseFloat(newForm.amount),
        payment_date: newForm.payment_date,
        payment_type: 'pt',
        sessions_paid: parseInt(newForm.sessions_paid)||null,
        note: newForm.note,
      })
      setShowNew(false)
      setNewForm({ user_id:'', amount:'', sessions_paid:'', payment_date: new Date().toISOString().split('T')[0], note:'' })
      load()
    } catch(e) { alert(e.response?.data?.error||'Fout') }
  }

  if (loading) return <p style={{color:'var(--text-muted)'}}>Laden…</p>

  const totalCashPt = members.reduce((s, m) => s + Number(m.total_cash_income||0), 0)

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem',flexWrap:'wrap',gap:'0.5rem'}}>
        <h2 style={{margin:0}}>
          Cash PT Overzicht
          <span style={{marginLeft:10,fontWeight:400,fontSize:'0.9rem',color:'var(--success)'}}>Totaal: {fmtMoney(totalCashPt)}</span>
        </h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNew(s=>!s)}>
          {showNew ? <><X size={13}/> Annuleren</> : <><Plus size={13}/> Nieuw PT lid</>}
        </button>
      </div>

      {showNew && (
        <div className="card" style={{marginBottom:'1rem'}}>
          <h3 style={{marginBottom:'0.75rem'}}>Cash PT betaling registreren</h3>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.6rem'}}>
            <div style={{gridColumn:'span 2'}}>
              <label className="input-label">Lid *</label>
              <select className="input" value={newForm.user_id} onChange={e => setNewForm({...newForm,user_id:e.target.value})}>
                <option value="">— Selecteer lid —</option>
                {allMembers.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name} ({m.email})</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Bedrag (€) *</label>
              <input className="input" type="number" min="0" step="0.01" placeholder="70" value={newForm.amount} onChange={e => setNewForm({...newForm,amount:e.target.value})}/>
            </div>
            <div>
              <label className="input-label">Sessies betaald *</label>
              <input className="input" type="number" min="1" placeholder="10" value={newForm.sessions_paid} onChange={e => setNewForm({...newForm,sessions_paid:e.target.value})}/>
            </div>
            <div>
              <label className="input-label">Betaaldatum *</label>
              <input className="input" type="date" value={newForm.payment_date} onChange={e => setNewForm({...newForm,payment_date:e.target.value})}/>
            </div>
            <div>
              <label className="input-label">Notitie</label>
              <input className="input" placeholder="Optioneel" value={newForm.note} onChange={e => setNewForm({...newForm,note:e.target.value})}/>
            </div>
          </div>
          <div style={{display:'flex',gap:'0.5rem',marginTop:'0.75rem'}}>
            <button className="btn btn-primary btn-sm" onClick={submitNew}><Check size={13}/> Opslaan</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowNew(false)}><X size={13}/> Annuleren</button>
          </div>
        </div>
      )}

      {members.length === 0 && !showNew && (
        <p style={{color:'var(--text-muted)',textAlign:'center'}}>Geen cash PT betalingen. Klik op "Nieuw PT lid" om te beginnen.</p>
      )}

      {members.map(m => {
        const low = Number(m.sessions_remaining) <= 2
        return (
          <div key={m.id} className="card" style={{marginBottom:'0.6rem',borderColor:low?'var(--warning)':'var(--border)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'0.5rem'}}>
              <div>
                <div style={{fontWeight:700}}>{m.first_name} {m.last_name}</div>
                <div style={{fontSize:'0.8rem',color:'var(--text-muted)'}}>{m.email}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontWeight:800,fontSize:'1.1rem',color:low?'var(--warning)':'var(--success)'}}>
                  {m.sessions_remaining} sessies over
                </div>
                <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>
                  {m.sessions_used}/{m.total_sessions_paid} gebruikt
                </div>
                <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>
                  Cash: {fmtMoney(m.total_cash_income)}
                </div>
              </div>
            </div>
            {low && <div style={{background:'rgba(245,158,11,0.1)',borderRadius:6,padding:'0.4rem 0.6rem',fontSize:'0.8rem',color:'var(--warning)',marginBottom:'0.5rem'}}>⚠️ Nog maar {m.sessions_remaining} sessie(s) resterend!</div>}

            {showAdd === m.id ? (
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.5rem',padding:'0.6rem',background:'var(--surface-2)',borderRadius:8}}>
                <div><label className="input-label">Datum</label><input className="input" type="date" value={addForm.payment_date} onChange={e => setAddForm({...addForm,payment_date:e.target.value})}/></div>
                <div><label className="input-label">Bedrag (€)</label><input className="input" type="number" value={addForm.amount} onChange={e => setAddForm({...addForm,amount:e.target.value})} placeholder="70"/></div>
                <div><label className="input-label">Sessies betaald</label><input className="input" type="number" value={addForm.sessions_paid} onChange={e => setAddForm({...addForm,sessions_paid:e.target.value})} placeholder="1"/></div>
                <div><label className="input-label">Notitie</label><input className="input" value={addForm.note} onChange={e => setAddForm({...addForm,note:e.target.value})}/></div>
                <div style={{gridColumn:'span 2',display:'flex',gap:'0.4rem'}}>
                  <button className="btn btn-primary btn-sm" onClick={() => logPayment(m.id)}><Check size={13}/> Opslaan</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(null)}><X size={13}/> Annuleren</button>
                </div>
              </div>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowAdd(m.id); setAddForm({ amount:'', sessions_paid:'', payment_date: new Date().toISOString().split('T')[0], note:'' }) }}>
                <Plus size={13}/> Cash PT betaling loggen
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// GECOMBINEERDE BETALINGEN SECTIE
// ════════════════════════════════════════════════════════════════════
function BetalingenCombinedSection() {
  const [tab, setTab] = useState('fouten')
  const tabs = [
    { key:'fouten',   label:'⚠️ Betalingsfouten' },
    { key:'overzicht', label:'💳 Overzicht'       },
  ]
  return (
    <div>
      <div style={{display:'flex',gap:'0.5rem',marginBottom:'1.25rem',borderBottom:'1px solid var(--border)',paddingBottom:'0.5rem'}}>
        {tabs.map(t => (
          <button key={t.key}
            className={`btn btn-sm${tab===t.key?' btn-primary':' btn-ghost'}`}
            onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab==='fouten'    && <BetalingenSection/>}
      {tab==='overzicht' && <BetalingOverview/>}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// HOOFD COMPONENT
// ════════════════════════════════════════════════════════════════════
const MENU = [
  { key:'dashboard',  label:'Dashboard',    Icon:LayoutDashboard },
  { key:'leden',      label:'Leden',         Icon:Users           },
  { key:'cashfonds',  label:'Cash & Fonds',  Icon:Banknote        },
  { key:'inkomen',    label:'Inkomen',       Icon:TrendingUp      },
  { key:'pt',         label:'PT Agenda',     Icon:Zap             },
  { key:'vt',         label:'Vrij Trainen',  Icon:Calendar        },
  { key:'betalingen', label:'Betalingen',    Icon:CreditCard      },
  { key:'community',  label:'Community',     Icon:Users2          },
  { key:'rooster',    label:'Rooster',       Icon:Calendar        },
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
        {section==='cashfonds'  && <CashFondsSection/>}
        {section==='inkomen'    && <InkomenSection/>}
        {section==='betalingen' && <BetalingenCombinedSection/>}
        {section==='community'  && <CommunityBeheer/>}
        {section==='rooster'    && <RoosterSection/>}
      </main>
    </div>
  )
}
