import { useState, useEffect, useCallback } from 'react'
import { Clock, MapPin, User, Users, ChevronLeft, ChevronRight } from 'lucide-react'
import api from '../api'

const CATEGORIES = ['alle', 'kickboksen', 'boksen', 'ladies-only', 'jeugd', 'kids', 'recreanten']

const CATEGORY_LABEL = {
  'alle':        'Alle lessen',
  'kickboksen':  '🥊 Kickboksen',
  'boksen':      '🥊 Boksen',
  'ladies-only': '🌸 Ladies-Only',
  'jeugd':       '🎯 Jeugd',
  'kids':        '⭐ Kids',
  'recreanten':  '💪 Recreanten',
}

function formatDate(str) {
  return new Date(str).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
}
function formatTime(str) {
  return new Date(str).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}
function getWeekStart(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay() + 1 + offset * 7) // Monday
  d.setHours(0, 0, 0, 0)
  return d
}

export default function SchedulePage() {
  const [classes, setClasses] = useState([])
  const [myBookings, setMyBookings] = useState([])
  const [category, setCategory] = useState('alle')
  const [weekOffset, setWeekOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [bookingId, setBookingId] = useState(null) // class id being booked/cancelling
  const [flash, setFlash] = useState(null)

  const weekStart = getWeekStart(weekOffset)
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6); weekEnd.setHours(23,59,59)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { from: weekStart.toISOString(), to: weekEnd.toISOString() }
      if (category !== 'alle') params.category = category

      const [classRes, bookingRes] = await Promise.all([
        api.get('/classes', { params }),
        api.get('/bookings'),
      ])
      setClasses(classRes.data.classes)
      setMyBookings(bookingRes.data.bookings)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [category, weekOffset])

  useEffect(() => { load() }, [load])

  const bookedClassIds = new Set(
    myBookings.filter((b) => b.status === 'confirmed').map((b) => b.class_id)
  )
  const getBooking = (classId) => myBookings.find((b) => b.class_id === classId && b.status === 'confirmed')

  const showFlash = (msg, type = 'success') => {
    setFlash({ msg, type })
    setTimeout(() => setFlash(null), 3500)
  }

  const handleBook = async (classId) => {
    setBookingId(classId)
    try {
      await api.post('/bookings', { class_id: classId })
      showFlash('Les gereserveerd! ✓')
      load()
    } catch (e) {
      showFlash(e.response?.data?.error || 'Reserveren mislukt.', 'error')
    } finally {
      setBookingId(null)
    }
  }

  const handleCancel = async (booking) => {
    setBookingId(booking.class_id)
    try {
      await api.delete(`/bookings/${booking.id}`)
      showFlash('Reservering geannuleerd.')
      load()
    } catch (e) {
      showFlash(e.response?.data?.error || 'Annuleren mislukt.', 'error')
    } finally {
      setBookingId(null)
    }
  }

  // Group by day
  const byDay = classes.reduce((acc, cls) => {
    const day = new Date(cls.date_time).toDateString()
    if (!acc[day]) acc[day] = []
    acc[day].push(cls)
    return acc
  }, {})

  const weekLabel = `${weekStart.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}`

  return (
    <div className="page">
      {/* Flash message */}
      {flash && (
        <div className={`alert alert-${flash.type}`} style={{ marginBottom: '1rem', position: 'sticky', top: '72px', zIndex: 50 }}>
          {flash.msg}
        </div>
      )}

      <div className="page-header">
        <h1>Lesrooster</h1>
        <p>Reserveer je lessen voor de komende week</p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {/* Week navigator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '0.25rem' }}>
          <button className="btn-icon" onClick={() => setWeekOffset((o) => o - 1)} style={{ width: 28, height: 28 }}>
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, padding: '0 0.5rem', color: 'var(--text-2)', minWidth: 180, textAlign: 'center' }}>
            {weekLabel}
          </span>
          <button className="btn-icon" onClick={() => setWeekOffset((o) => o + 1)} style={{ width: 28, height: 28, color: 'var(--text-muted)' }}>
            <ChevronRight size={16} />
          </button>
        </div>

        {weekOffset !== 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(0)}>Huidige week</button>
        )}
      </div>

      {/* Category filters */}
      <div className="filter-bar">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`filter-btn${category === cat ? ' active' : ''}`}
            onClick={() => setCategory(cat)}
          >
            {CATEGORY_LABEL[cat] || cat}
          </button>
        ))}
      </div>

      {/* Classes */}
      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : Object.keys(byDay).length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📅</div>
          <h3>Geen lessen gevonden</h3>
          <p>Probeer een andere week of categorie.</p>
        </div>
      ) : (
        Object.entries(byDay).map(([day, dayCls]) => (
          <div key={day} style={{ marginBottom: '2rem' }}>
            <h3 style={{ marginBottom: '1rem', color: 'var(--text-2)', textTransform: 'capitalize' }}>
              {new Date(day).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>
            <div className="classes-grid">
              {dayCls.map((cls) => {
                const isBooked = bookedClassIds.has(cls.id)
                const booking  = getBooking(cls.id)
                const spotsLeft = cls.spots_left ?? (cls.max_capacity - cls.current_bookings)
                const isFull   = spotsLeft <= 0
                const isLow    = spotsLeft > 0 && spotsLeft <= 3
                const inProgress = bookingId === cls.id
                const isPast   = new Date(cls.date_time) < new Date()

                return (
                  <div key={cls.id} className="class-card" style={isBooked ? { borderColor: 'rgba(34,197,94,0.3)' } : {}}>
                    <div className="class-card-header">
                      <span className={`badge badge-${cls.category}`}>{cls.category}</span>
                      <span className={`class-spots ${isFull ? 'full' : isLow ? 'low' : ''}`}>
                        <Users size={12} style={{ display: 'inline', marginRight: 3 }} />
                        {isFull ? 'Vol' : `${spotsLeft} plekken`}
                      </span>
                    </div>

                    <div>
                      <div className="class-name">{cls.name}</div>
                    </div>

                    <div className="class-meta">
                      <div className="class-meta-row">
                        <User size={13} /> {cls.instructor}
                      </div>
                      <div className="class-meta-row">
                        <Clock size={13} />
                        {formatTime(cls.date_time)} &nbsp;·&nbsp; {cls.duration_minutes} min
                      </div>
                      <div className="class-meta-row">
                        <MapPin size={13} /> {cls.location}
                      </div>
                    </div>

                    {/* Capacity bar */}
                    <div className="progress-bar">
                      <div
                        className={`progress-fill ${isFull ? 'full' : isLow ? 'warn' : ''}`}
                        style={{ width: `${Math.min((cls.current_bookings / cls.max_capacity) * 100, 100)}%` }}
                      />
                    </div>

                    <div className="class-card-footer">
                      {isPast ? (
                        <button className="btn btn-ghost btn-full" disabled>Verlopen</button>
                      ) : isBooked ? (
                        <button
                          className="btn btn-success btn-full"
                          onClick={() => handleCancel(booking)}
                          disabled={inProgress}
                          style={{ justifyContent: 'space-between' }}
                        >
                          <span>{inProgress ? <span className="spinner spinner-sm" /> : '✓ Gereserveerd'}</span>
                          <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>Annuleer</span>
                        </button>
                      ) : (
                        <button
                          className={`btn ${isFull ? 'btn-ghost' : 'btn-primary'} btn-full`}
                          onClick={() => !isFull && handleBook(cls.id)}
                          disabled={isFull || inProgress}
                        >
                          {inProgress ? <span className="spinner spinner-sm" /> : isFull ? 'Vol' : 'Reserveer'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
