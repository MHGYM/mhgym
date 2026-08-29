import { useState } from 'react'
import { AlertCircle, X } from 'lucide-react'
import api from '../api'

function fmtDate(d) {
  if (!d) return '–'
  return new Date(d).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
}
function fmtTime(d) {
  if (!d) return ''
  return new Date(d).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

// PT-sessie boeken — kiest pakket of abonnement, roept de bestaande
// POST /pt/bookings aan. Gedeeld door PersonalTrainingPage en SchedulePage
// zodat beide exact dezelfde boekingslogica gebruiken.
export default function PtBookingModal({ slot, balance, onClose, onBooked }) {
  const [purchaseId,     setPurchaseId]     = useState(balance.purchases[0]?.id ?? null)
  const [subscriptionId, setSubscriptionId] = useState(balance.subscription?.id ?? null)
  const [useType,        setUseType]        = useState(balance.subscription ? 'sub' : 'pkg')
  const [extraPerson,    setExtraPerson]    = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState('')

  const book = async () => {
    setSaving(true); setError('')
    try {
      await api.post('/pt/bookings', {
        slot_id:         slot.id,
        purchase_id:     useType === 'pkg' ? purchaseId : null,
        subscription_id: useType === 'sub' ? subscriptionId : null,
        extra_person:    extraPerson,
      })
      onBooked()
    } catch (err) {
      setError(err.response?.data?.error || 'Boeken mislukt.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}
      onTouchEnd={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440, width: '100%' }}>
        <div className="modal-header" style={{ marginBottom: '1.25rem' }}>
          <h3>PT Sessie boeken</h3>
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}><AlertCircle size={15} />{error}</div>}

        <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--r)', padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>{fmtDate(slot.date_time)}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {fmtTime(slot.date_time)} · {slot.duration_minutes || 60} min · {slot.trainer}
          </div>
        </div>

        {/* Kies pakket of abonnement */}
        {balance.purchases.length > 0 && balance.subscription && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            {['pkg', 'sub'].map((t) => (
              <button key={t} onClick={() => setUseType(t)} style={{
                flex: 1, padding: '0.6rem', borderRadius: 'var(--r)', cursor: 'pointer',
                background: useType === t ? 'var(--accent-dim)' : 'var(--surface-2)',
                border: `1px solid ${useType === t ? 'var(--accent)' : 'var(--border)'}`,
                color: useType === t ? 'var(--accent)' : 'var(--text-muted)', fontSize: '0.82rem',
              }}>
                {t === 'pkg' ? '📦 Pakket' : '🔄 Abonnement'}
              </button>
            ))}
          </div>
        )}

        {useType === 'pkg' && balance.purchases.length > 0 && (
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">Selecteer pakket</label>
            <select className="form-input" value={purchaseId ?? ''} onChange={(e) => setPurchaseId(parseInt(e.target.value))}>
              {balance.purchases.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lessons_remaining} les{p.lessons_remaining !== 1 ? 'sen' : ''} resterend (verloopt {new Date(p.expires_at).toLocaleDateString('nl-NL')})
                </option>
              ))}
            </select>
          </div>
        )}

        <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', cursor: 'pointer', padding: '0.75rem', background: 'var(--surface-2)', borderRadius: 'var(--r)', marginBottom: '1.25rem' }}>
          <input type="checkbox" checked={extraPerson} onChange={(e) => setExtraPerson(e.target.checked)} style={{ accentColor: 'var(--accent)', width: 16, height: 16 }} />
          <span style={{ fontSize: '0.83rem', color: 'var(--text-2)' }}>Extra persoon meenemen <span style={{ color: 'var(--text-muted)' }}>(+€15 per sessie, betaling via gym)</span></span>
        </label>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-ghost btn-full" onClick={onClose}>Annuleren</button>
          <button className="btn btn-primary btn-full" onClick={book} disabled={saving}
            style={{ touchAction: 'manipulation' }}>
            {saving ? <span className="spinner spinner-sm" /> : 'Boeken (wacht op bevestiging)'}
          </button>
        </div>
      </div>
    </div>
  )
}
