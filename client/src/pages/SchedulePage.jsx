import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, MapPin, User, Users, ChevronLeft, ChevronRight, X, AlertCircle } from 'lucide-react'
import api from '../api'
import PtBookingModal from '../components/PtBookingModal'

// ── Class badge helpers (cosmetic labelling only) ────────────────────────────
// These never decide WHAT is shown — every bookable class fetched from the
// backend is always displayed (see the "alle" filter below). They only
// prettify the tab grouping/badge for the categories this gym happens to use
// today; a brand new category an admin adds later still shows up fine (falls
// back to its raw name) and automatically gets its own filter tab.
const KNOWN_GROUPS = [
  { key: 'kickboksen',  label: '🥊 Kickboksen',  match: (c) => c.startsWith('kickboksen') },
  { key: 'boksen',      label: '🥊 Boksen',      match: (c) => c.startsWith('boksen') },
  { key: 'ladies-only', label: '🌸 Ladies-Only', match: (c) => c.includes('ladies-only') },
  { key: 'jeugd',       label: '🎯 Jeugd',       match: (c) => c === 'jeugd' || c.includes('jeugd') },
  { key: 'kids',        label: '⭐ Kids',        match: (c) => c.includes('kids') },
  { key: 'recreanten',  label: '💪 Recreanten',  match: (c) => c.includes('recreanten') },
]

function prettyCategory(cat) {
  if (!cat) return ''
  return cat.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

const BADGE_LABEL = {
  'kickboksen-kids':        'Kids',
  'kickboksen-recreanten':  'Recreanten',
  'kickboksen-ladies-only': 'Ladies-Only',
  'kickboksen-jeugd':       'Jeugd',
  'boksen-recreanten':      'Recreanten',
  'boksen-ladies-only':     'Ladies-Only',
  'jeugd':                  'Jeugd',
}
const getBadgeLabel = (cat) => BADGE_LABEL[cat] ?? prettyCategory(cat)

// ── Date helpers ───────────────────────────────────────────────────────────
function formatTime(str) {
  return new Date(str).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}
function formatFullDate(d) {
  return d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
}
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function getWeekStart(offset = 0) {
  const d = new Date()
  const dow = d.getDay()
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7) // Monday
  d.setHours(0, 0, 0, 0)
  return d
}

const TYPE_COLOR = { class: '#f5c200', pt: '#3b82f6', vt: '#22c55e' }

