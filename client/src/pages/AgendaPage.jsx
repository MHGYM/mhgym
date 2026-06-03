import { useState, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, X, Clock, User, Users, Check, Plus, Repeat, Trash2, RefreshCw } from 'lucide-react'
import api from '../api'
import { useAuth } from '../context/AuthContext'

// ── Constanten ────────────────────────────────────────────────────────────────
const DAY_NAMES = ['ma','di','wo','do','vr','za','zo']
const HOUR_PX   = 56
const TOTAL_PX  = HOUR_PX * 24

// Class categories used in MHGym
const CLASS_CATS = [
  'kickboksen-recreanten','kickboksen-kids','kickboksen-ladies-only','kickboksen-jeugd',
  'boksen-recreanten','boksen-ladies-only','jeugd',
]
const TRAINERS = ['Mohammed','Ecrin','Joep']

// Genereer lijst van datums op basis van herhaling
function getDatesForRepeat(startDate, repeatType, repeatUntil) {
  if (!repeatType || repeatType === 'none' || !repeatUntil) return [startDate]
  const dates = []
  let cur = new Date(startDate + 'T12:00:00')
  const end = new Date(repeatUntil + 'T12:00:00')
  while (cur <= end && dates.length < 156) { // max 3 jaar dagelijks
    dates.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`)
    if (repeatType === 'daily')        cur.setDate(cur.getDate() + 1)
    else if (repeatType === 'weekly')  cur.setDate(cur.getDate() + 7)
    else if (repeatType === 'monthly') cur.setMonth(cur.getMonth() + 1)
    else break
  }
  return dates
}

function getMonday(d) {
  const date = new Date(d)
  const day  = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)
  date.setHours(0,0,0,0)
  return date
}
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function toDateStr(d)  { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
function timeToPx(hhmm){ const [h,m] = hhmm.split(':').map(Number); return (h*60+m)/60*HOUR_PX }
function dtToPx(iso)   { const d = new Date(iso); return (d.getHours()*60+d.getMinutes())/60*HOUR_PX }
function dtToDate(iso) { return iso ? iso.substring(0,10) : '' }
function durationPx(m) { return (m/60)*HOUR_PX }

// ── Color scheme ──────────────────────────────────────────────────────────────
const COLORS = {
  class:        { bg: 'rgba(245,194,0,0.9)',   border: '#f5c200' },  // gold
  pt_confirmed: { bg: 'rgba(59,130,246,0.85)', border: '#3b82f6' },  // blue
  pt_pending:   { bg: 'rgba(59,130,246,0.55)', border: '#3b82f6' },  // light blue
  pt_available: { bg: 'rgba(59,130,246,0.2)',  border: '#3b82f6' },  // very light blue
  vt_avail:     { bg: 'rgba(34,197,94,0.35)',  border: '#22c55e' },  // green
  vt_requested: { bg: 'rgba(245,158,11,0.8)',  border: '#f59e0b' },  // amber
  vt_confirmed: { bg: 'rgba(34,197,94,0.85)',  border: '#22c55e' },  // solid green
  vt_full:      { bg: 'rgba(100,100,100,0.45)', border: '#666' },    // grey
}

function vtSlotColor(slot) {
  if (!slot) return COLORS.vt_full
  if (slot.my_status === 'confirmed' || slot.status_override === 'confirmed') return COLORS.vt_confirmed
  if (slot.my_status === 'requested' || slot.status_override === 'requested') return COLORS.vt_requested
  if (Number(slot.booking_count) >= Number(slot.max_bookings)) return COLORS.vt_full
  return COLORS.vt_avail
}

function vtAdminLabel(slot) {
  const pending   = Number(slot.pending_count  || 0)
  const confirmed = Number(slot.confirmed_count || 0)
  const isFull    = Number(slot.booking_count)  >= Number(slot.max_bookings)
  if (isFull)     return { label: 'Vol',                    color: '#ef4444' }
  if (pending > 0) return { label: `${pending} aanvraag${pending>1?'en':''}`, color: '#f59e0b' }
  if (confirmed > 0) return { label: 'Bevestigd',            color: '#22c55e' }
  return { label: 'Beschikbaar', color: '#22c55e' }
}

// Compute VT slot count preview for admin form
function vtSlotCount(start, end) {
  const toMins = t => { const [h,m] = t.split(':').map(Number); return h*60+m }
  const diff = toMins(end) - toMins(start)
  if (diff <= 0) return 0
  return Math.ceil(diff / 60)
}

const VT_HOUR_OPTIONS = []
for (let h = 6; h <= 23; h++) VT_HOUR_OPTIONS.push(`${String(h).padStart(2,'0')}:00`)

// ── AddEventSheet ────────────────────────────────────────────────────────────
// Bottom sheet that slides up when admin taps an empty time slot.
// Step 1: tap type card (Les / PT / VT)  →  Step 2: fill minimal details  →  Opslaan
function AddEventSheet({ date, dateTime, members, onClose, onCreated }) {
  const [type,   setType]   = useState(null)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const [cls, setCls] = useState({
    name: '', category: CLASS_CATS[0], instructor: TRAINERS[0],
    date_time: dateTime, duration_minutes: 60, max_capacity: 18, location: 'Zaal A',
  })
  const [pt, setPt] = useState({
    date_time: dateTime, duration_minutes: 60, trainer: TRAINERS[0],
    member_id: '', notes: '',
  })
  const [vt, setVt] = useState(() => {
    const [, time = '09:00'] = dateTime.split('T')
    const [hh] = time.split(':').map(Number)
    const startH = String(Math.min(hh, 22)).padStart(2, '0')
    const endH   = String(Math.min(hh + 1, 23)).padStart(2, '0')
    return { date, start_time: `${startH}:00`, end_time: `${endH}:00`, max_bookings: 10, notes: '' }
  })

  const save = async () => {
    setSaving(true); setError('')
    try {
      if (type === 'class') {
        if (!cls.name) throw new Error('Vul een naam in.')
        await api.post('/admin/classes', cls)
      } else if (type === 'pt') {
        const r = await api.post('/pt/slots', {
          date_time: pt.date_time, duration_minutes: pt.duration_minutes,
          trainer: pt.trainer, notes: pt.notes || undefined,
        })
        if (pt.member_id && r.data?.slot?.id) {
          await api.post('/admin/bookings/pt', { slot_id: r.data.slot.id, user_id: parseInt(pt.member_id) }).catch(() => {})
        }
      } else if (type === 'vt') {
        await api.post('/vt/admin/slots', vt)
      }
      onCreated()
    } catch (e) {
      setError(e.message || e.response?.data?.error || 'Fout bij opslaan.')
      setSaving(false)
    }
  }

  const fmtDT = iso => {
    const d = new Date(iso)
    return d.toLocaleDateString('nl-NL', { weekday:'long', day:'numeric', month:'long' }) +
           ' · ' + d.toLocaleTimeString('nl-NL', { hour:'2-digit', minute:'2-digit' })
  }

  const TYPE_OPTS = [
    { key:'class', label:'Groepsles',        icon:'📚', color:'#f5c200', desc:'Kickboksen, boksen, jeugd…' },
    { key:'pt',    label:'Personal Training', icon:'🥊', color:'#3b82f6', desc:'1-op-1 sessie met lid' },
    { key:'vt',    label:'Vrij Trainen',      icon:'🏋️', color:'#22c55e', desc:'Open trainingstijd' },
  ]

  const btnColor = type === 'class' ? '#f5c200' : type === 'pt' ? '#3b82f6' : '#22c55e'
  const btnText  = type === 'class' ? '#000' : '#fff'

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:1100,
      background:'rgba(0,0,0,0.55)',
      display:'flex', flexDirection:'column', justifyContent:'flex-end',
    }} onClick={onClose}>
      <div style={{
        background:'var(--surface)',
        borderRadius:'20px 20px 0 0',
        padding:'0 1rem env(safe-area-inset-bottom, 1.5rem)',
        maxHeight:'92vh',
        overflowY:'auto',
      }} onClick={e => e.stopPropagation()}>

        {/* Handle */}
        <div style={{ width:40, height:4, background:'var(--border)', borderRadius:2, margin:'0.8rem auto 0.5rem' }}/>

        {/* Header row */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.75rem' }}>
          <div>
            {type && (
              <button style={{ background:'none', border:'none', cursor:'pointer', padding:'4px 0', color:'var(--text-muted)', fontSize:'0.82rem', display:'flex', alignItems:'center', gap:4 }}
                onClick={() => { setType(null); setError('') }}>
                <ChevronLeft size={14}/> Terug
              </button>
            )}
            {!type && <span style={{ fontSize:'0.95rem', fontWeight:700 }}>Inplannen</span>}
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18}/></button>
        </div>

        {/* Time badge */}
        <div style={{
          display:'inline-flex', alignItems:'center', gap:8,
          padding:'0.5rem 1rem', borderRadius:20,
          background:'var(--surface-2)', fontSize:'0.92rem', color:'var(--text)',
          fontWeight: 600,
          marginBottom:'1rem',
        }}>
          <Clock size={14}/> {fmtDT(dateTime)}
        </div>

        {/* Step 1 — type cards */}
        {!type && (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.6rem', paddingBottom:'1.5rem' }}>
            {TYPE_OPTS.map(opt => (
              <button key={opt.key} onClick={() => setType(opt.key)} style={{
                display:'flex', alignItems:'center', gap:16, width:'100%',
                padding:'1rem 1.1rem', borderRadius:14, cursor:'pointer', textAlign:'left',
                background:`${opt.color}15`, border:`2px solid ${opt.color}`,
              }}>
                <span style={{ fontSize:'2rem', lineHeight:1 }}>{opt.icon}</span>
                <div>
                  <div style={{ fontWeight:700, color:opt.color, fontSize:'1rem' }}>{opt.label}</div>
                  <div style={{ fontSize:'0.78rem', color:'var(--text-muted)', marginTop:2 }}>{opt.desc}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Step 2a — Groepsles */}
        {type === 'class' && (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem', paddingBottom:'1.5rem' }}>
            <div>
              <label className="input-label">Naam les</label>
              <input className="input" style={{ fontSize:'1rem' }} placeholder="Kickboksen recreanten"
                value={cls.name} onChange={e => setCls({...cls, name:e.target.value})} autoFocus/>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem' }}>
              <div>
                <label className="input-label">Categorie</label>
                <select className="input" value={cls.category} onChange={e => setCls({...cls, category:e.target.value})}>
                  {CLASS_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Trainer</label>
                <select className="input" value={cls.instructor} onChange={e => setCls({...cls, instructor:e.target.value})}>
                  {TRAINERS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Datum & tijd</label>
                <input className="input" type="datetime-local" value={cls.date_time}
                  onChange={e => setCls({...cls, date_time:e.target.value})}/>
              </div>
              <div>
                <label className="input-label">Duur (min)</label>
                <input className="input" type="number" min="30" max="180" step="15"
                  value={cls.duration_minutes} onChange={e => setCls({...cls, duration_minutes:parseInt(e.target.value)})}/>
              </div>
              <div>
                <label className="input-label">Max deelnemers</label>
                <input className="input" type="number" min="1" max="100"
                  value={cls.max_capacity} onChange={e => setCls({...cls, max_capacity:parseInt(e.target.value)})}/>
              </div>
              <div>
                <label className="input-label">Locatie</label>
                <input className="input" value={cls.location} onChange={e => setCls({...cls, location:e.target.value})}/>
              </div>
            </div>
          </div>
        )}

        {/* Step 2b — PT */}
        {type === 'pt' && (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem', paddingBottom:'1.5rem' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem' }}>
              <div style={{ gridColumn:'span 2' }}>
                <label className="input-label">Datum & tijd</label>
                <input className="input" type="datetime-local" value={pt.date_time}
                  onChange={e => setPt({...pt, date_time:e.target.value})}/>
              </div>
              <div>
                <label className="input-label">Trainer</label>
                <select className="input" value={pt.trainer} onChange={e => setPt({...pt, trainer:e.target.value})}>
                  {TRAINERS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Duur (min)</label>
                <input className="input" type="number" min="30" max="120" step="15"
                  value={pt.duration_minutes} onChange={e => setPt({...pt, duration_minutes:parseInt(e.target.value)})}/>
              </div>
              <div style={{ gridColumn:'span 2' }}>
                <label className="input-label">Lid <span style={{fontWeight:400, color:'var(--text-muted)'}}>— direct inboeken (optioneel)</span></label>
                <select className="input" style={{ fontSize:'0.95rem' }} value={pt.member_id} onChange={e => setPt({...pt, member_id:e.target.value})}>
                  <option value="">— Vrij slot —</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
                </select>
              </div>
              <div style={{ gridColumn:'span 2' }}>
                <label className="input-label">Notities <span style={{fontWeight:400, color:'var(--text-muted)'}}>(optioneel)</span></label>
                <input className="input" placeholder="Bijv. conditie, kracht…"
                  value={pt.notes} onChange={e => setPt({...pt, notes:e.target.value})}/>
              </div>
            </div>
          </div>
        )}

        {/* Step 2c — VT */}
        {type === 'vt' && (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem', paddingBottom:'1.5rem' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'0.5rem' }}>
              <div>
                <label className="input-label">Datum</label>
                <input className="input" type="date" value={vt.date}
                  onChange={e => setVt({...vt, date:e.target.value})}/>
              </div>
              <div>
                <label className="input-label">Van</label>
                <select className="input" value={vt.start_time} onChange={e => setVt({...vt, start_time:e.target.value})}>
                  {VT_HOUR_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Tot</label>
                <select className="input" value={vt.end_time} onChange={e => setVt({...vt, end_time:e.target.value})}>
                  {VT_HOUR_OPTIONS.filter(o => o > vt.start_time).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Max plekken</label>
                <input className="input" type="number" min="1" max="50"
                  value={vt.max_bookings} onChange={e => setVt({...vt, max_bookings:parseInt(e.target.value)})}/>
              </div>
            </div>
          </div>
        )}

        {error && <p style={{ color:'var(--error)', fontSize:'0.85rem', marginBottom:'0.5rem' }}>{error}</p>}

        {type && (
          <button onClick={save} disabled={saving} style={{
            width:'100%', padding:'0.9rem', borderRadius:14, border:'none',
            background: btnColor, color: btnText,
            fontWeight:800, fontSize:'1rem', cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1, display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            marginBottom:'0.5rem',
          }}>
            {saving ? 'Bezig…' : <><Check size={16}/> Inplannen</>}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AgendaPage() {
  const { user } = useAuth()
  const isAdmin  = user?.role === 'admin'

  const [monday,    setMonday]    = useState(getMonday(new Date()))
  const [agenda,    setAgenda]    = useState({ classes:[], pt_bookings:[], pt_available:[], vt_slots:[] })
  const [loading,   setLoading]   = useState(true)
  const [detail,    setDetail]    = useState(null)
  const [vtReqSlot, setVtReqSlot] = useState(null)
  const [vtReqNote, setVtReqNote] = useState('')
  const [vtSaving,  setVtSaving]  = useState(false)
  const [vtError,   setVtError]   = useState('')

  // Admin: VT slot form
  const [showNewSlot, setShowNewSlot] = useState(false)
  const [newSlot,     setNewSlot]     = useState({ date: new Date().toISOString().split('T')[0], start_time:'09:00', end_time:'22:00', max_bookings:10, notes:'', repeat_type:'none', repeat_until:'' })

  // Admin: PT slot form
  const [showNewPtSlot, setShowNewPtSlot] = useState(false)
  const [newPtSlot,     setNewPtSlot]     = useState({ date_time:'', duration_minutes:60, trainer:'Mohammed', notes:'', repeat_type:'none', repeat_until:'' })

  // Admin: Class creation form
  const [showNewClass, setShowNewClass] = useState(false)
  const [newClass,     setNewClass]     = useState({
    name:'', instructor:'Mohammed', category:'kickboksen-recreanten',
    date_time:'', duration_minutes:60, max_capacity:18, location:'Zaal A',
    repeat_type:'none', repeat_weeks:4,
  })
  const [classCreating, setClassCreating] = useState(false)

  // Admin: class bookings in popup
  const [classBookings,  setClassBookings]  = useState([])
  const [loadingCB,      setLoadingCB]      = useState(false)

  // Admin: direct VT booking
  const [directBook, setDirectBook] = useState(null)
  const [members,    setMembers]    = useState([])
  const [selMember,  setSelMember]  = useState('')

  // Admin: quick create (click-on-calendar)
  const [quickCreate, setQuickCreate] = useState(null) // { date, dateTime }

  // Week / Day view toggle
  const [viewMode,    setViewMode]    = useState('week') // 'week' | 'day'
  const [selectedDay, setSelectedDay] = useState(new Date())

  // Admin: inboeken lid in les of PT slot
  const [bookingTarget,   setBookingTarget]   = useState(null)  // { type:'class'|'pt', id }
  const [bookingMemberId, setBookingMemberId] = useState('')
  const [bookingLoading,  setBookingLoading]  = useState(false)
  const [bookingError,    setBookingError]    = useState('')

  // Member: VT usage
  const [vtWeekUsage, setVtWeekUsage] = useState(0)
  const [vtWeekLimit, setVtWeekLimit] = useState(3)

  const scrollRef  = useRef(null)
  const touchStart = useRef(null)

  const sunday = addDays(monday, 6)
  const from   = toDateStr(monday)
  const to     = toDateStr(sunday)
  const today  = toDateStr(new Date())

  const reload = () => {
    setLoading(true)
    api.get(`/agenda?from=${from}&to=${to}`)
      .then(r => {
        setAgenda(r.data)
        if (!isAdmin) {
          setVtWeekUsage(r.data.vt_week_usage ?? 0)
          setVtWeekLimit(r.data.vt_week_limit ?? 3)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(reload, [from, to])
  // Scroll naar 08:00 bij laden én bij wisselen tussen week- en dagweergave
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = HOUR_PX * 8
  }, [viewMode])

  useEffect(() => {
    if (isAdmin) {
      api.get('/admin/members').then(r => setMembers(r.data.members || [])).catch(() => {})
    }
  }, [isAdmin])

  // Touch swipe
  const handleTouchStart = e => { touchStart.current = e.touches[0].clientX }
  const handleTouchEnd   = e => {
    if (touchStart.current == null) return
    const dx = e.changedTouches[0].clientX - touchStart.current
    if (Math.abs(dx) > 60) setMonday(m => addDays(m, dx < 0 ? 7 : -7))
    touchStart.current = null
  }

  const handleTouchEndDay = e => {
    if (touchStart.current == null) return
    const dx = e.changedTouches[0].clientX - touchStart.current
    if (Math.abs(dx) > 50) setSelectedDay(d => addDays(d, dx < 0 ? 1 : -1))
    touchStart.current = null
  }

  // When selectedDay changes in day view, make sure monday tracks the right week
  useEffect(() => {
    if (viewMode === 'day') setMonday(getMonday(selectedDay))
  }, [selectedDay, viewMode])

  // ── Events per dag ────────────────────────────────────────────────────────
  function eventsForDay(dateStr) {
    const events = []

    // Groepslessen — GOLD
    agenda.classes
      .filter(c => dtToDate(c.date_time) === dateStr)
      .forEach(c => events.push({
        type: 'class', id: `c-${c.id}`, raw: c,
        top: dtToPx(c.date_time),
        height: Math.max(durationPx(c.duration_minutes || 60), 28),
        label: c.name,
        sub: c.instructor,
        ...COLORS.class,
      }))

    // PT boekingen — BLUE
    agenda.pt_bookings
      .filter(b => dtToDate(b.date_time) === dateStr)
      .forEach(b => {
        const isPending = b.status === 'pending'
        events.push({
          type: isPending ? 'pt_pending' : 'pt_confirmed', id: `pt-${b.id}`, raw: b,
          top: dtToPx(b.date_time),
          height: Math.max(durationPx(b.duration_minutes || 60), 28),
          label: isAdmin ? `PT — ${b.first_name} ${b.last_name}` : 'Personal Training',
          sub: b.trainer,
          ...(isPending ? COLORS.pt_pending : COLORS.pt_confirmed),
        })
      })

    // PT beschikbare slots (admin only) — light BLUE
    if (isAdmin) {
      ;(agenda.pt_available || [])
        .filter(s => dtToDate(s.date_time) === dateStr)
        .forEach(s => events.push({
          type: 'pt_available', id: `pta-${s.id}`, raw: s,
          top: dtToPx(s.date_time),
          height: Math.max(durationPx(s.duration_minutes || 60), 28),
          label: `PT — vrij (${s.trainer})`,
          sub: s.trainer,
          ...COLORS.pt_available,
        }))
    }

    // VT slots — GREEN
    ;(agenda.vt_slots || [])
      .filter(s => s.date === dateStr)
      .forEach(s => {
        const col = isAdmin
          ? (() => {
              const { label, color } = vtAdminLabel(s)
              const pending = Number(s.pending_count || 0)
              return {
                bg: pending > 0 ? COLORS.vt_requested.bg : COLORS.vt_avail.bg,
                border: pending > 0 ? COLORS.vt_requested.border : COLORS.vt_avail.border,
                statusLabel: label,
              }
            })()
          : (() => {
              const c = vtSlotColor(s)
              return { bg: c.bg, border: c.border, statusLabel: '' }
            })()

        events.push({
          type: 'vt_slot', id: `vt-${s.id}`, raw: s,
          top: timeToPx(s.start_time),
          height: Math.max(timeToPx(s.end_time) - timeToPx(s.start_time), 36),
          label: isAdmin
            ? `VT ${s.start_time}–${s.end_time}`
            : `VT ${s.start_time}`,
          sub: isAdmin ? col.statusLabel : `${s.booking_count}/${s.max_bookings} plekken`,
          bg: col.bg, border: col.border,
        })
      })

    return events
  }

  // ── VT aanvragen (lid) ──────────────────────────────────────────────────
  const requestVt = async () => {
    if (!vtReqSlot) return
    setVtSaving(true); setVtError('')
    try {
      await api.post(`/vt/slots/${vtReqSlot.id}/book`, { notes: vtReqNote })
      setVtReqSlot(null); setVtReqNote('')
      reload()
    } catch (e) {
      setVtError(e.response?.data?.error || 'Fout bij aanvragen.')
    } finally { setVtSaving(false) }
  }

  const cancelVt = async (bookingId) => {
    try {
      await api.delete(`/vt/bookings/${bookingId}`)
      setDetail(null); reload()
    } catch (e) { alert(e.response?.data?.error || 'Fout bij annuleren.') }
  }

  // ── Admin: VT slot aanmaken ───────────────────────────────────────────────
  const createVtSlot = async () => {
    if (!newSlot.date || !newSlot.start_time || !newSlot.end_time) {
      return alert('Vul alle velden in.')
    }
    const dates = getDatesForRepeat(newSlot.date, newSlot.repeat_type, newSlot.repeat_until)
    let total = 0
    for (const date of dates) {
      try {
        const r = await api.post('/vt/admin/slots', { ...newSlot, date })
        total += r.data.count || 1
      } catch (e) { console.error('VT slot fout voor', date, e.response?.data?.error) }
    }
    setShowNewSlot(false)
    setNewSlot({ date: new Date().toISOString().split('T')[0], start_time:'09:00', end_time:'22:00', max_bookings:10, notes:'', repeat_type:'none', repeat_until:'' })
    reload()
    if (total > 1) alert(`✅ ${total} VT slots aangemaakt over ${dates.length} dag${dates.length !== 1 ? 'en' : ''}!`)
  }

  // ── Admin: PT slot aanmaken ───────────────────────────────────────────────
  const createPtSlot = async () => {
    if (!newPtSlot.date_time) return alert('Vul datum en tijd in.')
    const [baseDate, time] = newPtSlot.date_time.split('T')
    const dates = getDatesForRepeat(baseDate, newPtSlot.repeat_type, newPtSlot.repeat_until)
    let count = 0
    for (const date of dates) {
      try {
        await api.post('/pt/slots', { ...newPtSlot, date_time: `${date}T${time}` })
        count++
      } catch (e) { console.error('PT slot fout voor', date, e.response?.data?.error) }
    }
    setShowNewPtSlot(false)
    setNewPtSlot({ date_time:'', duration_minutes:60, trainer:'Mohammed', notes:'', repeat_type:'none', repeat_until:'' })
    reload()
    if (count > 1) alert(`✅ ${count} PT slots aangemaakt!`)
  }

  // ── Admin: les aanmaken ───────────────────────────────────────────────────
  const createClass = async () => {
    if (!newClass.name || !newClass.date_time) return alert('Vul naam en datum in.')
    setClassCreating(true)
    try {
      const r = await api.post('/admin/classes', newClass)
      const count = r.data.count || 1
      setShowNewClass(false)
      setNewClass({
        name:'', instructor:'Mohammed', category:'kickboksen-recreanten',
        date_time:'', duration_minutes:60, max_capacity:18, location:'Zaal A',
        repeat_type:'none', repeat_weeks:4,
      })
      reload()
      if (count > 1) alert(`${count} lessen aangemaakt!`)
    } catch (e) { alert(e.response?.data?.error || 'Fout bij aanmaken.') }
    setClassCreating(false)
  }

  // ── Admin: fetch class bookings ───────────────────────────────────────────
  const fetchClassBookings = async (classId) => {
    setLoadingCB(true)
    try {
      const r = await api.get(`/admin/classes/${classId}/bookings`)
      setClassBookings(r.data.bookings || [])
    } catch { setClassBookings([]) }
    setLoadingCB(false)
  }

  // ── Admin: VT bevestig/weiger ──────────────────────────────────────────────
  const confirmVtBooking = async (bookingId) => {
    await api.put(`/vt/admin/bookings/${bookingId}/confirm`)
    setDetail(null); reload()
  }
  const declineVtBooking = async (bookingId) => {
    await api.put(`/vt/admin/bookings/${bookingId}/decline`)
    setDetail(null); reload()
  }

  // ── Admin: direct lid boeken VT ───────────────────────────────────────────
  const doDirectBook = async () => {
    if (!selMember) return
    try {
      await api.post(`/vt/admin/slots/${directBook.id}/book-member`, { user_id: parseInt(selMember) })
      setDirectBook(null); setSelMember(''); setDetail(null); reload()
    } catch (e) { alert(e.response?.data?.error || 'Fout') }
  }

  // ── Admin: lid inboeken in les of PT slot ────────────────────────────────
  const doAdminBook = async () => {
    if (!bookingMemberId || !bookingTarget) return
    setBookingLoading(true); setBookingError('')
    try {
      if (bookingTarget.type === 'class') {
        await api.post('/admin/bookings/class', { class_id: bookingTarget.id, user_id: parseInt(bookingMemberId) })
      } else {
        await api.post('/admin/bookings/pt', { slot_id: bookingTarget.id, user_id: parseInt(bookingMemberId) })
      }
      setBookingTarget(null); setBookingMemberId(''); setDetail(null); reload()
    } catch (e) {
      setBookingError(e.response?.data?.error || 'Fout bij inboeken.')
    }
    setBookingLoading(false)
  }

  // ── Admin: class verwijderen ──────────────────────────────────────────────
  const deleteClass = async (classId) => {
    if (!confirm('Les annuleren?')) return
    try {
      await api.delete(`/admin/classes/${classId}`)
      setDetail(null); reload()
    } catch (e) { alert(e.response?.data?.error || 'Fout') }
  }

  // ── Admin: PT slot verwijderen ────────────────────────────────────────────
  const deletePtSlot = async (slotId) => {
    if (!confirm('PT slot verwijderen?')) return
    try {
      await api.delete(`/pt/slots/${slotId}`)
      setDetail(null); reload()
    } catch (e) { alert(e.response?.data?.error || 'Fout') }
  }

  // ── Slot click ────────────────────────────────────────────────────────────
  const onSlotClick = (ev) => {
    if (ev.type === 'vt_slot') {
      if (isAdmin) {
        setDetail(ev)
        setClassBookings([])
      } else {
        const s = ev.raw
        if (s.my_booking_id) {
          setDetail(ev)
        } else {
          const isFull = Number(s.booking_count) >= Number(s.max_bookings)
          if (!isFull) {
            setVtReqSlot(s); setVtReqNote(''); setVtError('')
          }
        }
      }
    } else if (ev.type === 'class') {
      setDetail(ev)
      setClassBookings([])
      if (isAdmin) fetchClassBookings(ev.raw.id)
    } else {
      setDetail(ev)
      setClassBookings([])
    }
  }

  // ── Upcoming member sessions (this + next week) ────────────────────────────
  const upcomingSessions = !isAdmin
    ? [
        ...(agenda.classes || [])
          .filter(c => c.i_booked && new Date(c.date_time) > new Date())
          .map(c => ({ type:'class', label: c.name, sub: c.instructor, dt: new Date(c.date_time), color: '#f5c200' })),
        ...(agenda.pt_bookings || [])
          .filter(b => b.status !== 'cancelled' && new Date(b.date_time) > new Date())
          .map(b => ({ type:'pt', label: 'Personal Training', sub: b.trainer, dt: new Date(b.date_time), color: '#3b82f6' })),
        ...(agenda.vt_slots || [])
          .filter(s => s.my_status === 'confirmed' || s.my_status === 'requested')
          .filter(s => new Date(s.date + 'T' + s.start_time) > new Date())
          .map(s => ({ type:'vt', label: 'Vrij Trainen', sub: `${s.start_time}–${s.end_time}`, dt: new Date(s.date + 'T' + s.start_time), color: '#22c55e', statusColor: s.my_status === 'requested' ? '#f59e0b' : '#22c55e' })),
      ].sort((a,b) => a.dt - b.dt).slice(0,5)
    : []

  const headerDateFmt = d => d.toLocaleDateString('nl-NL', { day:'numeric', month:'short' })
  const fmtDT = iso => new Date(iso).toLocaleString('nl-NL', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })

  // Active form (only 1 open at a time)
  const closeAllForms = () => { setShowNewSlot(false); setShowNewPtSlot(false); setShowNewClass(false) }

  // Computed VT slot count for admin form
  const vtSlotPreview = vtSlotCount(newSlot.start_time, newSlot.end_time)

  // Admin: click on empty calendar cell → open quick-create modal
  const handleColClick = (e, dStr) => {
    if (!isAdmin) return
    // Ignore if a form panel is open (avoid accidental triggers)
    if (showNewClass || showNewPtSlot || showNewSlot) return
    const rect      = e.currentTarget.getBoundingClientRect()
    const relY      = Math.max(0, e.clientY - rect.top)
    const totalMins = Math.round((relY / HOUR_PX) * 60 / 15) * 15
    const h  = Math.min(Math.max(Math.floor(totalMins / 60), 0), 23)
    const m  = totalMins % 60
    const hh = String(h).padStart(2, '0')
    const mm = String(m).padStart(2, '0')
    setQuickCreate({ date: dStr, dateTime: `${dStr}T${hh}:${mm}` })
  }

  return (
    <div className="agenda-page">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="agenda-header">
        <div className="agenda-header-top">
          <h1 className="agenda-title">Agenda</h1>
          <div style={{ display:'flex', gap:'0.4rem', alignItems:'center', flexWrap:'wrap' }}>
            {isAdmin && (
              <>
                <button
                  className={`btn btn-sm${showNewClass ? ' btn-outline' : ' btn-primary'}`}
                  style={{ borderColor:'#f5c200', color: showNewClass ? '#f5c200' : '#000', background: showNewClass ? 'transparent' : '#f5c200' }}
                  onClick={() => { closeAllForms(); setShowNewClass(s => !s) }}>
                  <Plus size={13}/> Les
                </button>
                <button
                  className={`btn btn-sm${showNewPtSlot ? ' btn-outline' : ''}`}
                  style={{ borderColor:'#3b82f6', color: showNewPtSlot ? '#3b82f6' : '#fff', background: showNewPtSlot ? 'transparent' : '#3b82f6' }}
                  onClick={() => { closeAllForms(); setShowNewPtSlot(s => !s) }}>
                  <Plus size={13}/> PT
                </button>
                <button
                  className={`btn btn-sm${showNewSlot ? ' btn-outline' : ''}`}
                  style={{ borderColor:'#22c55e', color: showNewSlot ? '#22c55e' : '#fff', background: showNewSlot ? 'transparent' : '#22c55e' }}
                  onClick={() => { closeAllForms(); setShowNewSlot(s => !s) }}>
                  <Plus size={13}/> VT
                </button>
              </>
            )}
            {!isAdmin && vtWeekLimit > 0 && (
              <span style={{
                fontSize:'0.78rem', padding:'3px 10px', borderRadius:12,
                background: vtWeekUsage >= vtWeekLimit ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                color: vtWeekUsage >= vtWeekLimit ? 'var(--error)' : 'var(--success)',
                fontWeight: 600,
              }}>
                {vtWeekUsage}/{vtWeekLimit} VT deze week
              </span>
            )}
            {/* Week / Dag toggle */}
            <div style={{ display:'flex', gap:2, background:'var(--surface-2)', borderRadius:8, padding:2 }}>
              <button
                onClick={() => setViewMode('week')}
                style={{
                  padding:'4px 12px', borderRadius:6, border:'none', cursor:'pointer', fontSize:'0.8rem', fontWeight:600,
                  background: viewMode === 'week' ? 'var(--accent)' : 'transparent',
                  color: viewMode === 'week' ? '#000' : 'var(--text-muted)',
                }}>Week</button>
              <button
                onClick={() => { setViewMode('day'); setSelectedDay(new Date()) }}
                style={{
                  padding:'4px 12px', borderRadius:6, border:'none', cursor:'pointer', fontSize:'0.8rem', fontWeight:600,
                  background: viewMode === 'day' ? 'var(--accent)' : 'transparent',
                  color: viewMode === 'day' ? '#000' : 'var(--text-muted)',
                }}>Dag</button>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => {
              if (viewMode === 'day') setSelectedDay(new Date())
              else setMonday(getMonday(new Date()))
            }}>Vandaag</button>
            <button className="btn-icon" onClick={() => {
              if (viewMode === 'day') setSelectedDay(d => addDays(d, -1))
              else setMonday(m => addDays(m, -7))
            }}><ChevronLeft size={18}/></button>
            <button className="btn-icon" onClick={() => {
              if (viewMode === 'day') setSelectedDay(d => addDays(d, 1))
              else setMonday(m => addDays(m, 7))
            }}><ChevronRight size={18}/></button>
          </div>
        </div>
        <p className="agenda-week-label">{headerDateFmt(monday)} – {headerDateFmt(sunday)}</p>

        {/* Legenda */}
        <div className="agenda-legend">
          {[
            ['#f5c200','Groepslessen'],
            ['#3b82f6','Personal Training'],
            ['#f59e0b','VT aangevraagd'],
            ['#22c55e','Vrij Trainen'],
          ].map(([color, label]) => (
            <span key={label} className="legend-item">
              <span className="legend-dot" style={{ background: color }}/>{label}
            </span>
          ))}
        </div>

        {/* ── Admin: Nieuwe les form ──────────────────────────────────── */}
        {isAdmin && showNewClass && (
          <div className="card" style={{ marginTop:'1rem', padding:'1rem', borderColor:'rgba(245,194,0,0.5)' }}>
            <h3 style={{ marginBottom:'0.75rem', fontSize:'0.95rem', color:'#f5c200', display:'flex', alignItems:'center', gap:6 }}>
              <Plus size={15}/> Nieuwe les plannen
            </h3>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:'0.6rem' }}>
              <div style={{ gridColumn:'span 2' }}>
                <label className="input-label">Naam</label>
                <input className="input" placeholder="Kickboksen" value={newClass.name} onChange={e => setNewClass({...newClass,name:e.target.value})}/>
              </div>
              <div>
                <label className="input-label">Categorie</label>
                <select className="input" value={newClass.category} onChange={e => setNewClass({...newClass,category:e.target.value})}>
                  {CLASS_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Trainer</label>
                <select className="input" value={newClass.instructor} onChange={e => setNewClass({...newClass,instructor:e.target.value})}>
                  {TRAINERS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ gridColumn:'span 2' }}>
                <label className="input-label">Datum & tijd</label>
                <input className="input" type="datetime-local" value={newClass.date_time} onChange={e => setNewClass({...newClass,date_time:e.target.value})}/>
              </div>
              <div>
                <label className="input-label">Max deelnemers</label>
                <input className="input" type="number" min="1" max="100" value={newClass.max_capacity} onChange={e => setNewClass({...newClass,max_capacity:parseInt(e.target.value)})}/>
              </div>
              <div>
                <label className="input-label">Locatie</label>
                <input className="input" value={newClass.location} onChange={e => setNewClass({...newClass,location:e.target.value})}/>
              </div>
              {/* Recurring */}
              <div style={{ gridColumn:'span 2' }}>
                <label className="input-label">Herhalen</label>
                <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap' }}>
                  {[['none','Eenmalig'],['weekly','Wekelijks'],['biweekly','2-wekelijks']].map(([k,l]) => (
                    <button
                      key={k}
                      className={`btn btn-sm${newClass.repeat_type===k ? ' btn-primary' : ' btn-ghost'}`}
                      style={{ fontSize:'0.8rem' }}
                      onClick={() => setNewClass({...newClass, repeat_type:k})}
                    >
                      {k !== 'none' && <Repeat size={12} style={{ marginRight:3 }}/>}{l}
                    </button>
                  ))}
                </div>
              </div>
              {newClass.repeat_type !== 'none' && (
                <div>
                  <label className="input-label">Aantal weken</label>
                  <input className="input" type="number" min="2" max="26" value={newClass.repeat_weeks}
                    onChange={e => setNewClass({...newClass,repeat_weeks:parseInt(e.target.value)})}/>
                  <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginTop:3 }}>
                    Maakt {newClass.repeat_weeks} les{Number(newClass.repeat_weeks)>1?'sen':''} aan
                  </p>
                </div>
              )}
            </div>
            <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.75rem' }}>
              <button className="btn btn-primary btn-sm" onClick={createClass} disabled={classCreating}>
                {classCreating ? <span className="spinner spinner-sm"/> : <><Check size={13}/> Aanmaken</>}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowNewClass(false)}><X size={13}/> Annuleren</button>
            </div>
          </div>
        )}

        {/* ── Admin: PT slot form ─────────────────────────────────────── */}
        {isAdmin && showNewPtSlot && (
          <div className="card" style={{ marginTop:'1rem', padding:'1rem', borderColor:'rgba(59,130,246,0.4)' }}>
            <h3 style={{ marginBottom:'0.75rem', fontSize:'0.95rem', color:'#3b82f6', display:'flex', alignItems:'center', gap:6 }}>
              <Plus size={15}/> PT slot aanmaken
            </h3>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:'0.6rem' }}>
              <div style={{ gridColumn:'span 2' }}>
                <label className="input-label">Datum & tijd</label>
                <input className="input" type="datetime-local" value={newPtSlot.date_time}
                  onChange={e => setNewPtSlot({...newPtSlot,date_time:e.target.value})}/>
              </div>
              <div>
                <label className="input-label">Trainer</label>
                <select className="input" value={newPtSlot.trainer} onChange={e => setNewPtSlot({...newPtSlot,trainer:e.target.value})}>
                  {TRAINERS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Duur (min)</label>
                <input className="input" type="number" min="30" max="120" step="15"
                  value={newPtSlot.duration_minutes} onChange={e => setNewPtSlot({...newPtSlot,duration_minutes:parseInt(e.target.value)})}/>
              </div>
              <div style={{ gridColumn:'span 2' }}>
                <label className="input-label">Notities</label>
                <input className="input" placeholder="Optioneel…" value={newPtSlot.notes}
                  onChange={e => setNewPtSlot({...newPtSlot,notes:e.target.value})}/>
              </div>
              {/* Herhaling */}
              <div>
                <label className="input-label">Herhaling</label>
                <select className="input" value={newPtSlot.repeat_type} onChange={e => setNewPtSlot({...newPtSlot,repeat_type:e.target.value,repeat_until:''})}>
                  <option value="none">Eenmalig</option>
                  <option value="daily">Dagelijks</option>
                  <option value="weekly">Wekelijks</option>
                  <option value="monthly">Maandelijks</option>
                </select>
              </div>
              {newPtSlot.repeat_type !== 'none' && (
                <div>
                  <label className="input-label">Herhaal t/m</label>
                  <input className="input" type="date"
                    min={newPtSlot.date_time ? newPtSlot.date_time.substring(0,10) : today}
                    value={newPtSlot.repeat_until}
                    onChange={e => setNewPtSlot({...newPtSlot,repeat_until:e.target.value})}/>
                </div>
              )}
            </div>
            {newPtSlot.date_time && newPtSlot.repeat_type !== 'none' && newPtSlot.repeat_until && (() => {
              const baseDate = newPtSlot.date_time.substring(0,10)
              const repeatDates = getDatesForRepeat(baseDate, newPtSlot.repeat_type, newPtSlot.repeat_until)
              return (
                <div style={{ marginTop:'0.6rem', padding:'0.5rem 0.75rem', background:'rgba(59,130,246,0.1)', borderRadius:'var(--r)', fontSize:'0.82rem', color:'#3b82f6', fontWeight:600 }}>
                  ✓ {repeatDates.length} PT slot{repeatDates.length !== 1 ? 's' : ''} worden aangemaakt
                </div>
              )
            })()}
            <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.75rem' }}>
              <button className="btn btn-sm" style={{ background:'#3b82f6',color:'#fff' }} onClick={createPtSlot}><Check size={13}/> Aanmaken</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowNewPtSlot(false)}><X size={13}/> Annuleren</button>
            </div>
          </div>
        )}

        {/* ── Admin: VT slot form ─────────────────────────────────────── */}
        {isAdmin && showNewSlot && (
          <div className="card" style={{ marginTop:'1rem', padding:'1rem', borderColor:'rgba(34,197,94,0.4)' }}>
            <h3 style={{ marginBottom:'0.75rem', fontSize:'0.95rem', color:'#22c55e', display:'flex', alignItems:'center', gap:6 }}>
              <Plus size={15}/> Vrij Trainen tijdblok
            </h3>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:'0.6rem' }}>
              <div>
                <label className="input-label">Startdatum</label>
                <input className="input" type="date" min={today}
                  value={newSlot.date} onChange={e => setNewSlot({...newSlot,date:e.target.value})}/>
              </div>
              <div>
                <label className="input-label">Van</label>
                <select className="input" value={newSlot.start_time} onChange={e => setNewSlot({...newSlot,start_time:e.target.value})}>
                  {VT_HOUR_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Tot</label>
                <select className="input" value={newSlot.end_time} onChange={e => setNewSlot({...newSlot,end_time:e.target.value})}>
                  {VT_HOUR_OPTIONS.filter(o => o > newSlot.start_time).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Max/slot</label>
                <input className="input" type="number" min="1" max="50"
                  value={newSlot.max_bookings} onChange={e => setNewSlot({...newSlot,max_bookings:parseInt(e.target.value)})}/>
              </div>
              {/* Herhaling */}
              <div>
                <label className="input-label">Herhaling</label>
                <select className="input" value={newSlot.repeat_type} onChange={e => setNewSlot({...newSlot,repeat_type:e.target.value,repeat_until:''})}>
                  <option value="none">Eenmalig</option>
                  <option value="daily">Dagelijks</option>
                  <option value="weekly">Wekelijks</option>
                  <option value="monthly">Maandelijks</option>
                </select>
              </div>
              {newSlot.repeat_type !== 'none' && (
                <div>
                  <label className="input-label">Herhaal t/m</label>
                  <input className="input" type="date" min={newSlot.date || today}
                    value={newSlot.repeat_until} onChange={e => setNewSlot({...newSlot,repeat_until:e.target.value})}/>
                </div>
              )}
              <div style={{ gridColumn:'span 2' }}>
                <label className="input-label">Notities</label>
                <input className="input" placeholder="Optioneel…"
                  value={newSlot.notes} onChange={e => setNewSlot({...newSlot,notes:e.target.value})}/>
              </div>
            </div>
            {vtSlotPreview > 0 && (() => {
              const repeatDates = getDatesForRepeat(newSlot.date, newSlot.repeat_type, newSlot.repeat_until)
              const totalSlots = vtSlotPreview * repeatDates.length
              return (
                <div style={{ marginTop:'0.6rem', padding:'0.5rem 0.75rem', background:'rgba(34,197,94,0.1)', borderRadius:'var(--r)', fontSize:'0.82rem', color:'#22c55e', fontWeight:600 }}>
                  {newSlot.repeat_type === 'none'
                    ? (vtSlotPreview === 1 ? '✓ 1 slot van 1 uur wordt aangemaakt' : `✓ ${vtSlotPreview} slots van 1 uur worden aangemaakt`)
                    : `✓ ${totalSlots} slots over ${repeatDates.length} dag${repeatDates.length !== 1 ? 'en' : ''} (${vtSlotPreview} slot${vtSlotPreview !== 1 ? 's' : ''}/dag)`
                  }
                </div>
              )
            })()}
            <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.75rem' }}>
              <button className="btn btn-sm" style={{ background:'#22c55e',color:'#000' }} onClick={createVtSlot}><Check size={13}/> Aanmaken</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowNewSlot(false)}><X size={13}/> Annuleren</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Member: upcoming sessions ──────────────────────────────────── */}
      {!isAdmin && upcomingSessions.length > 0 && (
        <div style={{ padding:'0 1rem 0.5rem', display:'flex', gap:'0.5rem', overflowX:'auto', paddingBottom:'0.75rem' }}>
          {upcomingSessions.map((s, i) => (
            <div key={i} style={{
              flexShrink:0, background:'var(--surface-2)', borderRadius:'var(--r)',
              padding:'0.6rem 0.9rem', borderLeft:`3px solid ${s.statusColor || s.color}`,
              minWidth:140,
            }}>
              <div style={{ fontWeight:700, fontSize:'0.8rem', color: s.color }}>{s.label}</div>
              <div style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginTop:2 }}>{s.sub}</div>
              <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:2 }}>
                {s.dt.toLocaleDateString('nl-NL',{weekday:'short',day:'numeric',month:'short'})} {s.dt.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Dagweergave ───────────────────────────────────────────────── */}
      {viewMode === 'day' && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.5rem 1rem 0.25rem', flexShrink:0 }}>
            <button className="btn-icon" style={{ width:36, height:36 }} onClick={() => setSelectedDay(d => addDays(d, -1))}><ChevronLeft size={20}/></button>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontWeight:700, fontSize:'1.05rem', textTransform:'capitalize' }}>
                {selectedDay.toLocaleDateString('nl-NL', { weekday:'long', day:'numeric', month:'long' })}
              </div>
              {toDateStr(selectedDay) === today && (
                <div style={{ fontSize:'0.72rem', color:'var(--accent, #f5c200)', fontWeight:700, marginTop:1 }}>Vandaag</div>
              )}
            </div>
            <button className="btn-icon" style={{ width:36, height:36 }} onClick={() => setSelectedDay(d => addDays(d, 1))}><ChevronRight size={20}/></button>
          </div>
          <div className="agenda-wrap" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEndDay}>
            <div className="agenda-scroll" ref={scrollRef}>
              <div style={{ display:'flex', height: TOTAL_PX, position:'relative' }}>
                <div className="time-gutter">
                  {Array.from({ length: 24 }, (_,h) => (
                    <div key={h} className="time-label" style={{ top: h*HOUR_PX }}>{String(h).padStart(2,'0')}:00</div>
                  ))}
                </div>
                <div
                  className={`day-col${toDateStr(selectedDay)===today?' today-col':''}`}
                  style={{ flex:1, cursor: isAdmin ? 'cell' : 'default', minWidth:0 }}
                  onClick={e => { if(isAdmin) handleColClick(e, toDateStr(selectedDay)) }}
                >
                  {Array.from({ length: 24 }, (_,h) => (
                    <div key={h} className="hour-line" style={{ top: h*HOUR_PX }}/>
                  ))}
                  <div className="gym-open-zone" style={{ top:7*HOUR_PX, height:15*HOUR_PX }}/>
                  {eventsForDay(toDateStr(selectedDay)).map(ev => (
                    <div
                      key={ev.id}
                      className="cal-event"
                      style={{ top:ev.top, height:ev.height, background:ev.bg, borderLeft:`3px solid ${ev.border}`, right:2 }}
                      onClick={e => { e.stopPropagation(); onSlotClick(ev) }}
                    >
                      <span className="cal-event-label" style={{ color: ev.border==='#f5c200'?'#000':'inherit', fontSize:'0.88rem' }}>{ev.label}</span>
                      {ev.height > 40 && <span className="cal-event-sub" style={{ color: ev.border==='#f5c200'?'rgba(0,0,0,0.65)':'inherit' }}>{ev.sub}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Weekweergave ──────────────────────────────────────────────── */}
      {viewMode === 'week' && (
      <div className="agenda-wrap" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {/* Dag headers */}
        <div className="agenda-day-headers">
          <div className="time-gutter-header"/>
          {Array.from({ length: 7 }, (_,i) => {
            const d    = addDays(monday, i)
            const dStr = toDateStr(d)
            return (
              <div key={i} className={`day-header${dStr===today?' today':''}`}>
                <span className="day-abbr">{DAY_NAMES[i]}</span>
                <span className="day-num">{d.getDate()}</span>
              </div>
            )
          })}
        </div>

        {/* Time grid */}
        <div className="agenda-scroll" ref={scrollRef}>
          <div className="agenda-grid" style={{ height: TOTAL_PX }}>
            {/* Time labels */}
            <div className="time-gutter">
              {Array.from({ length: 24 }, (_,h) => (
                <div key={h} className="time-label" style={{ top: h*HOUR_PX }}>
                  {String(h).padStart(2,'0')}:00
                </div>
              ))}
            </div>

            {/* Day columns */}
            {Array.from({ length: 7 }, (_,i) => {
              const d    = addDays(monday, i)
              const dStr = toDateStr(d)
              const evts = eventsForDay(dStr)
              return (
                <div
                  key={i}
                  className={`day-col${dStr===today?' today-col':''}`}
                  onClick={e => handleColClick(e, dStr)}
                  style={isAdmin ? { cursor:'cell' } : {}}
                >
                  {Array.from({ length: 24 }, (_,h) => (
                    <div key={h} className="hour-line" style={{ top: h*HOUR_PX }}/>
                  ))}
                  <div className="gym-open-zone" style={{ top:7*HOUR_PX, height:15*HOUR_PX }}/>
                  {evts.map(ev => (
                    <div
                      key={ev.id}
                      className="cal-event"
                      style={{ top:ev.top, height:ev.height, background:ev.bg, borderLeft:`3px solid ${ev.border}` }}
                      onClick={e => { e.stopPropagation(); onSlotClick(ev) }}
                    >
                      <span className="cal-event-label" style={{ color: ev.border === '#f5c200' ? '#000' : 'inherit' }}>{ev.label}</span>
                      {ev.height > 36 && <span className="cal-event-sub" style={{ color: ev.border === '#f5c200' ? 'rgba(0,0,0,0.7)' : 'inherit' }}>{ev.sub}</span>}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      )}

      {/* ── Event detail popup ──────────────────────────────────────────── */}
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()} style={{ maxWidth:420 }}>
            <div className="modal-header">
              <h3 style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{
                  display:'inline-block', width:10, height:10, borderRadius:'50%',
                  background: detail.type==='class' ? '#f5c200'
                    : (detail.type.startsWith('pt') ? '#3b82f6' : '#22c55e'),
                }}/>
                {detail.label}
              </h3>
              <button className="btn-icon" onClick={() => setDetail(null)}><X size={18}/></button>
            </div>
            <div style={{ padding:'1rem', display:'flex', flexDirection:'column', gap:'0.75rem' }}>

              {/* ── Class detail ── */}
              {detail.type === 'class' && (
                <>
                  <p><Clock size={14} style={{ display:'inline', marginRight:6 }}/>
                    {new Date(detail.raw.date_time).toLocaleString('nl-NL',{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})}
                  </p>
                  <p><User size={14} style={{ display:'inline', marginRight:6 }}/>{detail.raw.instructor}</p>
                  <p><Users size={14} style={{ display:'inline', marginRight:6 }}/>
                    {detail.raw.confirmed_bookings}/{detail.raw.max_capacity} deelnemers
                    {detail.raw.i_booked ? <span style={{ color:'var(--success)', marginLeft:8, fontWeight:600 }}>✓ Jij bent geboekt</span> : null}
                  </p>
                  {detail.raw.repeat_type && detail.raw.repeat_type !== 'none' && (
                    <p style={{ fontSize:'0.8rem', color:'var(--text-muted)' }}>
                      <Repeat size={12} style={{ display:'inline', marginRight:4 }}/>{detail.raw.repeat_type === 'weekly' ? 'Wekelijks herhalend' : '2-wekelijks herhalend'}
                    </p>
                  )}

                  {/* Admin: bookings list */}
                  {isAdmin && (
                    <div style={{ display:'flex', flexDirection:'column', gap:'0.6rem' }}>
                      <p style={{ fontWeight:600, fontSize:'0.85rem', marginBottom:0, display:'flex', alignItems:'center', gap:6 }}>
                        Ingeschreven leden
                        {loadingCB && <RefreshCw size={12} style={{ animation:'spin 1s linear infinite' }}/>}
                      </p>
                      {!loadingCB && classBookings.length === 0 && (
                        <p style={{ color:'var(--text-muted)', fontSize:'0.83rem' }}>Nog niemand ingeschreven.</p>
                      )}
                      <div style={{ maxHeight:140, overflowY:'auto', display:'flex', flexDirection:'column', gap:3 }}>
                        {classBookings.map(b => (
                          <div key={b.id} style={{ display:'flex', justifyContent:'space-between', padding:'0.35rem 0.6rem', background:'var(--surface-2)', borderRadius:6, fontSize:'0.83rem' }}>
                            <span style={{ fontWeight:600 }}>{b.first_name} {b.last_name}</span>
                            <span style={{ color:'var(--text-muted)' }}>{b.email}</span>
                          </div>
                        ))}
                      </div>

                      {/* Lid inboeken */}
                      {bookingTarget?.id === detail.raw.id && bookingTarget?.type === 'class' ? (
                        <div style={{ display:'flex', flexDirection:'column', gap:'0.45rem', padding:'0.6rem', background:'var(--surface-2)', borderRadius:8 }}>
                          <label className="input-label">Kies lid om in te boeken</label>
                          <select className="input" value={bookingMemberId} onChange={e => { setBookingMemberId(e.target.value); setBookingError('') }}>
                            <option value="">— Selecteer lid —</option>
                            {members
                              .filter(m => !classBookings.some(b => b.email === m.email))
                              .map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
                          </select>
                          {bookingError && <p style={{ color:'var(--error)', fontSize:'0.8rem', margin:0 }}>{bookingError}</p>}
                          <div style={{ display:'flex', gap:'0.4rem' }}>
                            <button className="btn btn-primary btn-sm" onClick={doAdminBook} disabled={!bookingMemberId || bookingLoading}>
                              {bookingLoading ? 'Bezig…' : <><Check size={12}/> Inboeken</>}
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setBookingTarget(null); setBookingMemberId(''); setBookingError('') }}><X size={12}/></button>
                          </div>
                        </div>
                      ) : (
                        <button className="btn btn-outline btn-sm" style={{ borderColor:'#f5c200', color:'#f5c200' }}
                          onClick={() => { setBookingTarget({ type:'class', id: detail.raw.id }); setBookingMemberId(''); setBookingError('') }}>
                          <Plus size={13}/> Lid inboeken
                        </button>
                      )}

                      <button className="btn btn-danger btn-sm" onClick={() => deleteClass(detail.raw.id)}>
                        <Trash2 size={13}/> Les annuleren
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* ── PT detail ── */}
              {(detail.type === 'pt_confirmed' || detail.type === 'pt_pending' || detail.type === 'pt_available') && (
                <>
                  <p><Clock size={14} style={{ display:'inline', marginRight:6 }}/>
                    {new Date(detail.raw.date_time).toLocaleString('nl-NL',{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})}
                  </p>
                  <p><User size={14} style={{ display:'inline', marginRight:6 }}/>{detail.raw.trainer}</p>
                  <p>{detail.raw.duration_minutes || 60} minuten</p>
                  {isAdmin && detail.raw.first_name && (
                    <p style={{ color:'var(--success)' }}>
                      <Users size={14} style={{ display:'inline', marginRight:6 }}/>{detail.raw.first_name} {detail.raw.last_name}
                    </p>
                  )}
                  {detail.type !== 'pt_available' && (
                    <p style={{ color: detail.type==='pt_pending'?'var(--warning)':'var(--success)', fontWeight:600 }}>
                      {detail.type==='pt_pending' ? '⏳ Wacht op bevestiging' : '✓ Bevestigd'}
                    </p>
                  )}
                  {detail.type === 'pt_available' && (
                    <p style={{ color:'var(--text-muted)', fontSize:'0.85rem' }}>Vrij slot — nog niet geboekt</p>
                  )}
                  {isAdmin && (
                    <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                      {/* Lid inboeken (alleen voor vrije slots) */}
                      {detail.type === 'pt_available' && (
                        bookingTarget?.id === detail.raw.id && bookingTarget?.type === 'pt' ? (
                          <div style={{ display:'flex', flexDirection:'column', gap:'0.45rem', padding:'0.6rem', background:'var(--surface-2)', borderRadius:8 }}>
                            <label className="input-label">Kies lid om in te boeken</label>
                            <select className="input" value={bookingMemberId} onChange={e => { setBookingMemberId(e.target.value); setBookingError('') }}>
                              <option value="">— Selecteer lid —</option>
                              {members.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
                            </select>
                            {bookingError && <p style={{ color:'var(--error)', fontSize:'0.8rem', margin:0 }}>{bookingError}</p>}
                            <div style={{ display:'flex', gap:'0.4rem' }}>
                              <button className="btn btn-sm" style={{ background:'#3b82f6', color:'#fff' }} onClick={doAdminBook} disabled={!bookingMemberId || bookingLoading}>
                                {bookingLoading ? 'Bezig…' : <><Check size={12}/> Inboeken</>}
                              </button>
                              <button className="btn btn-ghost btn-sm" onClick={() => { setBookingTarget(null); setBookingMemberId(''); setBookingError('') }}><X size={12}/></button>
                            </div>
                          </div>
                        ) : (
                          <button className="btn btn-outline btn-sm" style={{ borderColor:'#3b82f6', color:'#3b82f6' }}
                            onClick={() => { setBookingTarget({ type:'pt', id: detail.raw.id }); setBookingMemberId(''); setBookingError('') }}>
                            <Plus size={13}/> Lid inboeken
                          </button>
                        )
                      )}
                      <button className="btn btn-danger btn-sm" onClick={() => deletePtSlot(detail.raw.id)}>
                        <Trash2 size={13}/> Slot verwijderen
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* ── VT slot detail ── */}
              {detail.type === 'vt_slot' && (() => {
                const s = detail.raw
                return (
                  <>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div>
                        <p style={{ fontWeight:700 }}>{s.date}</p>
                        <p style={{ color:'var(--text-muted)' }}>{s.start_time} – {s.end_time}</p>
                      </div>
                      <div style={{ textAlign:'right', fontSize:'0.85rem' }}>
                        <span style={{ fontWeight:700 }}>{s.booking_count}</span>
                        <span style={{ color:'var(--text-muted)' }}>/{s.max_bookings} plekken</span>
                      </div>
                    </div>
                    {s.notes && <p style={{ color:'var(--text-muted)', fontSize:'0.85rem' }}>{s.notes}</p>}

                    {/* Admin view */}
                    {isAdmin && (
                      <>
                        {(s.bookings || []).length > 0 && (
                          <div>
                            <p style={{ fontWeight:600, fontSize:'0.85rem', marginBottom:'0.4rem' }}>Boekingen:</p>
                            {s.bookings.map(b => (
                              <div key={b.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.4rem 0.6rem', background:'var(--surface-2)', borderRadius:6, marginBottom:3 }}>
                                <div style={{ fontSize:'0.85rem' }}>
                                  <span style={{ fontWeight:600 }}>{b.first_name} {b.last_name}</span>
                                  <span style={{ marginLeft:8, color:b.status==='confirmed'?'var(--success)':'var(--warning)', fontSize:'0.78rem' }}>
                                    {b.status==='confirmed' ? '✓ Bevestigd' : '⏳ Aangevraagd'}
                                  </span>
                                </div>
                                <div style={{ display:'flex', gap:4 }}>
                                  {b.status === 'requested' && (
                                    <>
                                      <button className="btn btn-sm" style={{ background:'var(--success-dim)',color:'var(--success)',padding:'2px 8px',fontSize:'0.78rem' }}
                                        onClick={() => confirmVtBooking(b.id)}><Check size={11}/></button>
                                      <button className="btn btn-danger btn-sm" style={{ padding:'2px 8px',fontSize:'0.78rem' }}
                                        onClick={() => declineVtBooking(b.id)}><X size={11}/></button>
                                    </>
                                  )}
                                  {b.status === 'confirmed' && (
                                    <button className="btn btn-ghost btn-sm" style={{ padding:'2px 8px',fontSize:'0.78rem' }}
                                      onClick={() => api.put(`/vt/admin/bookings/${b.id}/decline`).then(() => { setDetail(null); reload() })}>
                                      <X size={11}/>
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {Number(s.booking_count) < Number(s.max_bookings) && (
                          directBook?.id === s.id ? (
                            <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                              <label className="input-label">Kies lid</label>
                              <select className="input" value={selMember} onChange={e => setSelMember(e.target.value)}>
                                <option value="">— Selecteer lid —</option>
                                {members.map(m => (
                                  <option key={m.id} value={m.id}>{m.first_name} {m.last_name} ({m.email})</option>
                                ))}
                              </select>
                              <div style={{ display:'flex', gap:'0.5rem' }}>
                                <button className="btn btn-primary btn-sm" onClick={doDirectBook}><Check size={13}/> Boeken</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setDirectBook(null)}><X size={13}/></button>
                              </div>
                            </div>
                          ) : (
                            <button className="btn btn-outline btn-sm" onClick={() => setDirectBook(s)}>
                              <Plus size={13}/> Direct lid boeken
                            </button>
                          )
                        )}

                        <button className="btn btn-danger btn-sm" onClick={async () => {
                          if (!confirm('Slot verwijderen? Alle aanvragen worden geannuleerd.')) return
                          await api.delete(`/vt/admin/slots/${s.id}`)
                          setDetail(null); reload()
                        }}>
                          <Trash2 size={13}/> Slot verwijderen
                        </button>
                      </>
                    )}

                    {/* Lid view */}
                    {!isAdmin && s.my_booking_id && (
                      <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                        <div style={{
                          padding:'0.5rem 0.75rem', borderRadius:8,
                          background: s.my_status==='confirmed' ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
                          color: s.my_status==='confirmed' ? 'var(--success)' : 'var(--warning)',
                          fontSize:'0.85rem', fontWeight:600,
                        }}>
                          {s.my_status==='confirmed' ? '✓ Bevestigd' : '⏳ Wacht op bevestiging'}
                        </div>
                        <button className="btn btn-danger" style={{ width:'100%' }}
                          onClick={() => cancelVt(s.my_booking_id)}>
                          {s.my_status === 'requested' ? 'Aanvraag intrekken' : 'Annuleren'}
                        </button>
                      </div>
                    )}
                  </>
                )
              })()}

            </div>
          </div>
        </div>
      )}

      {/* ── VT aanvraag modal (lid) ─────────────────────────────────────── */}
      {vtReqSlot && (
        <div className="modal-overlay" onClick={() => setVtReqSlot(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()} style={{ maxWidth:380 }}>
            <div className="modal-header">
              <h3>🏋️ Vrij Trainen aanvragen</h3>
              <button className="btn-icon" onClick={() => setVtReqSlot(null)}><X size={18}/></button>
            </div>
            <div style={{ padding:'1rem', display:'flex', flexDirection:'column', gap:'0.75rem' }}>
              <div style={{ padding:'0.75rem', background:'var(--surface-2)', borderRadius:8, borderLeft:'3px solid #22c55e' }}>
                <p style={{ fontWeight:700, color:'#22c55e' }}>{vtReqSlot.date}</p>
                <p style={{ color:'var(--text-2)', fontSize:'1rem', fontWeight:600 }}>{vtReqSlot.start_time} – {vtReqSlot.end_time}</p>
                <p style={{ fontSize:'0.82rem', color:'var(--text-muted)', marginTop:4 }}>
                  {vtReqSlot.booking_count}/{vtReqSlot.max_bookings} plekken bezet
                </p>
              </div>

              <div style={{
                display:'flex', alignItems:'center', justifyContent:'center',
                padding:'0.5rem', borderRadius:8,
                background: vtWeekUsage >= vtWeekLimit ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
              }}>
                <span style={{ fontSize:'0.82rem', fontWeight:600,
                  color: vtWeekUsage >= vtWeekLimit ? 'var(--error)' : 'var(--success)' }}>
                  {vtWeekUsage}/{vtWeekLimit} sessies deze week gebruikt
                </span>
              </div>

              {vtWeekUsage >= vtWeekLimit ? (
                <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid var(--error)', borderRadius:8, padding:'0.75rem', fontSize:'0.85rem', color:'var(--error)' }}>
                  Je hebt je weeklimiet van {vtWeekLimit}x vrij trainen bereikt.
                </div>
              ) : (
                <>
                  <div>
                    <label className="input-label">Opmerking (optioneel)</label>
                    <input className="input" placeholder="Bijv. focusgebied…" value={vtReqNote} onChange={e => setVtReqNote(e.target.value)}/>
                  </div>
                  {vtError && <p style={{ color:'var(--error)', fontSize:'0.85rem' }}>{vtError}</p>}
                  <p style={{ fontSize:'0.82rem', color:'var(--text-muted)' }}>
                    De admin bevestigt je aanvraag zo snel mogelijk.
                  </p>
                  <button className="btn btn-primary" onClick={requestVt} disabled={vtSaving}
                    style={{ touchAction:'manipulation' }}>
                    {vtSaving ? 'Bezig…' : 'Aanvraag indienen'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Afspraak toevoegen (bottom sheet) ── */}
      {quickCreate && (
        <AddEventSheet
          date={quickCreate.date}
          dateTime={quickCreate.dateTime}
          members={members}
          onClose={() => setQuickCreate(null)}
          onCreated={() => { setQuickCreate(null); reload() }}
        />
      )}

      {loading && (
        <div style={{ position:'fixed', bottom:'5rem', left:'50%', transform:'translateX(-50%)', background:'var(--surface)', borderRadius:'var(--r)', padding:'0.5rem 1rem', fontSize:'0.85rem', color:'var(--text-muted)', zIndex:100 }}>
          Laden…
        </div>
      )}
    </div>
  )
}
