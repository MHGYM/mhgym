import { useState, useEffect, useRef } from 'react'
import { Plus, Edit2, Trash2, Check, X, Utensils, Camera, Eye, Search, Target, Award } from 'lucide-react'
import api from '../../api'
import AuthedImage from '../../components/AuthedImage'

const TABS = [
  { key: 'voeding',       label: "Voedingsschema's", Icon: Utensils },
  { key: 'meetresultaten', label: 'Meetresultaten',  Icon: Camera   },
]

export default function VoortgangAdmin() {
  const [tab, setTab] = useState('voeding')

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: 8 }}>
        Mijn Voortgang — beheer
      </h2>

      <div className="tab-bar" style={{ marginBottom: '1.25rem' }}>
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} className={`tab-btn${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
            <Icon size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />{label}
          </button>
        ))}
      </div>

      {tab === 'voeding' && <VoedingschemasAdmin />}
      {tab === 'meetresultaten' && <MeetresultatenAdmin />}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// TAB: VOEDINGSSCHEMA'S (ongewijzigd overgenomen)
// ════════════════════════════════════════════════════════════════════
const MEAL_KEYS = [
  { key: 'ontbijt', label: 'Ontbijt' },
  { key: 'lunch',   label: 'Lunch'   },
  { key: 'diner',   label: 'Diner'   },
  { key: 'snacks',  label: 'Snacks'  },
]

const emptyMeals = () => MEAL_KEYS.map(m => ({ ...m, description: '' }))

function VoedingschemasAdmin() {
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

// ════════════════════════════════════════════════════════════════════
// TAB: MEETRESULTATEN (nieuw)
// ════════════════════════════════════════════════════════════════════
const GOAL_METRICS = [
  { value: 'weight_kg',      label: 'Gewicht (kg)' },
  { value: 'body_fat_pct',   label: 'Lichaamsvet (%)' },
  { value: 'muscle_mass_kg', label: 'Spiermassa (kg)' },
]

function fmtDate(s) {
  return s ? new Date(s).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

function MeetresultatenAdmin() {
  const [query, setQuery]           = useState('')
  const [results, setResults]       = useState([])
  const [searching, setSearching]   = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [member, setMember]         = useState(null)

  const [reports, setReports]       = useState([])
  const [badges, setBadges]         = useState([])
  const [goal, setGoal]             = useState(null)
  const [loadingData, setLoadingData] = useState(false)

  const [title, setTitle]           = useState('')
  const [date, setDate]             = useState(new Date().toISOString().split('T')[0])
  const [preview, setPreview]       = useState(null) // { dataUrl, mime }
  const [uploadErr, setUploadErr]   = useState('')
  const [uploading, setUploading]   = useState(false)
  const [justUploaded, setJustUploaded] = useState(false)

  const [goalMetric, setGoalMetric]   = useState('body_fat_pct')
  const [goalDirection, setGoalDirection] = useState('lower')
  const [goalValue, setGoalValue]     = useState('')
  const [goalSaving, setGoalSaving]   = useState(false)

  const debounceRef = useRef(null)

  const search = (q) => {
    setQuery(q)
    clearTimeout(debounceRef.current)
    if (!q.trim()) { setResults([]); setShowResults(false); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await api.get(`/admin/members?q=${encodeURIComponent(q.trim())}`)
        setResults(r.data.members || [])
        setShowResults(true)
      } catch (_) { setResults([]) }
      finally { setSearching(false) }
    }, 350)
  }

  const loadMemberData = async (m) => {
    setLoadingData(true)
    try {
      const [repRes, badgeRes, goalRes] = await Promise.all([
        api.get(`/admin/members/${m.id}/measurement-reports`),
        api.get(`/voortgang/admin/badges/${m.id}`),
        api.get(`/voortgang/admin/goals/${m.id}`),
      ])
      setReports(repRes.data.reports || [])
      setBadges(badgeRes.data.badges || [])
      setGoal((goalRes.data.goals || []).find(g => !g.achieved_at) || null)
    } catch (_) {
      setReports([]); setBadges([]); setGoal(null)
    } finally {
      setLoadingData(false)
    }
  }

  const selectMember = (m) => {
    setMember(m)
    setQuery(`${m.first_name} ${m.last_name}`)
    setShowResults(false)
    setPreview(null); setTitle(''); setUploadErr(''); setJustUploaded(false)
    loadMemberData(m)
  }

  const clearMember = () => {
    setMember(null); setQuery(''); setResults([]); setReports([]); setBadges([]); setGoal(null)
  }

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    setUploadErr(''); setJustUploaded(false)
    if (!file) { setPreview(null); return }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setUploadErr('Alleen JPG, PNG of WEBP toegestaan.'); setPreview(null); return
    }
    if (file.size > 8 * 1024 * 1024) {
      setUploadErr('Bestand is te groot (max. 8MB).'); setPreview(null); return
    }
    const reader = new FileReader()
    reader.onload = ev => setPreview({ dataUrl: ev.target.result, mime: file.type })
    reader.readAsDataURL(file)
  }

  const doUpload = async () => {
    if (!preview) { setUploadErr('Kies eerst een afbeelding.'); return }
    setUploading(true); setUploadErr('')
    try {
      await api.post(`/admin/members/${member.id}/measurement-reports`, {
        measured_at: date,
        image_data: preview.dataUrl,
        title: title.trim() || undefined,
      })
      setJustUploaded(true)
      setTitle(''); setDate(new Date().toISOString().split('T')[0])
      loadMemberData(member)
    } catch (e) {
      setUploadErr(e.response?.data?.error || 'Uploaden mislukt.')
    } finally {
      setUploading(false)
    }
  }

  const doDelete = async (reportId) => {
    if (!confirm('Dit meetresultaat definitief verwijderen?')) return
    try {
      await api.delete(`/admin/measurement-reports/${reportId}`)
      loadMemberData(member)
    } catch (e) { alert(e.response?.data?.error || 'Verwijderen mislukt.') }
  }

  const doSetGoal = async () => {
    const value = Number(String(goalValue).replace(',', '.'))
    if (!Number.isFinite(value)) { alert('Geef een geldige doelwaarde op.'); return }
    setGoalSaving(true)
    try {
      const r = await api.post('/voortgang/admin/goals', {
        member_id: member.id, metric: goalMetric, target_value: value, direction: goalDirection,
      })
      setGoal(r.data.goal)
      setGoalValue('')
    } catch (e) {
      alert(e.response?.data?.error || 'Doel instellen mislukt.')
    } finally {
      setGoalSaving(false)
    }
  }

  return (
    <div>
      {/* ── Zoekbalk ── */}
      <div style={{ position: 'relative', maxWidth: 420, marginBottom: member ? '1.25rem' : '0.5rem' }}>
        <label className="input-label">Lid</label>
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="input"
            style={{ paddingLeft: 32 }}
            placeholder="Zoek lid op naam of e-mail…"
            value={query}
            onChange={e => search(e.target.value)}
            onFocus={() => { if (results.length) setShowResults(true) }}
          />
        </div>

        {showResults && (
          <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4, maxHeight: 260, overflowY: 'auto', padding: '0.4rem' }}>
            {searching && <div style={{ padding: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Zoeken…</div>}
            {!searching && results.length === 0 && (
              <div style={{ padding: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Geen leden gevonden.</div>
            )}
            {!searching && results.map(m => (
              <div
                key={m.id}
                onClick={() => selectMember(m)}
                style={{ padding: '0.5rem 0.6rem', borderRadius: 'var(--r-sm)', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-3)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{m.first_name} {m.last_name}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{m.email}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {!member && <p style={{ color: 'var(--text-muted)' }}>Zoek en selecteer een lid om meetresultaten te beheren.</p>}

      {member && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem', padding: '0.6rem 0.9rem', background: 'var(--surface-2)', borderRadius: 'var(--r)' }}>
            <span style={{ fontWeight: 700 }}>Geselecteerd: {member.first_name} {member.last_name}</span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>({member.email})</span>
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={clearMember}><X size={13} /> Wissel lid</button>
          </div>

          {loadingData ? <p style={{ color: 'var(--text-muted)' }}>Laden…</p> : (
            <>
              {/* ── Upload ── */}
              <div className="card" style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ marginBottom: '0.75rem' }}>Nieuw meetresultaat uploaden</h3>
                <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: '1fr 1fr', marginBottom: '0.75rem' }}>
                  <div>
                    <label className="input-label">Datum meting</label>
                    <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} max={new Date().toISOString().split('T')[0]} />
                  </div>
                  <div>
                    <label className="input-label">Titel (optioneel)</label>
                    <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="bijv. Maandmeting augustus" />
                  </div>
                </div>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label className="input-label">Afbeelding (JPG, PNG of WEBP, max. 8MB)</label>
                  <input className="input" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} />
                </div>

                {uploadErr && <div className="alert alert-error" style={{ fontSize: '0.8rem', marginBottom: '0.75rem' }}>{uploadErr}</div>}
                {justUploaded && (
                  <div className="alert alert-success" style={{ fontSize: '0.85rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Check size={15} /> Meetresultaat succesvol opgeslagen.
                  </div>
                )}

                {preview && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Voorbeeld:</div>
                    <img src={preview.dataUrl} alt="Voorbeeld" style={{ maxWidth: 220, maxHeight: 220, borderRadius: 'var(--r)', border: '1px solid var(--border)', display: 'block' }} />
                  </div>
                )}

                <button className="btn btn-primary btn-sm" onClick={doUpload} disabled={uploading || !preview}>
                  {uploading ? 'Uploaden…' : <><Plus size={13} /> Uploaden</>}
                </button>
              </div>

              {/* ── Bestaande resultaten ── */}
              <div className="card" style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ marginBottom: '0.75rem' }}>Bestaande meetresultaten ({reports.length})</h3>
                {reports.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Nog geen meetresultaten voor dit lid.</p>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.6rem' }}>
                  {reports.map(rep => (
                    <div key={rep.id} style={{ background: 'var(--surface-2)', borderRadius: 'var(--r)', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <AuthedImage
                        src={`/admin/measurement-reports/${rep.id}/image`}
                        alt={rep.title || fmtDate(rep.measured_at)}
                        style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 'var(--r-sm)' }}
                      />
                      <div style={{ fontSize: '0.78rem', fontWeight: 600, textAlign: 'center' }}>{rep.title || fmtDate(rep.measured_at)}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'center' }}>{fmtDate(rep.measured_at)}</div>
                      <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--error)', border: '1px solid rgba(239,68,68,0.25)' }} onClick={() => doDelete(rep.id)}>
                        <Trash2 size={11} /> Verwijderen
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Doel instellen ── */}
              <div className="card" style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}><Target size={16} /> Doel</h3>
                {goal ? (
                  <p style={{ fontSize: '0.85rem' }}>
                    Actief doel: <strong>{GOAL_METRICS.find(m => m.value === goal.metric)?.label}</strong> {goal.direction === 'lower' ? '≤' : '≥'} <strong>{goal.target_value}</strong>
                  </p>
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nog geen actief doel ingesteld.</p>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end', marginTop: '0.6rem' }}>
                  <div>
                    <label className="input-label">Metriek</label>
                    <select className="input" value={goalMetric} onChange={e => setGoalMetric(e.target.value)}>
                      {GOAL_METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="input-label">Richting</label>
                    <select className="input" value={goalDirection} onChange={e => setGoalDirection(e.target.value)}>
                      <option value="lower">Lager of gelijk aan</option>
                      <option value="higher">Hoger of gelijk aan</option>
                    </select>
                  </div>
                  <div>
                    <label className="input-label">Doelwaarde</label>
                    <input className="input" style={{ width: 100 }} type="text" inputMode="decimal" value={goalValue} onChange={e => setGoalValue(e.target.value)} placeholder="bijv. 18" />
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={doSetGoal} disabled={goalSaving}>Doel instellen</button>
                </div>
              </div>

              {/* ── Badges ── */}
              <div className="card">
                <h3 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}><Award size={16} /> Badges</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.5rem' }}>
                  {badges.map(b => (
                    <div key={b.key} style={{ padding: '0.5rem 0.6rem', borderRadius: 'var(--r)', background: b.earned ? 'var(--surface-2)' : 'transparent', border: `1px solid ${b.earned ? 'var(--accent)' : 'var(--border)'}`, opacity: b.earned ? 1 : 0.5 }}>
                      <div style={{ fontSize: '1.1rem' }}>{b.icon} <strong style={{ fontSize: '0.82rem' }}>{b.label}</strong></div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{b.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
