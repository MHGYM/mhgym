import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Check, X, Utensils } from 'lucide-react'
import api from '../../api'

const MEAL_KEYS = [
  { key: 'ontbijt', label: 'Ontbijt' },
  { key: 'lunch',   label: 'Lunch'   },
  { key: 'diner',   label: 'Diner'   },
  { key: 'snacks',  label: 'Snacks'  },
]

const emptyMeals = () => MEAL_KEYS.map(m => ({ ...m, description: '' }))

export default function VoortgangAdmin() {
  const [members, setMembers]     = useState([])
  const [selMember, setSelMember] = useState('')
  const [templates, setTemplates] = useState([])
  const [loading, setLoading]     = useState(false)
  const [editing, setEditing]     = useState(null) // 'new' | template object | null
  const [form, setForm]           = useState({ title: '', meals: emptyMeals(), active: true })
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState('')

  useEffect(() => {
    api.get('/admin/members').then(r => setMembers(r.data.members || [])).catch(() => {})
  }, [])

  const loadTemplates = (memberId) => {
    if (!memberId) { setTemplates([]); return }
    setLoading(true)
    api.get(`/voortgang/admin/templates/${memberId}`)
      .then(r => setTemplates(r.data.templates || []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadTemplates(selMember) }, [selMember])

  const startNew = () => {
    setEditing('new')
    setForm({ title: '', meals: emptyMeals(), active: true })
    setErr('')
  }

  const startEdit = (t) => {
    setEditing(t)
    setForm({
      title: t.title,
      meals: MEAL_KEYS.map(mk => {
        const existing = t.meals.find(m => m.key === mk.key)
        return { ...mk, description: existing?.description || '' }
      }),
      active: !!t.active,
    })
    setErr('')
  }

  const updateMealDesc = (key, value) => {
    setForm(f => ({ ...f, meals: f.meals.map(m => m.key === key ? { ...m, description: value } : m) }))
  }

  const save = async () => {
    if (!form.title.trim()) { setErr('Titel is verplicht.'); return }
    setSaving(true); setErr('')
    try {
      if (editing === 'new') {
        await api.post('/voortgang/admin/templates', { member_id: parseInt(selMember), title: form.title.trim(), meals: form.meals })
      } else {
        await api.put(`/voortgang/admin/templates/${editing.id}`, { title: form.title.trim(), meals: form.meals, active: form.active })
      }
      setEditing(null)
      loadTemplates(selMember)
    } catch (e) {
      setErr(e.response?.data?.error || 'Opslaan mislukt.')
    } finally {
      setSaving(false)
    }
  }

  const deactivate = async (id) => {
    if (!confirm('Dit schema deactiveren?')) return
    await api.delete(`/voortgang/admin/templates/${id}`)
    loadTemplates(selMember)
  }

  const activate = async (t) => {
    await api.put(`/voortgang/admin/templates/${t.id}`, { active: true })
    loadTemplates(selMember)
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Utensils size={20} style={{ color: 'var(--primary,var(--accent))' }} />
        Voedingsschema's
      </h2>

      <div style={{ marginBottom: '1.25rem', maxWidth: 320 }}>
        <label className="input-label">Lid</label>
        <select className="input" value={selMember} onChange={e => { setSelMember(e.target.value); setEditing(null) }}>
          <option value="">— Kies een lid —</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
        </select>
      </div>

      {!selMember && <p style={{ color: 'var(--text-muted)' }}>Kies eerst een lid om schema's te beheren.</p>}

      {selMember && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {loading ? 'Laden…' : `${templates.length} schema${templates.length !== 1 ? "'s" : ''}`}
            </span>
            {editing === null && (
              <button className="btn btn-primary btn-sm" onClick={startNew}><Plus size={13} /> Nieuw schema</button>
            )}
          </div>

          {editing !== null && (
            <div className="card" style={{ marginBottom: '1.25rem' }}>
              <h3 style={{ marginBottom: '0.75rem' }}>{editing === 'new' ? 'Nieuw voedingsschema' : 'Schema bewerken'}</h3>
              {err && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{err}</div>}

              <div style={{ marginBottom: '0.75rem' }}>
                <label className="input-label">Titel</label>
                <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="bijv. Cutting schema — week 1" />
              </div>

              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {form.meals.map(m => (
                  <div key={m.key}>
                    <label className="input-label">{m.label}</label>
                    <textarea
                      className="input"
                      rows={2}
                      style={{ resize: 'vertical' }}
                      value={m.description}
                      onChange={e => updateMealDesc(m.key, e.target.value)}
                      placeholder={`Omschrijving voor ${m.label.toLowerCase()}…`}
                    />
                  </div>
                ))}
              </div>

              {editing !== 'new' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.75rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} style={{ accentColor: 'var(--primary)' }} />
                  Actief (lid ziet dit schema als checklist)
                </label>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}><Check size={13} /> Opslaan</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}><X size={13} /> Annuleren</button>
              </div>
            </div>
          )}

          {templates.map(t => (
            <div key={t.id} className="card" style={{ marginBottom: '0.6rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {t.title}
                    <span className={`badge ${t.active ? 'badge-success' : 'badge-muted'}`}>{t.active ? 'Actief' : 'Inactief'}</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    {t.meals.filter(m => m.description).map(m => m.label).join(' · ') || 'Geen omschrijvingen ingevuld'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                  {!t.active && (
                    <button className="btn btn-sm" style={{ background: 'var(--success-dim)', color: 'var(--success)' }} onClick={() => activate(t)}>Activeren</button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => startEdit(t)}><Edit2 size={13} /></button>
                  {t.active && (
                    <button className="btn btn-danger btn-sm" onClick={() => deactivate(t.id)}><Trash2 size={13} /></button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {!loading && templates.length === 0 && (
            <p style={{ color: 'var(--text-muted)' }}>Nog geen voedingsschema's voor dit lid.</p>
          )}
        </>
      )}
    </div>
  )
}
