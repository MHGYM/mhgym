import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, CreditCard, TrendingUp, Clock, MapPin, User, ArrowRight, Dumbbell, Ticket } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api'

function formatDate(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })
}
function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

export default function DashboardPage() {
  const { user, membership, refreshUser } = useAuth()
  const [bookings,    setBookings]    = useState([])
  const [rittenkaart, setRittenkaart] = useState(null)
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [meData, bookingsRes] = await Promise.all([
          refreshUser(),
          api.get('/bookings'),
        ])
        setBookings(bookingsRes.data.bookings)
        setRittenkaart(meData?.rittenkaart || null)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Upcoming confirmed bookings (in the future)
  const now = new Date()
  const upcoming = bookings
    .filter((b) => b.status === 'confirmed' && new Date(b.date_time) > now)
    .sort((a, b) => new Date(a.date_time) - new Date(b.date_time))
    .slice(0, 5)

  // Bookings used this month
  const firstOfMonth = new Date(); firstOfMonth.setDate(1); firstOfMonth.setHours(0,0,0,0)
  const usedThisMonth = bookings.filter(
    (b) => b.status === 'confirmed' && new Date(b.booked_at) >= firstOfMonth
  ).length

  const maxBookings = membership?.max_bookings_per_month ?? null
  const fillPct = maxBookings > 0 ? Math.min((usedThisMonth / maxBookings) * 100, 100) : 0

  if (loading) {
    return (
      <div className="page loading-center">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="page">
      {/* Welcome banner */}
      <div className="dashboard-welcome">
        <div>
          <h1 className="welcome-title">
            Welkom terug, <span>{user?.first_name}</span>! 💪
          </h1>
          <p className="welcome-sub">
            {new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <Link to="/schedule" className="btn btn-primary btn-lg">
          <Calendar size={18} />
          Les boeken
        </Link>
      </div>

      {/* Rittenkaart info balk */}
      {rittenkaart && (
        <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', padding:'0.6rem 0.9rem', background:'var(--surface-2)', borderRadius:'var(--r)', marginBottom:'1rem', fontSize:'0.875rem', borderLeft: Number(rittenkaart.ritten_resterend) <= 2 ? '3px solid #f5c200' : '3px solid var(--success)' }}>
          <Ticket size={15} style={{ color: Number(rittenkaart.ritten_resterend) <= 2 ? '#f5c200' : 'var(--success)', flexShrink:0 }}/>
          <span>
            <strong>Rittenkaart:</strong> {rittenkaart.ritten_resterend} van {rittenkaart.ritten_totaal} ritten resterend
            {rittenkaart.vervaldatum && ` · geldig t/m ${new Date(rittenkaart.vervaldatum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}`}
            {Number(rittenkaart.ritten_resterend) <= 2 && <span style={{ color:'#f5c200', marginLeft:6 }}>⚠ Bijna op</span>}
          </span>
        </div>
      )}

      {/* No membership banner */}
      {!membership && !rittenkaart && (
        <div className="no-membership-banner">
          <div>
            <h3>Nog geen actief lidmaatschap</h3>
            <p>Kies een abonnement en begin vandaag met sporten.</p>
          </div>
          <Link to="/memberships" className="btn btn-primary">
            Abonnement kiezen <ArrowRight size={16} />
          </Link>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {/* Membership card */}
        <div className="stat-card">
          <CreditCard size={20} className="stat-icon" />
          <span className="stat-label">Lidmaatschap</span>
          <span className="stat-value" style={{ fontSize: '1.4rem' }}>
            {membership ? membership.membership_name || membership.name : '–'}
          </span>
          <span className="stat-sub">
            {membership
              ? `€${Number(membership.price_monthly).toFixed(2)} / maand`
              : 'Geen actief abonnement'}
          </span>
        </div>

        {/* Bookings this month */}
        <div className="stat-card">
          <TrendingUp size={20} className="stat-icon" />
          <span className="stat-label">Lessen deze maand</span>
          <span className="stat-value">
            {usedThisMonth}
            {maxBookings > 0 && <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 500 }}>/{maxBookings}</span>}
            {maxBookings === -1 && <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}> ∞</span>}
          </span>
          {maxBookings > 0 && (
            <div className="progress-wrap" style={{ marginTop: '0.25rem' }}>
              <div className="progress-bar">
                <div
                  className={`progress-fill ${fillPct >= 100 ? 'full' : fillPct >= 75 ? 'warn' : ''}`}
                  style={{ width: `${fillPct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Upcoming */}
        <div className="stat-card">
          <Clock size={20} className="stat-icon" />
          <span className="stat-label">Komende lessen</span>
          <span className="stat-value">{upcoming.length}</span>
          <span className="stat-sub">
            {upcoming[0]
              ? `Volgende: ${formatDate(upcoming[0].date_time)}`
              : 'Niets gepland'}
          </span>
        </div>
      </div>

      {/* Upcoming bookings */}
      <div>
        <div className="section-header">
          <h2>Komende reserveringen</h2>
          <Link to="/schedule" className="btn btn-ghost btn-sm">
            Alle lessen <ArrowRight size={14} />
          </Link>
        </div>

        {upcoming.length === 0 ? (
          <div className="empty-state" style={{ padding: '2.5rem' }}>
            <div className="empty-state-icon"><Dumbbell size={36} /></div>
            <h3>Geen komende lessen</h3>
            <p style={{ marginBottom: '1.25rem' }}>Reserveer een les en begin met trainen!</p>
            <Link to="/schedule" className="btn btn-primary">
              <Calendar size={16} /> Rooster bekijken
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {upcoming.map((b) => (
              <div key={b.id} className="booking-item">
                <div className="booking-time">
                  <div>{formatDate(b.date_time).split(' ')[0]}</div>
                  <div style={{ fontSize: '1rem', fontWeight: 800 }}>{formatTime(b.date_time)}</div>
                </div>
                <div className="booking-info">
                  <h4>{b.class_name}</h4>
                  <p>
                    <User size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
                    {b.instructor}
                    &nbsp;·&nbsp;
                    <MapPin size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
                    {b.location}
                    &nbsp;·&nbsp;
                    {b.duration_minutes} min
                  </p>
                </div>
                <span className="badge badge-success">Bevestigd</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
