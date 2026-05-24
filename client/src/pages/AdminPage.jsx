import { useState, useEffect } from 'react'
import {
  Users, Calendar, CreditCard, BarChart2, Package, ShoppingBag,
  Plus, Edit2, Trash2, X, Check, AlertCircle, RefreshCw, Crown, Zap,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api'

// ── Helper ──────────────────────────────────────────────────────────────────
function fmt(d) {
  if (!d) return '–'
  return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtMoney(n) {
  return `€${Number(n || 0).toFixed(2).replace('.', ',')}`
}
function fmtDateTime(d) {
  if (!d) return '–'
  return new Date(d).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// ── Stats section ─────────────────────────────────────────────────────────
function StatsSection({ stats }) {
  if (!stats) return <div className="loading-center" style={{ minHeight: 200 }}><div className="spinner" /></div>

  const cards = [
    { label: 'Leden', value: stats.member_count, icon: '👥', color: 'var(--accent)' },
    { label: 'Actieve abonnementen', value: stats.active_members, icon: '✅', color: 'var(--success)' },
    { label: 'Omzet deze maand', value: fmtMoney(stats.month_revenue), icon: '💰', color: 'var(--accent)' },
    { label: 'Totale omzet', value: fmtMoney(stats.total_revenue), icon: '📈', color: 'var(--success)' },
    { label: 'Aankomende lessen', value: stats.class_count, icon: '🥊', color: 'var(--info)' },
    { label: 'Actieve boekingen', value: stats.booking_count, icon: '📅', color: 'var(--warning)' },
    { label: 'Bestellingen', value: stats.order_count, icon: '📦', color: 'var(--info)' },
    { label: 'Producten', value: stats.product_count, icon: '🛍️', color: 'var(--accent)' },
  ]

  return (
    <div>
      <div className="admin-stats-grid">
        {cards.map(({ label, value, icon, color }) => (
          <div key={label} className="stat-card">
            <div style={{ fontSize: '1.5rem' }}>{icon}</div>
            <div className="stat-value" style={{ color }}>{value}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Members section ────────────────────────────────────────────────────────
function MembersSection() {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')

  useEffect(() => {
    api.get('/admin/members').then((r) => { setMembers(r.data.members); setLoading(false) })
  }, [])

  const filtered = members.filter((m) =>
    `${m.first_name} ${m.last_name} ${m.email}`.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', alignItems: 'center' }}>
        <input
          className="form-input" placeholder="Zoek op naam of e-mail..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 300 }}
        />
        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{filtered.length} leden</span>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Naam</th>
              <th>E-mail</th>
              <th>Lid sinds</th>
              <th>Abonnement</th>
              <th>Status</th>
              <th>Boekingen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{m.first_name} {m.last_name}</div>
                  {m.role === 'admin' && <span className="badge badge-warning" style={{ marginTop: 3 }}>Admin</span>}
                </td>
                <td style={{ color: 'var(--text-muted)' }}>{m.email}</td>
                <td style={{ color: 'var(--text-muted)' }}>{fmt(m.created_at)}</td>
                <td>
                  {m.membership_name
                    ? <span>{m.membership_category} – {m.membership_name}</span>
                    : <span style={{ color: 'var(--text-muted)' }}>Geen</span>
                  }
                </td>
                <td>
                  {m.membership_status === 'active'
                    ? <span className="badge badge-success">Actief</span>
                    : <span className="badge badge-muted">Inactief</span>
                  }
                </td>
                <td>{m.total_bookings ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Geen leden gevonden</div>
        )}
      </div>
    </div>
  )
}

// ── Classes section ────────────────────────────────────────────────────────
function ClassesSection() {
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem]   = useState(null)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [search, setSearch]       = useState('')

  const [form, setForm] = useState({
    name: '', instructor: '', category: 'kickboksen',
    date_time: '', duration_minutes: 60, max_capacity: 20, location: 'Zaal A',
  })

  const load = () => api.get('/admin/classes').then((r) => { setClasses(r.data.classes); setLoading(false) })
  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditItem(null)
    setForm({ name: '', instructor: '', category: 'kickboksen', date_time: '', duration_minutes: 60, max_capacity: 20, location: 'Zaal A' })
    setShowModal(true)
  }

  const openEdit = (cls) => {
    setEditItem(cls)
    setForm({
      name: cls.name, instructor: cls.instructor, category: cls.category,
      date_time: cls.date_time?.slice(0, 16), duration_minutes: cls.duration_minutes,
      max_capacity: cls.max_capacity, location: cls.location,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      if (editItem) await api.put(`/admin/classes/${editItem.id}`, form)
      else          await api.post('/admin/classes', form)
      setShowModal(false); load()
    } catch (e) {
      setError(e.response?.data?.error || 'Opslaan mislukt.')
    } finally { setSaving(false) }
  }

  const handleCancel = async (id) => {
    if (!confirm('Les annuleren?')) return
    await api.delete(`/admin/classes/${id}`)
    load()
  }

  const filtered = classes.filter((c) =>
    `${c.name} ${c.instructor} ${c.category}`.toLowerCase().includes(search.toLowerCase())
  )
  const upcoming = filtered.filter((c) => new Date(c.date_time) >= new Date() && c.status === 'scheduled')
  const past     = filtered.filter((c) => new Date(c.date_time) < new Date()  || c.status !== 'scheduled')

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <div>
      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>{editItem ? 'Les bewerken' : 'Nieuwe les'}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            {error && <div className="alert alert-error"><AlertCircle size={14} />{error}</div>}
            <div className="auth-form">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Naam</label>
                  <input className="form-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Instructeur</label>
                  <input className="form-input" value={form.instructor} onChange={(e) => setForm((f) => ({ ...f, instructor: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Categorie</label>
                  <select className="form-input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                    {['kickboksen','boksen','ladies-only','jeugd','kids','recreanten'].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Locatie</label>
                  <select className="form-input" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}>
                    {['Zaal A','Zaal B','Zaal C'].map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Datum & tijd</label>
                  <input type="datetime-local" className="form-input" value={form.date_time} onChange={(e) => setForm((f) => ({ ...f, date_time: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Duur (min)</label>
                  <input type="number" className="form-input" value={form.duration_minutes} onChange={(e) => setForm((f) => ({ ...f, duration_minutes: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Max. deelnemers</label>
                <input type="number" className="form-input" value={form.max_capacity} onChange={(e) => setForm((f) => ({ ...f, max_capacity: Number(e.target.value) }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Annuleer</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <span className="spinner spinner-sm" /> : <><Check size={15} /> Opslaan</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="form-input" placeholder="Zoek les..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 260 }} />
        <button className="btn btn-primary btn-sm" onClick={openCreate}><Plus size={14} /> Nieuwe les</button>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{upcoming.length} aankomend</span>
      </div>

      <h3 style={{ marginBottom: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Aankomende lessen</h3>
      <div className="admin-table-wrap" style={{ marginBottom: '2rem' }}>
        <table className="admin-table">
          <thead><tr><th>Les</th><th>Instructeur</th><th>Datum & tijd</th><th>Bezetting</th><th>Acties</th></tr></thead>
          <tbody>
            {upcoming.slice(0, 50).map((cls) => (
              <tr key={cls.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{cls.name}</div>
                  <span className={`badge badge-${cls.category}`}>{cls.category}</span>
                </td>
                <td style={{ color: 'var(--text-muted)' }}>{cls.instructor}</td>
                <td>{fmtDateTime(cls.date_time)}</td>
                <td>
                  <span style={{ color: cls.current_bookings >= cls.max_capacity ? 'var(--error)' : 'var(--text-2)' }}>
                    {cls.current_bookings}/{cls.max_capacity}
                  </span>
                </td>
                <td className="td-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(cls)}><Edit2 size={13} /></button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleCancel(cls.id)}><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {upcoming.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Geen aankomende lessen</div>}
      </div>
    </div>
  )
}

// ── Bookings section ───────────────────────────────────────────────────────
function BookingsSection() {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    api.get('/admin/bookings').then((r) => { setBookings(r.data.bookings); setLoading(false) })
  }, [])

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr><th>Lid</th><th>Les</th><th>Datum les</th><th>Geboekt op</th><th>Status</th></tr></thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id}>
              <td>
                <div style={{ fontWeight: 600 }}>{b.first_name} {b.last_name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{b.email}</div>
              </td>
              <td>
                <div>{b.class_name}</div>
                <span className={`badge badge-${b.category}`}>{b.category}</span>
              </td>
              <td style={{ color: 'var(--text-muted)' }}>{fmtDateTime(b.date_time)}</td>
              <td style={{ color: 'var(--text-muted)' }}>{fmt(b.booked_at)}</td>
              <td>
                <span className={`badge ${b.status === 'confirmed' ? 'badge-success' : 'badge-muted'}`}>
                  {b.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {bookings.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Geen boekingen</div>}
    </div>
  )
}

// ── Payments section ───────────────────────────────────────────────────────
function PaymentsSection() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    api.get('/admin/payments').then((r) => { setPayments(r.data.payments); setLoading(false) })
  }, [])

  const totalPaid = payments.filter((p) => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0)

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div className="stat-card" style={{ minWidth: 180 }}>
          <div className="stat-label">Totale omzet</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{fmtMoney(totalPaid)}</div>
        </div>
        <div className="stat-card" style={{ minWidth: 180 }}>
          <div className="stat-label">Betalingen</div>
          <div className="stat-value">{payments.length}</div>
        </div>
        <div className="stat-card" style={{ minWidth: 180 }}>
          <div className="stat-label">Geslaagd</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{payments.filter((p) => p.status === 'paid').length}</div>
        </div>
        <div className="stat-card" style={{ minWidth: 180 }}>
          <div className="stat-label">Mislukt/Open</div>
          <div className="stat-value" style={{ color: 'var(--error)' }}>{payments.filter((p) => p.status !== 'paid').length}</div>
        </div>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Lid</th><th>Bedrag</th><th>Type</th><th>Status</th><th>Datum</th></tr></thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{p.first_name} {p.last_name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.email}</div>
                </td>
                <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{fmtMoney(p.amount)}</td>
                <td>
                  <span className={`badge ${p.type === 'membership' ? 'badge-accent' : 'badge-info'}`}>
                    {p.type === 'membership' ? '🏋️ Abo' : '📦 Winkel'}
                  </span>
                </td>
                <td>
                  <span className={`badge ${p.status === 'paid' ? 'badge-success' : p.status === 'open' ? 'badge-warning' : 'badge-error'}`}>
                    {p.status}
                  </span>
                </td>
                <td style={{ color: 'var(--text-muted)' }}>{fmt(p.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {payments.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Geen betalingen</div>}
      </div>
    </div>
  )
}

// ── Shop admin section ─────────────────────────────────────────────────────
function ShopAdminSection() {
  const [products, setProducts] = useState([])
  const [orders, setOrders]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState('products')
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem]   = useState(null)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [form, setForm] = useState({ name: '', category: 'handschoenen', description: '', price: '', stock: 10 })

  const load = async () => {
    const [pRes, oRes] = await Promise.all([api.get('/shop/admin/products'), api.get('/shop/admin/orders')])
    setProducts(pRes.data.products)
    setOrders(oRes.data.orders)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const openCreate = () => { setEditItem(null); setForm({ name: '', category: 'handschoenen', description: '', price: '', stock: 10 }); setShowModal(true) }
  const openEdit = (p) => { setEditItem(p); setForm({ name: p.name, category: p.category, description: p.description || '', price: p.price, stock: p.stock }); setShowModal(true) }
  const handleDelete = async (id) => { if (!confirm('Product verwijderen?')) return; await api.delete(`/shop/admin/products/${id}`); load() }

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      if (editItem) await api.put(`/shop/admin/products/${editItem.id}`, form)
      else          await api.post('/shop/admin/products', form)
      setShowModal(false); load()
    } catch (e) { setError(e.response?.data?.error || 'Opslaan mislukt.') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <div>
      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>{editItem ? 'Product bewerken' : 'Nieuw product'}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            {error && <div className="alert alert-error"><AlertCircle size={14} />{error}</div>}
            <div className="auth-form">
              <div className="form-group">
                <label className="form-label">Naam</label>
                <input className="form-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Categorie</label>
                  <select className="form-input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                    {['handschoenen','bescherming','kleding','accessoires'].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Prijs (€)</label>
                  <input type="number" step="0.01" className="form-input" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Beschrijving</label>
                <input className="form-input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Voorraad</label>
                <input type="number" className="form-input" value={form.stock} onChange={(e) => setForm((f) => ({ ...f, stock: Number(e.target.value) }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Annuleer</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <span className="spinner spinner-sm" /> : <><Check size={15} /> Opslaan</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {['products', 'orders'].map((t) => (
          <button key={t} className={`btn ${tab === t ? 'btn-primary' : 'btn-ghost'} btn-sm`} onClick={() => setTab(t)}>
            {t === 'products' ? '📦 Producten' : '🛍️ Bestellingen'}
          </button>
        ))}
        {tab === 'products' && <button className="btn btn-ghost btn-sm" onClick={openCreate} style={{ marginLeft: 'auto' }}><Plus size={14} /> Nieuw product</button>}
      </div>

      {tab === 'products' ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Product</th><th>Categorie</th><th>Prijs</th><th>Voorraad</th><th>Status</th><th>Acties</th></tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td><span className={`badge badge-${p.category}`}>{p.category}</span></td>
                  <td style={{ color: 'var(--accent)', fontWeight: 700 }}>{fmtMoney(p.price)}</td>
                  <td>{p.stock}</td>
                  <td><span className={`badge ${p.active ? 'badge-success' : 'badge-muted'}`}>{p.active ? 'Actief' : 'Inactief'}</span></td>
                  <td className="td-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}><Edit2 size={13} /></button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Klant</th><th>Bestelling</th><th>Bedrag</th><th>Status</th><th>Datum</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{o.first_name} {o.last_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{o.email}</div>
                  </td>
                  <td>
                    {(o.items || []).map((item) => (
                      <div key={item.id} style={{ fontSize: '0.8rem' }}>{item.quantity}× {item.product_name}</div>
                    ))}
                  </td>
                  <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{fmtMoney(o.total_amount)}</td>
                  <td><span className={`badge ${o.status === 'paid' ? 'badge-success' : 'badge-warning'}`}>{o.status}</span></td>
                  <td style={{ color: 'var(--text-muted)' }}>{fmt(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Geen bestellingen</div>}
        </div>
      )}
    </div>
  )
}

// ── PT Agenda section ──────────────────────────────────────────────────────
function PTAgendaSection() {
  const [slots,     setSlots]     = useState([])
  const [bookings,  setBookings]  = useState([])
  const [balances,  setBalances]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [tab,       setTab]       = useState('slots')
  const [showModal, setShowModal] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [form, setForm] = useState({ date_time: '', duration_minutes: 60, trainer: 'Mohammed', notes: '' })

  const load = () => {
    setLoading(true)
    const from = new Date().toISOString()
    const to   = new Date(Date.now() + 30 * 86400000).toISOString()
    Promise.all([
      api.get('/pt/slots', { params: { from, to, all: 1 } }),
      api.get('/pt/bookings/admin'),
      api.get('/pt/balance/admin'),
    ]).then(([s, b, bal]) => {
      setSlots(s.data.slots)
      setBookings(b.data.bookings)
      setBalances(bal.data.balances)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const createSlot = async () => {
    setSaving(true); setError('')
    try {
      await api.post('/pt/slots', form)
      setShowModal(false)
      setForm({ date_time: '', duration_minutes: 60, trainer: 'Mohammed', notes: '' })
      load()
    } catch (e) { setError(e.response?.data?.error || 'Opslaan mislukt.') }
    finally { setSaving(false) }
  }

  const deleteSlot = async (id) => {
    if (!confirm('Slot verwijderen?')) return
    await api.delete(`/pt/slots/${id}`)
    load()
  }

  const confirmBooking = async (id) => {
    await api.put(`/pt/bookings/${id}/confirm`); load()
  }
  const declineBooking = async (id) => {
    if (!confirm('Boeking afwijzen?')) return
    await api.put(`/pt/bookings/${id}/decline`); load()
  }

  const statusBadge = (s) => ({
    pending:   <span className="badge badge-warning">Wacht</span>,
    confirmed: <span className="badge badge-success">Bevestigd</span>,
    cancelled: <span className="badge badge-muted">Geannuleerd</span>,
    declined:  <span className="badge badge-error">Afgewezen</span>,
    completed: <span className="badge badge-info">Voltooid</span>,
  }[s] ?? <span className="badge badge-muted">{s}</span>)

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {[
          { id: 'slots',    label: `📅 Slots (${slots.length})`        },
          { id: 'bookings', label: `📋 Boekingen (${bookings.length})` },
          { id: 'balances', label: `💪 Saldi (${balances.length})`      },
        ].map(({ id, label }) => (
          <button key={id} onClick={() => setTab(id)} className={`filter-btn${tab === id ? ' active' : ''}`}>{label}</button>
        ))}
        <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setShowModal(true)}>
          <Plus size={14} /> Nieuw slot
        </button>
      </div>

      {/* Slot aanmaken modal */}
      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>PT Slot aanmaken</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            {error && <div className="alert alert-error" style={{ marginTop: '0.75rem' }}><AlertCircle size={14} />{error}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Datum & tijd *</label>
                <input className="form-input" type="datetime-local" value={form.date_time}
                  onChange={(e) => setForm((f) => ({ ...f, date_time: e.target.value }))} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Duur (minuten)</label>
                  <input className="form-input" type="number" value={form.duration_minutes}
                    onChange={(e) => setForm((f) => ({ ...f, duration_minutes: parseInt(e.target.value) }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Trainer</label>
                  <input className="form-input" value={form.trainer}
                    onChange={(e) => setForm((f) => ({ ...f, trainer: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Notities</label>
                <input className="form-input" value={form.notes} placeholder="Optioneel..."
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-ghost btn-full" onClick={() => setShowModal(false)}>Annuleren</button>
                <button className="btn btn-primary btn-full" onClick={createSlot} disabled={saving || !form.date_time}>
                  {saving ? <span className="spinner spinner-sm" /> : 'Slot aanmaken'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Slots tab */}
      {tab === 'slots' && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Datum & tijd</th><th>Trainer</th><th>Status</th><th>Notities</th><th>Acties</th></tr></thead>
            <tbody>
              {slots.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Geen slots</td></tr>}
              {slots.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>
                    {new Date(s.date_time).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })}{' '}
                    {new Date(s.date_time).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>{s.trainer}</td>
                  <td>
                    {s.status === 'available' ? <span className="badge badge-success">Vrij</span>
                     : s.status === 'booked'  ? <span className="badge badge-warning">Geboekt</span>
                     : <span className="badge badge-muted">Geannuleerd</span>}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{s.notes || '—'}</td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => deleteSlot(s.id)} style={{ color: 'var(--error)' }}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bookings tab */}
      {tab === 'bookings' && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Lid</th><th>Datum sessie</th><th>Status</th><th>Extra</th><th>Acties</th></tr></thead>
            <tbody>
              {bookings.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Geen boekingen</td></tr>}
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{b.first_name} {b.last_name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{b.email}</div>
                  </td>
                  <td>
                    {new Date(b.date_time).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })}{' '}
                    {new Date(b.date_time).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>{statusBadge(b.status)}</td>
                  <td>{b.extra_person ? <span className="badge badge-warning">+persoon</span> : '—'}</td>
                  <td>
                    {b.status === 'pending' && (
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button className="btn btn-primary btn-sm" onClick={() => confirmBooking(b.id)}>
                          <Check size={13} /> OK
                        </button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={() => declineBooking(b.id)}>
                          <X size={13} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Balances tab */}
      {tab === 'balances' && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Lid</th><th>Pakket (id)</th><th>Totaal</th><th>Gebruikt</th><th>Resterend</th><th>Vervalt</th></tr></thead>
            <tbody>
              {balances.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Geen actieve saldi</td></tr>}
              {balances.map((b) => (
                <tr key={b.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{b.first_name} {b.last_name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{b.email}</div>
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>#{b.package_id}</td>
                  <td>{b.lessons_total}</td>
                  <td>{b.lessons_used}</td>
                  <td><span style={{ fontWeight: 700, color: b.lessons_remaining <= 3 ? 'var(--warning)' : 'var(--success)' }}>{b.lessons_remaining}</span></td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    {b.expires_at ? new Date(b.expires_at).toLocaleDateString('nl-NL') : '—'}
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

// ── Main AdminPage ─────────────────────────────────────────────────────────
const SECTIONS = [
  { key: 'stats',    label: 'Dashboard',       Icon: BarChart2  },
  { key: 'members',  label: 'Leden',            Icon: Users      },
  { key: 'classes',  label: 'Lessen',           Icon: Calendar   },
  { key: 'bookings', label: 'Boekingen',        Icon: Calendar   },
  { key: 'payments', label: 'Betalingen',       Icon: CreditCard },
  { key: 'shop',     label: 'Winkel',           Icon: ShoppingBag },
  { key: 'pt',       label: 'PT Agenda',        Icon: Zap        },
]

export default function AdminPage() {
  const { user } = useAuth()
  const [section, setSection] = useState('stats')
  const [stats, setStats]     = useState(null)

  useEffect(() => {
    api.get('/admin/stats').then((r) => setStats(r.data.stats)).catch(() => {})
  }, [])

  // Non-admin guard (belt dubbele check op frontend)
  if (user?.role !== 'admin') {
    return (
      <div className="page">
        <div className="empty-state" style={{ paddingTop: '5rem' }}>
          <div className="empty-state-icon">🔒</div>
          <h3>Geen toegang</h3>
          <p>Je hebt admin rechten nodig om deze pagina te bekijken.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Crown size={24} style={{ color: 'var(--accent)' }} />
          <div>
            <h1>Admin Panel</h1>
            <p>Beheer leden, lessen, betalingen en de winkel</p>
          </div>
        </div>
      </div>

      <div className="admin-layout">
        {/* Sidebar */}
        <div className="admin-sidebar">
          {SECTIONS.map(({ key, label, Icon }) => (
            <button
              key={key}
              className={`admin-sidebar-btn${section === key ? ' active' : ''}`}
              onClick={() => setSection(key)}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="admin-content">
          <h2 style={{ marginBottom: '1.5rem' }}>
            {SECTIONS.find((s) => s.key === section)?.label}
          </h2>
          {section === 'stats'    && <StatsSection stats={stats} />}
          {section === 'members'  && <MembersSection />}
          {section === 'classes'  && <ClassesSection />}
          {section === 'bookings' && <BookingsSection />}
          {section === 'payments' && <PaymentsSection />}
          {section === 'shop'     && <ShopAdminSection />}
          {section === 'pt'       && <PTAgendaSection />}
        </div>
      </div>
    </div>
  )
}
