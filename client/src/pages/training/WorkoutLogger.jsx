import { useState, useEffect, useRef } from 'react'
import { Dumbbell, Plus, Minus, Check, Timer, ChevronDown, ChevronUp, Save, BedDouble, Video } from 'lucide-react'
import api from '../../api'
import { useTraining } from '../TrainingPage'

function RestTimer({ seconds, onDone }) {
  const [remaining, setRemaining] = useState(seconds)
  const ref = useRef(null)

  useEffect(() => {
    ref.current = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) { clearInterval(ref.current); onDone(); return 0 }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(ref.current)
  }, [])

  const pct = remaining / seconds
  const size = 80; const r = 32; const circ = 2 * Math.PI * r

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'12px 0' }}>
      <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth={6} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--primary)" strokeWidth={6}
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} strokeLinecap="round" style={{ transition:'stroke-dashoffset .9s linear' }} />
      </svg>
      <div style={{ marginTop:-62, fontSize:'1.1rem', fontWeight:700, color:'var(--primary)' }}>{remaining}s</div>
      <div style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginTop:16 }}>Rust...</div>
      <button className="btn" onClick={onDone} style={{ fontSize:'0.78rem', padding:'4px 12px' }}>Overslaan</button>
    </div>
  )
}

export default function WorkoutLogger() {
  const { bunnyLibraryId } = useTraining()
  const [myProgram, setMyProgram]   = useState(null)
  const [programDetail, setProgramDetail] = useState(null)
  const [loading, setLoading]       = useState(true)
  const [selectedDay, setSelectedDay] = useState(null)
  const [sets, setSets]             = useState({})      // { peId: [{ reps:'', weight:'' }] }
  const [restTimer, setRestTimer]   = useState(null)    // { seconds, peId }
  const [duration, setDuration]     = useState(0)
  const [notes, setNotes]           = useState('')
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [openEx, setOpenEx]         = useState(null)    // expanded exercise id
  const durationRef = useRef(null)

  useEffect(() => {
    api.get('/training/my/program').then(r => {
      const mp = r.data.user_program
      setMyProgram(mp)
      if (mp?.program_id) {
        api.get(`/training/programs/${mp.program_id}`).then(r2 => {
          setProgramDetail(r2.data.program)
          setLoading(false)
        })
      } else {
        setLoading(false)
      }
    }).catch(() => setLoading(false))
  }, [])

  // Duration timer when a day is selected
  useEffect(() => {
    if (selectedDay) {
      setDuration(0)
      durationRef.current = setInterval(() => setDuration(d => d+1), 1000)
    } else {
      clearInterval(durationRef.current)
    }
    return () => clearInterval(durationRef.current)
  }, [selectedDay])

  const selectDay = (day) => {
    if (day.is_rest_day) return
    setSelectedDay(day)
    setSaved(false)
    // Initialize sets from program defaults
    const init = {}
    for (const pe of day.exercises || []) {
      init[pe.id] = Array.from({ length: pe.sets }, () => ({ reps: String(pe.reps), weight: '' }))
    }
    setSets(init)
  }

  const updateSet = (peId, setIdx, field, value) => {
    setSets(prev => ({
      ...prev,
      [peId]: prev[peId].map((s, i) => i === setIdx ? { ...s, [field]: value } : s)
    }))
  }

  const addSet = (peId) => setSets(prev => ({ ...prev, [peId]: [...(prev[peId]||[]), { reps:'10', weight:'' }] }))
  const removeSet = (peId) => setSets(prev => ({ ...prev, [peId]: prev[peId].slice(0,-1) }))

  const formatDuration = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`

  const handleSave = async () => {
    setSaving(true)
    try {
      const exercises = Object.entries(sets).map(([peId, setArr]) => {
        const pe = selectedDay.exercises.find(x => x.id === Number(peId))
        return {
          exercise_id: pe?.exercise?.id || pe?.exercise_id,
          sets: setArr.map((s, i) => ({
            set_number: i + 1,
            reps_done:  s.reps ? Number(s.reps) : null,
            weight_kg:  s.weight ? Number(s.weight) : null,
          })).filter(s => s.reps_done != null || s.weight_kg != null),
        }
      }).filter(ex => ex.sets.length > 0)

      await api.post('/training/my/logs', {
        program_day_id:   selectedDay.id,
        date:             new Date().toISOString().split('T')[0],
        duration_minutes: Math.round(duration / 60),
        notes,
        exercises,
      })
      setSaved(true)
      clearInterval(durationRef.current)
    } catch(e) { alert(e.response?.data?.error || 'Fout bij opslaan.') }
    finally { setSaving(false) }
  }

  if (loading) return <div style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>Laden...</div>

  if (!myProgram) return (
    <div style={{ textAlign:'center', padding:48, color:'var(--text-muted)' }}>
      <Dumbbell size={36} style={{ marginBottom:12, opacity:.4 }} />
      <div style={{ fontWeight:600, marginBottom:6 }}>Geen actief programma</div>
      <div style={{ fontSize:'0.85rem' }}>Kies een programma op het tabblad Programma's.</div>
    </div>
  )

  // Day selection view
  if (!selectedDay) {
    return (
      <div>
        <div style={{ marginBottom:20 }}>
          <h2 style={{ margin:'0 0 4px', fontSize:'1.1rem' }}>Workout starten</h2>
          <div style={{ color:'var(--text-muted)', fontSize:'0.83rem' }}>Programma: <strong>{myProgram.program_name}</strong></div>
        </div>
        <div style={{ display:'grid', gap:8 }}>
          {(programDetail?.days || []).map(day => (
            <button key={day.id} onClick={() => selectDay(day)} disabled={day.is_rest_day}
              style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 16px', cursor: day.is_rest_day ? 'default' : 'pointer',
                display:'flex', alignItems:'center', gap:12, textAlign:'left', opacity: day.is_rest_day ? 0.6 : 1,
                transition:'border-color .15s', width:'100%' }}>
              <div style={{ width:40, height:40, borderRadius:8, background: day.is_rest_day ? 'var(--bg)' : 'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {day.is_rest_day ? <BedDouble size={18} style={{ color:'var(--text-muted)' }} /> : <Dumbbell size={18} style={{ color:'#fff' }} />}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:'0.9rem' }}>Week {day.week_number}, Dag {day.day_number}: {day.day_name}</div>
                <div style={{ color:'var(--text-muted)', fontSize:'0.75rem', marginTop:2 }}>
                  {day.is_rest_day ? 'Rustdag' : `${day.exercises?.length || 0} oefeningen${day.focus ? ` · ${day.focus}` : ''}`}
                </div>
              </div>
              {!day.is_rest_day && <ChevronDown size={16} style={{ color:'var(--text-muted)', flexShrink:0 }} />}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Active workout view
  if (saved) return (
    <div style={{ textAlign:'center', padding:48 }}>
      <div style={{ width:64, height:64, borderRadius:'50%', background:'#d1fae5', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
        <Check size={28} style={{ color:'#059669' }} />
      </div>
      <h2 style={{ margin:'0 0 6px' }}>Workout opgeslagen!</h2>
      <div style={{ color:'var(--text-muted)', fontSize:'0.85rem', marginBottom:24 }}>
        {selectedDay.day_name} · {formatDuration(duration)}
      </div>
      <button className="btn btn-primary" onClick={() => { setSelectedDay(null); setSaved(false) }}>
        Nieuwe sessie starten
      </button>
    </div>
  )

  return (
    <div>
      {/* Workout header */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 16px', marginBottom:16, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontWeight:700, fontSize:'0.95rem' }}>{selectedDay.day_name}</div>
          {selectedDay.focus && <div style={{ color:'var(--text-muted)', fontSize:'0.78rem' }}>{selectedDay.focus}</div>}
        </div>
        <div style={{ display:'flex', align:'center', gap:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:5, color:'var(--primary)', fontWeight:700, fontSize:'1.1rem' }}>
            <Timer size={16} />{formatDuration(duration)}
          </div>
          <button className="btn" onClick={() => setSelectedDay(null)} style={{ fontSize:'0.78rem', padding:'4px 10px' }}>
            ← Terug
          </button>
        </div>
      </div>

      {/* Rest timer overlay */}
      {restTimer && (
        <div style={{ background:'var(--surface)', border:'2px solid var(--primary)', borderRadius:12, padding:16, marginBottom:16, textAlign:'center' }}>
          <div style={{ fontSize:'0.8rem', fontWeight:600, color:'var(--text-muted)', marginBottom:4 }}>RUSTTIMER</div>
          <RestTimer seconds={restTimer.seconds} onDone={() => setRestTimer(null)} />
        </div>
      )}

      {/* Exercises */}
      {(selectedDay.exercises || []).map((pe, idx) => {
        const ex = pe.exercise
        const peSets = sets[pe.id] || []
        const isOpen = openEx === pe.id

        return (
          <div key={pe.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, marginBottom:10, overflow:'hidden' }}>
            {/* Exercise header */}
            <button onClick={() => setOpenEx(isOpen ? null : pe.id)}
              style={{ width:'100%', background:'none', border:'none', cursor:'pointer', padding:'10px 14px', display:'flex', alignItems:'center', gap:10, textAlign:'left' }}>
              <div style={{ width:28, height:28, borderRadius:6, background:'var(--primary)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.8rem', fontWeight:700, flexShrink:0 }}>
                {idx+1}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:'0.88rem', color:'var(--text)' }}>{ex?.name || `Oefening #${pe.exercise_id}`}</div>
                <div style={{ color:'var(--text-muted)', fontSize:'0.73rem', marginTop:1 }}>
                  {pe.sets} sets × {pe.reps} reps · {pe.rest_seconds}s rust
                  {ex?.bunny_video_id && <span style={{ marginLeft:6, color:'#92400e' }}><Video size={10} style={{ verticalAlign:'middle' }} /> video</span>}
                </div>
              </div>
              {isOpen ? <ChevronUp size={14} style={{ color:'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color:'var(--text-muted)' }} />}
            </button>

            {isOpen && (
              <div style={{ borderTop:'1px solid var(--border)', padding:'10px 14px' }}>
                {/* Video embed */}
                {ex?.bunny_video_id && bunnyLibraryId && (
                  <div style={{ position:'relative', paddingTop:'42%', borderRadius:8, overflow:'hidden', background:'#000', marginBottom:12 }}>
                    <iframe
                      src={`https://iframe.mediadelivery.net/embed/${bunnyLibraryId}/${ex.bunny_video_id}?autoplay=false`}
                      style={{ position:'absolute', inset:0, width:'100%', height:'100%', border:'none' }}
                      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                      allowFullScreen loading="lazy"
                    />
                  </div>
                )}

                {/* Instructions */}
                {ex?.instructions && Array.isArray(ex.instructions) && ex.instructions.length > 0 && (
                  <div style={{ background:'var(--bg)', borderRadius:8, padding:'8px 12px', marginBottom:12 }}>
                    <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-muted)', marginBottom:5, textTransform:'uppercase' }}>Uitvoering</div>
                    <ol style={{ margin:0, paddingLeft:16 }}>
                      {ex.instructions.map((s,i) => <li key={i} style={{ fontSize:'0.8rem', marginBottom:2 }}>{s}</li>)}
                    </ol>
                  </div>
                )}

                {/* Sets */}
                <div>
                  <div style={{ display:'grid', gridTemplateColumns:'32px 1fr 1fr 80px', gap:6, marginBottom:4, fontSize:'0.72rem', color:'var(--text-muted)', fontWeight:600, padding:'0 2px' }}>
                    <span>Set</span><span>Reps</span><span>Gewicht (kg)</span><span></span>
                  </div>
                  {peSets.map((s, si) => (
                    <div key={si} style={{ display:'grid', gridTemplateColumns:'32px 1fr 1fr 80px', gap:6, marginBottom:5, alignItems:'center' }}>
                      <div style={{ width:28, height:28, borderRadius:6, background:'var(--bg)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.8rem', fontWeight:700, color:'var(--text-muted)' }}>
                        {si+1}
                      </div>
                      <input
                        type="number" min="0" placeholder="reps"
                        value={s.reps} onChange={e => updateSet(pe.id, si, 'reps', e.target.value)}
                        style={{ padding:'6px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:'0.85rem', background:'var(--bg)', color:'var(--text)', width:'100%', boxSizing:'border-box' }}
                      />
                      <input
                        type="number" min="0" step="0.5" placeholder="kg"
                        value={s.weight} onChange={e => updateSet(pe.id, si, 'weight', e.target.value)}
                        style={{ padding:'6px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:'0.85rem', background:'var(--bg)', color:'var(--text)', width:'100%', boxSizing:'border-box' }}
                      />
                      <button className="btn btn-primary" onClick={() => setRestTimer({ seconds: pe.rest_seconds, peId: pe.id })}
                        style={{ padding:'5px 8px', fontSize:'0.73rem', display:'flex', alignItems:'center', gap:3 }}>
                        <Timer size={11} />Rust
                      </button>
                    </div>
                  ))}
                  <div style={{ display:'flex', gap:6, marginTop:4 }}>
                    <button className="btn" onClick={() => addSet(pe.id)} style={{ fontSize:'0.75rem', padding:'4px 10px', display:'flex', alignItems:'center', gap:3 }}>
                      <Plus size={11} />Set
                    </button>
                    {peSets.length > 1 && (
                      <button className="btn" onClick={() => removeSet(pe.id)} style={{ fontSize:'0.75rem', padding:'4px 10px', display:'flex', alignItems:'center', gap:3 }}>
                        <Minus size={11} />Verwijder
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Notes + save */}
      <div style={{ marginTop:16 }}>
        <label style={{ fontSize:'0.8rem', fontWeight:600, display:'block', marginBottom:6 }}>Notities (optioneel)</label>
        <textarea rows={2} placeholder="Hoe voelde de workout?" value={notes} onChange={e=>setNotes(e.target.value)}
          style={{ width:'100%', padding:'8px 10px', border:'1px solid var(--border)', borderRadius:8, fontSize:'0.85rem', background:'var(--bg)', color:'var(--text)', resize:'vertical', boxSizing:'border-box', marginBottom:12 }} />
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}
          style={{ display:'flex', alignItems:'center', gap:6, fontSize:'0.9rem', padding:'10px 20px' }}>
          <Save size={15} />{saving ? 'Opslaan...' : 'Workout opslaan'}
        </button>
      </div>
    </div>
  )
}