// ── Page ───────────────────────────────────────────────────────────────────
export default function SchedulePage() {
  const navigate = useNavigate()
  const [allClasses,  setAllClasses]  = useState([])  // full week, unfiltered
  const [myBookings,  setMyBookings]  = useState([])
  const [ptSlots,     setPtSlots]     = useState([])
  const [myPtBookings, setMyPtBookings] = useState([])
  const [ptBalance,   setPtBalance]   = useState(null)
  const [vtSlots,     setVtSlots]     = useState([])
  const [category,    setCategory]    = useState('alle')
  const [weekOffset,  setWeekOffset]  = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [flash,       setFlash]       = useState(null)
  const [ptModalSlot, setPtModalSlot] = useState(null)
  const [vtModalSlot, setVtModalSlot] = useState(null)
  const [vtNote,      setVtNote]      = useState('')
  const [vtSaving,    setVtSaving]    = useState(false)
  const [vtError,     setVtError]     = useState('')
  const [detailItem,  setDetailItem]  = useState(null) // { type, raw } — booked/class detail popup

  const weekStart = getWeekStart(weekOffset)
  const weekEnd   = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  weekEnd.setHours(23, 59, 59)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Alle bestaande, boekbare activiteitstypes uit de bestaande backend —
      // dezelfde data als de Agenda gebruikt — groepslessen, PT-slots en
      // Vrij Trainen-slots. Elk type gebruikt zijn eigen bestaande endpoint
      // en boekingslogica; hier alleen samengevoegd voor de weergave.
      const [classRes, bookingRes, ptSlotRes, ptBookingRes, vtRes] = await Promise.all([
        api.get('/classes', { params: { from: weekStart.toISOString(), to: weekEnd.toISOString() } }),
        api.get('/bookings'),
        api.get('/pt/slots', { params: { from: weekStart.toISOString(), to: weekEnd.toISOString() } }),
        api.get('/pt/bookings/mine'),
        api.get('/vt/slots', { params: { from: toDateStr(weekStart), to: toDateStr(weekEnd) } }),
      ])
      setAllClasses(classRes.data.classes)
      setMyBookings(bookingRes.data.bookings)
      setPtSlots(ptSlotRes.data.slots)
      setMyPtBookings(ptBookingRes.data.bookings)
      setVtSlots(vtRes.data.slots || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [weekOffset])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    api.get('/pt/balance').then((r) => setPtBalance(r.data)).catch(() => setPtBalance(null))
  }, [])

  const bookedClassIds = new Set(myBookings.filter((b) => b.status === 'confirmed').map((b) => b.class_id))
  const getClassBooking = (classId) => myBookings.find((b) => b.class_id === classId && b.status === 'confirmed')

  const bookedPtSlotIds = new Set(myPtBookings.filter((b) => b.status !== 'cancelled' && b.status !== 'declined').map((b) => b.slot_id))
  const getPtBooking = (slotId) => myPtBookings.find((b) => b.slot_id === slotId && b.status !== 'cancelled' && b.status !== 'declined')
  const hasPtBalance = ptBalance && (ptBalance.total_remaining > 0 || ptBalance.subscription?.status === 'active')

  // ── Naar één lijst, en alléén daadwerkelijk beschikbare/boekbare slots ─────
  // (in de toekomst, en niet vol tenzij het lid er zelf al in geboekt staat —
  // zo blijft een eigen boeking altijd zichtbaar om te kunnen annuleren).
  const now = new Date()

  const classItems = allClasses
    .map((c) => ({ type: 'class', id: c.id, date: new Date(c.date_time), raw: c }))
    .filter((it) => {
      if (it.date < now) return false
      const spotsLeft = it.raw.spots_left ?? (it.raw.max_capacity - it.raw.current_bookings)
      return spotsLeft > 0 || bookedClassIds.has(it.raw.id)
    })

  const ptItems = ptSlots
    .map((s) => ({ type: 'pt', id: s.id, date: new Date(s.date_time), raw: s }))
    .filter((it) => {
      if (it.date < now) return false
      return it.raw.status === 'available' || bookedPtSlotIds.has(it.raw.id)
    })

  const vtItems = vtSlots
    .map((s) => ({ type: 'vt', id: s.id, date: new Date(`${s.date}T${s.start_time}`), raw: s }))
    .filter((it) => {
      if (it.date < now) return false
      const isFull = Number(it.raw.booking_count) >= Number(it.raw.max_bookings)
      return !isFull || it.raw.my_booking_id
    })

  // ── Dynamische categorie-tabs (op basis van wat daadwerkelijk zichtbaar is) ─
  const presentCats = [...new Set(classItems.map((it) => it.raw.category).filter(Boolean))]
  const presentGroups = KNOWN_GROUPS.filter((g) => presentCats.some((c) => g.match(c)))
  const leftoverCats = presentCats.filter((c) => !KNOWN_GROUPS.some((g) => g.match(c)))
  const classTabs = [
    ...presentGroups.map((g) => ({ key: g.key, label: g.label, match: g.match })),
    ...leftoverCats.map((c) => ({ key: c, label: getBadgeLabel(c), match: (x) => x === c })),
  ]
  const TABS = [
    { key: 'alle', label: 'Alle activiteiten' },
    ...classTabs,
    { key: 'pt', label: '🥊 Personal Training' },
    { key: 'vt', label: '🏋️ Vrij Trainen' },
  ]

  let items
  if (category === 'alle') items = [...classItems, ...ptItems, ...vtItems]
  else if (category === 'pt') items = ptItems
  else if (category === 'vt') items = vtItems
  else {
    const tab = classTabs.find((t) => t.key === category)
    items = tab ? classItems.filter((it) => tab.match(it.raw.category)) : classItems
  }

  const showFlash = (msg, type = 'success') => {
    setFlash({ msg, type })
    setTimeout(() => setFlash(null), 3500)
  }

  // ── Groepsles boeken/annuleren ───────────────────────────────────────────
  const handleBookClass = async (classId) => {
    try {
      await api.post('/bookings', { class_id: classId })
      showFlash('Les gereserveerd! ✓')
      load()
    } catch (e) {
      showFlash(e.response?.data?.error || 'Reserveren mislukt.', 'error')
    }
  }
  const handleCancelClass = async (booking) => {
    try {
      await api.delete(`/bookings/${booking.id}`)
      showFlash('Reservering geannuleerd.')
      load()
    } catch (e) {
      showFlash(e.response?.data?.error || 'Annuleren mislukt.', 'error')
    }
  }

  // ── PT annuleren (boeken gaat via PtBookingModal) ────────────────────────
  const handleCancelPt = async (bookingId) => {
    if (!confirm('Boeking annuleren? Bij annulering >24h voor de sessie krijg je de les terug.')) return
    try {
      await api.put(`/pt/bookings/${bookingId}/cancel`)
      showFlash('PT-boeking geannuleerd.')
      load()
    } catch (e) {
      showFlash(e.response?.data?.error || 'Annuleren mislukt.', 'error')
    }
  }

  // ── Vrij Trainen aanvragen/annuleren ─────────────────────────────────────
  const submitVtRequest = async () => {
    if (!vtModalSlot) return
    setVtSaving(true); setVtError('')
    try {
      await api.post(`/vt/slots/${vtModalSlot.id}/book`, { notes: vtNote })
      setVtModalSlot(null); setVtNote('')
      showFlash('Aanvraag ingediend! Wacht op bevestiging van de admin.')
      load()
    } catch (e) {
      setVtError(e.response?.data?.error || 'Aanvragen mislukt.')
    } finally {
      setVtSaving(false)
    }
  }
  const handleCancelVt = async (bookingId) => {
    if (!confirm('Aanvraag/boeking annuleren?')) return
    try {
      await api.delete(`/vt/bookings/${bookingId}`)
      showFlash('Vrij Trainen geannuleerd.')
      load()
    } catch (e) {
      showFlash(e.response?.data?.error || 'Annuleren mislukt.', 'error')
    }
  }

  // ── Klik op een tijdslot → bestaande boekingsflow openen ─────────────────
  const openItem = (item) => {
    if (item.type === 'class') {
      setDetailItem(item)
    } else if (item.type === 'pt') {
      if (bookedPtSlotIds.has(item.raw.id)) setDetailItem(item)
      else if (!hasPtBalance) navigate('/personal-training')
      else setPtModalSlot(item.raw)
    } else {
      if (item.raw.my_booking_id) setDetailItem(item)
      else { setVtModalSlot(item.raw); setVtNote(''); setVtError('') }
    }
  }

  // Group by day (lege dagen vallen vanzelf weg, want alleen zichtbare items)
  const byDay = items.reduce((acc, item) => {
    const day = item.date.toDateString()
    if (!acc[day]) acc[day] = []
    acc[day].push(item)
    return acc
  }, {})

  const weekLabel = `${weekStart.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}`

  return (
    <div className="page">
      {/* Flash */}
      {flash && (
        <div className={`alert alert-${flash.type}`} style={{ marginBottom: '1rem', position: 'sticky', top: '72px', zIndex: 50 }}>
          {flash.msg}
        </div>
      )}

      <div className="page-header">
        <h1>Les boeken</h1>
        <p>Reserveer groepslessen, Personal Training en Vrij Trainen</p>
      </div>

      {/* Week navigator — altijd zichtbaar, ook als de huidige week leeg is */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r)', padding: '0.25rem',
        }}>
          <button className="btn-icon" onClick={() => setWeekOffset((o) => o - 1)} style={{ width: 36, height: 36 }}>
            <ChevronLeft size={18} />
          </button>
          <span style={{
            fontSize: '0.85rem', fontWeight: 600, padding: '0 0.5rem',
            color: 'var(--text-2)', minWidth: 170, textAlign: 'center',
          }}>
            {weekLabel}
          </span>
          <button className="btn-icon" onClick={() => setWeekOffset((o) => o + 1)} style={{ width: 36, height: 36, color: 'var(--text-muted)' }}>
            <ChevronRight size={18} />
          </button>
        </div>
        {weekOffset !== 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(0)}>Huidige week</button>
        )}
      </div>

      {/* Category filter tabs */}
      <div className="filter-bar" style={{ marginBottom: '1.75rem' }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`filter-btn${category === tab.key ? ' active' : ''}`}
            onClick={() => setCategory(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tijdslots per dag */}
      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : Object.keys(byDay).length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📅</div>
          <h3>Geen beschikbare activiteiten</h3>
          <p>Er is niets te boeken in {weekLabel}. Blader naar een andere week hierboven, of kies een andere categorie.</p>
        </div>
      ) : (
        Object.entries(byDay)
          .sort(([a], [b]) => new Date(a) - new Date(b))
          .map(([day, dayItems]) => (
            <div key={day} style={{ marginBottom: '1.75rem' }}>
              <h3 style={{ marginBottom: '0.75rem', color: 'var(--text-2)', textTransform: 'capitalize', fontSize: '1rem' }}>
                {formatFullDate(new Date(day))}
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                {dayItems
                  .sort((a, b) => a.date - b.date)
                  .map((item) => <TimeSlotChip key={`${item.type}-${item.id}`} item={item} onOpen={openItem}
                    bookedClassIds={bookedClassIds} bookedPtSlotIds={bookedPtSlotIds} getPtBooking={getPtBooking} hasPtBalance={hasPtBalance} />)}
              </div>
            </div>
          ))
      )}

      {/* ── Detailpopup: groepsles-info, of status van een eigen PT/VT-boeking ── */}
      {detailItem && (
        <DetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          bookedClassIds={bookedClassIds}
          getClassBooking={getClassBooking}
          getPtBooking={getPtBooking}
          onBookClass={(id) => { setDetailItem(null); handleBookClass(id) }}
          onCancelClass={(b) => { setDetailItem(null); handleCancelClass(b) }}
          onCancelPt={(id) => { setDetailItem(null); handleCancelPt(id) }}
          onCancelVt={(id) => { setDetailItem(null); handleCancelVt(id) }}
        />
      )}

      {ptModalSlot && (
        <PtBookingModal
          slot={ptModalSlot}
          balance={ptBalance}
          onClose={() => setPtModalSlot(null)}
          onBooked={() => { setPtModalSlot(null); load(); showFlash('PT-sessie geboekt! Wacht op bevestiging van de trainer. 💪') }}
        />
      )}
      {vtModalSlot && (
        <div className="modal-overlay" onClick={() => setVtModalSlot(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <h3>🏋️ Vrij Trainen aanvragen</h3>
              <button className="btn-icon" onClick={() => setVtModalSlot(null)}><X size={18} /></button>
            </div>
            <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ padding: '0.75rem', background: 'var(--surface-2)', borderRadius: 8, borderLeft: '3px solid #22c55e' }}>
                <p style={{ fontWeight: 700, color: '#22c55e' }}>{vtModalSlot.date}</p>
                <p style={{ color: 'var(--text-2)', fontSize: '1rem', fontWeight: 600 }}>{vtModalSlot.start_time} – {vtModalSlot.end_time}</p>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  {vtModalSlot.booking_count}/{vtModalSlot.max_bookings} plekken bezet
                </p>
              </div>
              <div>
                <label className="input-label">Opmerking (optioneel)</label>
                <input className="input" placeholder="Bijv. focusgebied…" value={vtNote} onChange={(e) => setVtNote(e.target.value)} />
              </div>
              {vtError && <p style={{ color: 'var(--error)', fontSize: '0.85rem' }}><AlertCircle size={14} style={{ display: 'inline', marginRight: 4 }} />{vtError}</p>}
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>De admin bevestigt je aanvraag zo snel mogelijk.</p>
              <button className="btn btn-primary" onClick={submitVtRequest} disabled={vtSaving} style={{ touchAction: 'manipulation' }}>
                {vtSaving ? 'Bezig…' : 'Aanvraag indienen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Compacte, aantikbare tijdslot-chip ───────────────────────────────────────
function TimeSlotChip({ item, onOpen, bookedClassIds, bookedPtSlotIds, getPtBooking, hasPtBalance }) {
  const raw = item.raw
  let time, name, sub, booked

  if (item.type === 'class') {
    time = formatTime(raw.date_time)
    name = raw.name
    booked = bookedClassIds.has(raw.id)
    const spotsLeft = raw.spots_left ?? (raw.max_capacity - raw.current_bookings)
    sub = booked ? '✓ Geboekt' : `${spotsLeft} plek${spotsLeft !== 1 ? 'ken' : ''}`
  } else if (item.type === 'pt') {
    time = formatTime(raw.date_time)
    name = 'PT'
    booked = bookedPtSlotIds.has(raw.id)
    const b = getPtBooking(raw.id)
    sub = booked ? (b?.status === 'confirmed' ? '✓ Bevestigd' : '⏳ Aangevraagd') : (hasPtBalance ? raw.trainer : 'Koop pakket')
  } else {
    time = raw.start_time
    name = 'Vrij Trainen'
    booked = !!raw.my_booking_id
    const spotsLeft = raw.max_bookings - raw.booking_count
    sub = booked ? (raw.my_status === 'confirmed' ? '✓ Bevestigd' : '⏳ Aangevraagd') : `${spotsLeft} plek${spotsLeft !== 1 ? 'ken' : ''}`
  }

  const color = TYPE_COLOR[item.type]

  return (
    <button
      onClick={() => onOpen(item)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
        minWidth: 104, minHeight: 44, padding: '0.55rem 0.85rem', borderRadius: 12,
        border: `1.5px solid ${booked ? 'rgba(34,197,94,0.55)' : color}`,
        background: booked ? 'rgba(34,197,94,0.12)' : `${color}17`,
        cursor: 'pointer', textAlign: 'left', touchAction: 'manipulation',
      }}
    >
      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text)' }}>{time}</span>
      <span style={{ fontSize: '0.78rem', fontWeight: 700, color }}>{name}</span>
      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{sub}</span>
    </button>
  )
}

// ── Generieke detailpopup: groepsles-info + boeken/annuleren, of status van
// een eigen PT/VT-boeking met annuleeroptie. Opent altijd de bestaande
// boekingsflow van het betreffende type — er wordt niets nieuws geboekt. ────
function DetailModal({ item, onClose, bookedClassIds, getClassBooking, getPtBooking, onBookClass, onCancelClass, onCancelPt, onCancelVt }) {
  const raw = item.raw
  const color = TYPE_COLOR[item.type]

  let title, body
  if (item.type === 'class') {
    const isBooked  = bookedClassIds.has(raw.id)
    const booking   = getClassBooking(raw.id)
    const spotsLeft = raw.spots_left ?? (raw.max_capacity - raw.current_bookings)
    const isFull    = spotsLeft <= 0
    title = raw.name
    body = (
      <>
        <p><Clock size={14} style={{ display: 'inline', marginRight: 6 }} />{formatFullDate(item.date)} · {formatTime(raw.date_time)} · {raw.duration_minutes} min</p>
        <p><User size={14} style={{ display: 'inline', marginRight: 6 }} />{raw.instructor}</p>
        {raw.location && <p><MapPin size={14} style={{ display: 'inline', marginRight: 6 }} />{raw.location}</p>}
        <p><Users size={14} style={{ display: 'inline', marginRight: 6 }} />{isFull ? 'Vol' : `${spotsLeft} plek${spotsLeft !== 1 ? 'ken' : ''} vrij`}</p>
        {isBooked ? (
          <button className="btn btn-danger btn-full" onClick={() => onCancelClass(booking)}>Reservering annuleren</button>
        ) : (
          <button className="btn btn-primary btn-full" disabled={isFull} onClick={() => onBookClass(raw.id)}>{isFull ? 'Vol' : 'Reserveer'}</button>
        )}
      </>
    )
  } else if (item.type === 'pt') {
    const myBooking = getPtBooking(raw.id)
    title = 'Personal Training'
    body = (
      <>
        <p><Clock size={14} style={{ display: 'inline', marginRight: 6 }} />{formatFullDate(item.date)} · {formatTime(raw.date_time)} · {raw.duration_minutes || 60} min</p>
        <p><User size={14} style={{ display: 'inline', marginRight: 6 }} />{raw.trainer}</p>
        <p style={{ color: myBooking?.status === 'confirmed' ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
          {myBooking?.status === 'confirmed' ? '✓ Bevestigd' : '⏳ Wacht op bevestiging van de trainer'}
        </p>
        {myBooking && <button className="btn btn-danger btn-full" onClick={() => onCancelPt(myBooking.id)}>Boeking annuleren</button>}
      </>
    )
  } else {
    title = 'Vrij Trainen'
    body = (
      <>
        <p><Clock size={14} style={{ display: 'inline', marginRight: 6 }} />{formatFullDate(item.date)} · {raw.start_time} – {raw.end_time}</p>
        <p><Users size={14} style={{ display: 'inline', marginRight: 6 }} />{raw.booking_count}/{raw.max_bookings} plekken bezet</p>
        <p style={{ color: raw.my_status === 'confirmed' ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
          {raw.my_status === 'confirmed' ? '✓ Bevestigd' : '⏳ Wacht op bevestiging'}
        </p>
        <button className="btn btn-danger btn-full" onClick={() => onCancelVt(raw.my_booking_id)}>
          {raw.my_status === 'requested' ? 'Aanvraag intrekken' : 'Annuleren'}
        </button>
      </>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: color }} />
            {title}
          </h3>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {body}
        </div>
      </div>
    </div>
  )
}
