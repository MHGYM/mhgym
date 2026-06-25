import { useState, useEffect } from 'react'
import { TrendingUp, Trophy, Ruler, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import api from '../../api'

const TABS = ['Workout historie', 'Persoonlijke records', 'Metingen']

function LineChart({ data, xKey, yKey, color = 'var(--primary)', label = '' }) {
  if (!data || data.length < 2) return (
    <div style={{ textAlign:'center', padding:'24px 0', color:'var(--text-muted)', fontSize:'0.8rem' }}>
      Minimaal 2 metingen nodig voor een grafiek.
    </div>
  )

  const values  = data.map(d => Number(d[yKey])).filter(v => !isNaN(v))
  const min     = Math.min(...values)
  const max     = Math.max(...values)
  const range   = max - min || 1
  const W = 400; const H = 120; const pad = 20

  const pts = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (W - pad * 2)
    const y = H - pad - ((Number(d[yKey]) - min) / range) * (H - pad * 2)
    return `${x},${y}`
  })

  return (
    <div style={{ overflowX:'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', maxWidth:W, height:H }}>
        <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {data.map((d, i) => {
          const [x,y] = pts[i].split(',').map(Number)
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={4} fill={color} />
              <text x={x} y={H-2} textAnchor="middle" fontSize={9} fill="var(--text-muted)">{String(d[xKey]).slice(5)}</text>
              <text x={x} y={y-8} textAnchor="middle" fontSize={9} fill={color} fontWeight={700}>{Number(d[yKey]).toFixed(1)}</text>
            </g>
          )
        })}
      </svg>
      {label && <div style={{ textAlign:'center', fontSize:'0.72rem', color:'var(--text-muted)', marginTop:4 }}>{label}</div>}
    </div>
  )
}

export default function ProgressSection() {
  const [tab, setTab]           = useState(0)
  const [logs, setLogs]         = useState([])
  const [records, setRecords]   = useState([])
  const [measurements, setMeas] = useState([])
  const [loading, setLoading]   = useState(true)
  const [openLog, setOpenLog]   = useState(null)
  const [logDetail, setLogDetail] = useState(null)
  const [showMeasForm, setShowMeasForm] = useState(false)
  const [measForm, setMeasForm] = useState({ date: new Date().toISOString().split('T')[0], weight_kg:'', body_fat_pct:'', chest_cm:'', waist_cm:'', hips_cm:'', arms_cm:'', legs_cm:'', notes:'' })
  const [saving, setSaving]     = useState(false)
  const [prGroup, setPrGroup]   = useState({})

  const load = async () => {
    setLoading(true)
    const [l, r, m] = await Promise.all([
      api.get('/training/my/logs?limit=30').then(r => r.data.logs),
      api.get('/training/my/records').then(r => r.data.records),
      api.get('/training/my/measurements').then(r => r.data.measurements),
    ])
    setLogs(l); setRecords(r); setMeas(m)
    // group PRs by exercise
    const g = {}
    for (const pr of r) {
      if (!g[pr.exercise_id]) g[pr.exercise_id] = { name: pr.exercise_name, records: [] }
      g[pr.exercise_id].records.push(pr)
    }
    setPrGroup(g)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const loadLogDetail = async (id) => {
    if (openLog === id) { setOpenLog(null); setLogDetail(null); return }
    setOpenLog(id)
    const r = await api.get(`/training/my/logs/${id}`)
    setLogDetail(r.data.workout)
  }

  const saveMeasurement = async (e) => {
    e.preventDefault(); setSaving(true)
    const payload = {}
    for (const [k,v] of Object.entries(measForm)) {
      payload[k] = v === '' ? null : k === 'date' || k === 'notes' ? v : Number(v)
    }
    try {
      await api.post('/training/my/measurements', payload)
      setShowMeasForm(false)
      setMeasForm({ date: new Date().toISOString().split('T')[0], weight_kg:'', body_fat_pct:'', chest_cm:'', waist_cm:'', hips_cm:'', arms_cm:'', legs_cm:'', notes:'' })
      load()
    } catch(e) { alert(e.response?.data?.error || 'Fout.') }
    finally { setSaving(false) }
  }

  const deleteMeas = async (id) => {
    if (!confirm('Meting verwijderen?')) return
    await api.delete(`/training/my/measurements/${id}`)
    load()
  }

  if (loading) return <div style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>Laden...</div>

  const weightData = [...measurements].reverse().filter(m => m.weight_kg != null).map(m => ({ date: m.date, weight: Number(m.weight_kg) }))

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border)', paddingBottom:4 }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            style={{ padding:'5px 14px', border:'none', borderRadius:'5px 5px 0 0', cursor:'pointer', fontSize:'0.82rem',
              fontWeight: tab===i ? 700 : 500,
              background: tab===i ? 'var(--primary)' : 'transparent',
              color: tab===i ? '#fff' : 'var(--text-muted)',
              borderBottom: tab===i ? '2px solid var(--primary)' : '2px solid transparent' }}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Workout historie ── */}
      {tab === 0 && (
        <div>
          <h3 style={{ margin:'0 0 12px', fontSize:'0.95rem' }}>Recente workouts ({logs.length})</h3>
          {logs.length === 0 ? (
            <div style={{ color:'var(--text-muted)', textAlign:'center', padding:40, fontSize:'0.88rem' }}>
              Nog geen workouts gelogd. Start een sessie via het Workout-tabblad.
            </div>
          ) : (
            <div style={{ display:'grid', gap:8 }}>
              {logs.map(log => (
                <div key={log.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
                  <button onClick={() => loadLogDetail(log.id)}
                    style={{ width:'100%', background:'none', border:'none', cursor:'pointer', padding:'10px 14px', display:'flex', alignItems:'center', gap:10, textAlign:'left' }}>
                    <div style={{ width:36, height:36, borderRadius:8, background:'var(--primary)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:'0.75rem', fontWeight:700 }}>
                      {new Date(log.date).getDate()}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:600, fontSize:'0.88rem' }}>{log.day_name || 'Vrije workout'}</div>
                      <div style={{ color:'var(--text-muted)', fontSize:'0.75rem', marginTop:2 }}>
                        {new Date(log.date).toLocaleDateString('nl-NL', { weekday:'short', day:'numeric', month:'short' })}
                        {log.duration_minutes && ` · ${log.duration_minutes} min`}
                        {log.program_name && ` · ${log.program_name}`}
                        {` · ${log.exercise_count} oefeningen`}
                      </div>
                    </div>
                    {openLog === log.id ? <ChevronUp size={14} style={{ color:'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color:'var(--text-muted)' }} />}
                  </button>
                  {openLog === log.id && logDetail && (
                    <div style={{ borderTop:'1px solid var(--border)', padding:'10px 14px', background:'var(--bg)' }}>
                      {log.notes && <p style={{ fontSize:'0.83rem', color:'var(--text-muted)', marginBottom:10, fontStyle:'italic' }}>{log.notes}</p>}
                      {(logDetail.exercises || []).map(ex => (
                        <div key={ex.exercise_id} style={{ marginBottom:10 }}>
                          <div style={{ fontWeight:600, fontSize:'0.83rem', marginBottom:4 }}>{ex.exercise_name}</div>
                          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                            {ex.sets.map((s, i) => (
                              <span key={i} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:6, padding:'3px 8px', fontSize:'0.75rem' }}>
                                {i+1}. {s.reps_done ?? '—'} reps{s.weight_kg ? ` @ ${s.weight_kg}kg` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── PR's ── */}
      {tab === 1 && (
        <div>
          <h3 style={{ margin:'0 0 12px', fontSize:'0.95rem' }}>
            <Trophy size={16} style={{ verticalAlign:'middle', marginRight:6, color:'#f59e0b' }} />
            Persoonlijke records
          </h3>
          {Object.keys(prGroup).length === 0 ? (
            <div style={{ color:'var(--text-muted)', textAlign:'center', padding:40, fontSize:'0.88rem' }}>
              Nog geen records. PR's worden automatisch bijgewerkt als je een workout logt met gewicht.
            </div>
          ) : (
            <div style={{ display:'grid', gap:10 }}>
              {Object.values(prGroup).map(group => {
                const best = group.records.reduce((a, b) => Number(a.weight_kg) >= Number(b.weight_kg) ? a : b)
                return (
                  <div key={group.name} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
                    <Trophy size={20} style={{ color:'#f59e0b', flexShrink:0 }} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:600, fontSize:'0.9rem' }}>{group.name}</div>
                      <div style={{ color:'var(--text-muted)', fontSize:'0.75rem', marginTop:2 }}>
                        {group.records.length} record{group.records.length !== 1 ? 's' : ''} · gehaald op {new Date(best.recorded_at).toLocaleDateString('nl-NL')}
                      </div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontWeight:800, fontSize:'1.2rem', color:'var(--primary)' }}>{Number(best.weight_kg).toFixed(1)} kg</div>
                      <div style={{ color:'var(--text-muted)', fontSize:'0.73rem' }}>{best.reps} reps</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Metingen ── */}
      {tab === 2 && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <h3 style={{ margin:0, fontSize:'0.95rem' }}>
              <Ruler size={15} style={{ verticalAlign:'middle', marginRight:6 }} />
              Lichaamsmetingen
            </h3>
            <button className="btn btn-primary" onClick={() => setShowMeasForm(v=>!v)} style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.82rem' }}>
              <Plus size={13} />Meting toevoegen
            </button>
          </div>

          {/* Weight chart */}
          {weightData.length >= 2 && (
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:16, marginBottom:16 }}>
              <div style={{ fontSize:'0.8rem', fontWeight:700, color:'var(--text-muted)', marginBottom:8, textTransform:'uppercase', letterSpacing:'.04em' }}>Gewichtsverloop</div>
              <LineChart data={weightData} xKey="date" yKey="weight" label="Gewicht (kg)" />
            </div>
          )}

          {/* Add measurement form */}
          {showMeasForm && (
            <form onSubmit={saveMeasurement} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:16, marginBottom:16 }}>
              <h4 style={{ margin:'0 0 12px', fontSize:'0.88rem' }}>Nieuwe meting</h4>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:8, marginBottom:10 }}>
                {[
                  { key:'date', label:'Datum', type:'date' },
                  { key:'weight_kg', label:'Gewicht (kg)', type:'number', step:'0.1' },
                  { key:'body_fat_pct', label:'Vetpercentage (%)', type:'number', step:'0.1' },
                  { key:'chest_cm', label:'Borst (cm)', type:'number', step:'0.1' },
                  { key:'waist_cm', label:'Taille (cm)', type:'number', step:'0.1' },
                  { key:'hips_cm', label:'Heupen (cm)', type:'number', step:'0.1' },
                  { key:'arms_cm', label:'Armen (cm)', type:'number', step:'0.1' },
                  { key:'legs_cm', label:'Benen (cm)', type:'number', step:'0.1' },
                ].map(({ key, label, type, step }) => (
                  <div key={key}>
                    <label style={{ fontSize:'0.75rem', fontWeight:600, display:'block', marginBottom:3 }}>{label}</label>
                    <input type={type} step={step} value={measForm[key]} onChange={e=>setMeasForm(f=>({...f,[key]:e.target.value}))}
                      style={{ width:'100%', padding:'6px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:'0.83rem', background:'var(--bg)', color:'var(--text)', boxSizing:'border-box' }} />
                  </div>
                ))}
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={{ fontSize:'0.75rem', fontWeight:600, display:'block', marginBottom:3 }}>Notities</label>
                  <input value={measForm.notes} onChange={e=>setMeasForm(f=>({...f,notes:e.target.value}))}
                    style={{ width:'100%', padding:'6px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:'0.83rem', background:'var(--bg)', color:'var(--text)', boxSizing:'border-box' }} />
                </div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ fontSize:'0.82rem' }}>{saving ? 'Opslaan...' : 'Opslaan'}</button>
                <button type="button" className="btn" onClick={() => setShowMeasForm(false)} style={{ fontSize:'0.82rem' }}>Annuleren</button>
              </div>
            </form>
          )}

          {/* Measurements list */}
          {measurements.length === 0 ? (
            <div style={{ color:'var(--text-muted)', textAlign:'center', padding:40, fontSize:'0.88rem' }}>Nog geen metingen. Voeg je eerste meting toe.</div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.83rem' }}>
                <thead>
                  <tr style={{ borderBottom:'2px solid var(--border)' }}>
                    {['Datum','Gewicht','Vet%','Borst','Taille','Heupen','Armen','Benen','Notities',''].map(h => (
                      <th key={h} style={{ padding:'6px 8px', textAlign:'left', color:'var(--text-muted)', fontWeight:600, fontSize:'0.72rem', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {measurements.map(m => (
                    <tr key={m.id} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'7px 8px', whiteSpace:'nowrap', fontWeight:600 }}>{new Date(m.date).toLocaleDateString('nl-NL')}</td>
                      {['weight_kg','body_fat_pct','chest_cm','waist_cm','hips_cm','arms_cm','legs_cm'].map(k => (
                        <td key={k} style={{ padding:'7px 8px', color: m[k] != null ? 'var(--text)' : 'var(--text-muted)' }}>
                          {m[k] != null ? Number(m[k]).toFixed(1) : '—'}
                        </td>
                      ))}
                      <td style={{ padding:'7px 8px', color:'var(--text-muted)', maxWidth:120 }}>{m.notes || '—'}</td>
                      <td style={{ padding:'7px 8px' }}>
                        <button onClick={() => deleteMeas(m.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:2 }}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
