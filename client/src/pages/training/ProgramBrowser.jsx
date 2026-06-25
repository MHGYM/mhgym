import { useState, useEffect } from 'react'
import { PlayCircle, ChevronLeft, Dumbbell, Clock, Calendar, Target, Video, BedDouble, CheckCircle } from 'lucide-react'
import api from '../../api'
import { useTraining } from '../../context/TrainingContext'

const GOAL_LABEL = { vetverbranding:'Vetverbranding', spiermassa:'Spiermassa', kracht:'Kracht', hiit:'HIIT', full_body:'Full body', splits:'Splits', thuis:'Thuis' }
const GOAL_COLOR = { vetverbranding:'#ef4444', spiermassa:'#3b82f6', kracht:'#8b5cf6', hiit:'#f59e0b', full_body:'#10b981', splits:'#ec4899', thuis:'#6366f1' }
const DIFF_COLOR = { beginner:'#10b981', intermediate:'#f59e0b', advanced:'#ef4444' }

function BunnyEmbed({ videoId, libraryId }) {
  if (!videoId) return null
  if (!libraryId) return (
    <div style={{ background:'#1e1e2e', borderRadius:8, padding:16, textAlign:'center', color:'#f59e0b', fontSize:'0.78rem', marginBottom:12 }}>
      Video niet beschikbaar (BUNNY_LIBRARY_ID ontbreekt in omgeving)
    </div>
  )
  return (
    <div style={{ position:'relative', paddingTop:'56.25%', borderRadius:8, overflow:'hidden', background:'#000', marginBottom:12 }}>
      <iframe
        src={`https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}?autoplay=false`}
        style={{ position:'absolute', inset:0, width:'100%', height:'100%', border:'none' }}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        loading="lazy"
      />
    </div>
  )
}

export default function ProgramBrowser() {
  const { bunnyLibraryId } = useTraining()
  const [programs, setPrograms]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState(null)    // full program with days
  const [openDay, setOpenDay]       = useState(null)
  const [starting, setStarting]     = useState(false)
  const [myProgram, setMyProgram]   = useState(null)
  const [goalFilter, setGoalFilter] = useState('')

  useEffect(() => {
    Promise.all([
      api.get('/training/programs').then(r => r.data.programs),
      api.get('/training/my/program').then(r => r.data.user_program).catch(() => null),
    ]).then(([progs, mp]) => { setPrograms(progs); setMyProgram(mp); setLoading(false) })
  }, [])

  const openProgram = async (id) => {
    const r = await api.get(`/training/programs/${id}`)
    setSelected(r.data.program)
    setOpenDay(null)
  }

  const startProgram = async (programId) => {
    setStarting(true)
    try {
      await api.post('/training/my/program', { program_id: programId })
      const mp = await api.get('/training/my/program').then(r => r.data.user_program)
      setMyProgram(mp)
      alert('Programma gestart! Ga naar het Workout-tabblad om je eerste sessie te loggen.')
    } catch(e) { alert(e.response?.data?.error || 'Fout bij starten.') }
    finally { setStarting(false) }
  }

  const filteredPrograms = goalFilter ? programs.filter(p => p.goal === goalFilter) : programs

  if (loading) return <div style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>Laden...</div>

  // Program detail view
  if (selected) {
    const goalColor = GOAL_COLOR[selected.goal] || '#6366f1'
    const isActive  = myProgram?.program_id === selected.id
    return (
      <div>
        <button className="btn" onClick={() => setSelected(null)} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:16, fontSize:'0.82rem' }}>
          <ChevronLeft size={14} />Terug naar overzicht
        </button>

        {/* Program header */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:24, marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap:16, flexWrap:'wrap' }}>
            <div style={{ flex:1, minWidth:200 }}>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
                <span style={{ background: goalColor + '22', color: goalColor, borderRadius:99, padding:'2px 10px', fontSize:'0.75rem', fontWeight:700 }}>
                  {GOAL_LABEL[selected.goal] || selected.goal}
                </span>
                <span style={{ background: DIFF_COLOR[selected.difficulty] + '22', color: DIFF_COLOR[selected.difficulty], borderRadius:99, padding:'2px 10px', fontSize:'0.75rem', fontWeight:700 }}>
                  {selected.difficulty}
                </span>
                <span style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:99, padding:'2px 10px', fontSize:'0.75rem', color:'var(--text-muted)' }}>
                  {selected.equipment}
                </span>
              </div>
              <h2 style={{ margin:'0 0 8px', fontSize:'1.3rem' }}>{selected.name}</h2>
              {selected.description && <p style={{ color:'var(--text-muted)', margin:0, fontSize:'0.88rem', lineHeight:1.6 }}>{selected.description}</p>}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[
                { Icon: Calendar, label: 'Duur', value: `${selected.duration_weeks} weken` },
                { Icon: Dumbbell, label: 'Sessies', value: `${selected.sessions_per_week}×/week` },
              ].map(({ Icon, label, value }) => (
                <div key={label} style={{ background:'var(--bg)', borderRadius:8, padding:'10px 14px', textAlign:'center', minWidth:90 }}>
                  <Icon size={18} style={{ color:'var(--primary)', marginBottom:4 }} />
                  <div style={{ fontSize:'0.7rem', color:'var(--text-muted)' }}>{label}</div>
                  <div style={{ fontWeight:700, fontSize:'0.9rem' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {isActive ? (
            <div style={{ marginTop:16, display:'flex', alignItems:'center', gap:8, color:'#059669', fontWeight:600, fontSize:'0.88rem' }}>
              <CheckCircle size={16} />
              Dit is jouw actieve programma. Start een workout in het Workout-tabblad.
            </div>
          ) : (
            <button className="btn btn-primary" onClick={() => startProgram(selected.id)} disabled={starting}
              style={{ marginTop:16, display:'flex', alignItems:'center', gap:6 }}>
              <PlayCircle size={15} />{starting ? 'Starten...' : 'Start dit programma'}
            </button>
          )}
        </div>

        {/* Days */}
        <h3 style={{ fontSize:'0.95rem', marginBottom:12 }}>Trainingen ({selected.days?.length || 0})</h3>
        {(selected.days || []).map(day => (
          <div key={day.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, marginBottom:8, overflow:'hidden' }}>
            <button
              onClick={() => setOpenDay(openDay === day.id ? null : day.id)}
              style={{ width:'100%', background:'none', border:'none', cursor:'pointer', padding:'12px 16px', display:'flex', alignItems:'center', gap:12, textAlign:'left' }}
            >
              <div style={{ width:36, height:36, borderRadius:8, background: day.is_rest_day ? 'var(--bg)' : 'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {day.is_rest_day ? <BedDouble size={16} style={{ color:'var(--text-muted)' }} /> : <Dumbbell size={16} style={{ color:'#fff' }} />}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:'0.9rem', color:'var(--text)' }}>
                  Week {day.week_number}, Dag {day.day_number}: {day.day_name}
                </div>
                {day.focus && <div style={{ color:'var(--text-muted)', fontSize:'0.75rem', marginTop:1 }}>{day.focus}</div>}
                {!day.is_rest_day && <div style={{ color:'var(--text-muted)', fontSize:'0.75rem', marginTop:1 }}>{day.exercises?.length || 0} oefeningen</div>}
              </div>
              <span style={{ color:'var(--text-muted)', fontSize:'0.75rem' }}>{openDay === day.id ? '▲' : '▼'}</span>
            </button>

            {/* Day exercises */}
            {openDay === day.id && !day.is_rest_day && (
              <div style={{ borderTop:'1px solid var(--border)', padding:16 }}>
                {(day.exercises || []).length === 0 ? (
                  <div style={{ color:'var(--text-muted)', fontSize:'0.83rem' }}>Geen oefeningen.</div>
                ) : (
                  day.exercises.map((pe, idx) => {
                    const ex = pe.exercise
                    return (
                      <div key={pe.id} style={{ marginBottom: idx < day.exercises.length-1 ? 20 : 0 }}>
                        <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom: ex?.bunny_video_id ? 10 : 0 }}>
                          <div style={{ width:28, height:28, borderRadius:6, background:'var(--primary)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:'0.8rem', flexShrink:0 }}>
                            {idx + 1}
                          </div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontWeight:600, fontSize:'0.9rem' }}>{ex?.name || `Oefening #${pe.exercise_id}`}</div>
                            <div style={{ display:'flex', gap:12, color:'var(--text-muted)', fontSize:'0.78rem', marginTop:3, flexWrap:'wrap' }}>
                              <span style={{ display:'flex', alignItems:'center', gap:3 }}><Target size={11} />{pe.sets} sets × {pe.reps} reps</span>
                              <span style={{ display:'flex', alignItems:'center', gap:3 }}><Clock size={11} />{pe.rest_seconds}s rust</span>
                              {ex?.difficulty && <span>{ex.difficulty}</span>}
                            </div>
                            {pe.notes && <div style={{ color:'var(--text-muted)', fontSize:'0.78rem', marginTop:4, fontStyle:'italic' }}>{pe.notes}</div>}
                            {ex?.muscle_groups && Array.isArray(ex.muscle_groups) && (
                              <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:5 }}>
                                {ex.muscle_groups.map((mg, i) => (
                                  <span key={i} style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:99, padding:'1px 7px', fontSize:'0.68rem', color:'var(--text-muted)' }}>{mg}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          {ex?.bunny_video_id && (
                            <span style={{ background:'#fef3c7', color:'#92400e', borderRadius:99, padding:'2px 8px', fontSize:'0.68rem', fontWeight:600, flexShrink:0 }}>
                              <Video size={9} style={{ verticalAlign:'middle', marginRight:2 }} />video
                            </span>
                          )}
                        </div>

                        {/* Video embed */}
                        {ex?.bunny_video_id && <BunnyEmbed videoId={ex.bunny_video_id} libraryId={bunnyLibraryId} />}

                        {/* Instructions */}
                        {ex?.instructions && Array.isArray(ex.instructions) && ex.instructions.length > 0 && (
                          <div style={{ background:'var(--bg)', borderRadius:8, padding:'10px 14px', marginTop:4 }}>
                            <div style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--text-muted)', marginBottom:6, textTransform:'uppercase', letterSpacing:'.04em' }}>Uitvoering</div>
                            <ol style={{ margin:0, paddingLeft:18 }}>
                              {ex.instructions.map((step, i) => <li key={i} style={{ fontSize:'0.82rem', marginBottom:3 }}>{step}</li>)}
                            </ol>
                          </div>
                        )}

                        {/* Home alternative */}
                        {ex?.home_alternative_notes && (
                          <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, padding:'8px 12px', marginTop:6, fontSize:'0.78rem', color:'#92400e' }}>
                            <strong>Thuis-alternatief:</strong> {ex.home_alternative_notes}
                          </div>
                        )}

                        {idx < day.exercises.length-1 && <hr style={{ margin:'16px 0', border:'none', borderTop:'1px solid var(--border)' }} />}
                      </div>
                    )
                  })
                )}
              </div>
            )}
            {openDay === day.id && day.is_rest_day && (
              <div style={{ borderTop:'1px solid var(--border)', padding:'12px 16px', color:'var(--text-muted)', fontSize:'0.85rem' }}>
                Rustdag — herstel, stretch of ga wandelen.
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  // Program grid
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <h2 style={{ margin:0, fontSize:'1.1rem' }}>Trainingsprogramma's</h2>
        <select value={goalFilter} onChange={e=>setGoalFilter(e.target.value)}
          style={{ padding:'7px 10px', border:'1px solid var(--border)', borderRadius:6, fontSize:'0.82rem', background:'var(--bg)', color:'var(--text)' }}>
          <option value="">Alle doelen</option>
          {Object.entries(GOAL_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {myProgram && (
        <div style={{ background:'#d1fae5', border:'1px solid #6ee7b7', borderRadius:10, padding:'12px 16px', marginBottom:20, display:'flex', alignItems:'center', gap:10 }}>
          <CheckCircle size={18} style={{ color:'#059669', flexShrink:0 }} />
          <div>
            <div style={{ fontWeight:600, fontSize:'0.88rem', color:'#065f46' }}>Actief programma: {myProgram.program_name}</div>
            <div style={{ fontSize:'0.76rem', color:'#059669' }}>Gestart op {new Date(myProgram.start_date).toLocaleDateString('nl-NL')}</div>
          </div>
          <button className="btn" onClick={() => openProgram(myProgram.program_id)} style={{ marginLeft:'auto', fontSize:'0.78rem', padding:'4px 10px' }}>Bekijk</button>
        </div>
      )}

      {filteredPrograms.length === 0 ? (
        <div style={{ color:'var(--text-muted)', textAlign:'center', padding:48 }}>Nog geen programma's beschikbaar.</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:14 }}>
          {filteredPrograms.map(prog => {
            const goalColor = GOAL_COLOR[prog.goal] || '#6366f1'
            const isActive  = myProgram?.program_id === prog.id
            return (
              <button key={prog.id} onClick={() => openProgram(prog.id)}
                style={{ background:'var(--surface)', border:`1px solid ${isActive ? '#6ee7b7' : 'var(--border)'}`, borderRadius:12, padding:0, cursor:'pointer', textAlign:'left', overflow:'hidden', transition:'box-shadow .15s',
                  boxShadow: isActive ? '0 0 0 2px #6ee7b7' : 'none' }}>
                {prog.thumbnail_url ? (
                  <img src={prog.thumbnail_url} alt={prog.name} style={{ width:'100%', height:120, objectFit:'cover' }} />
                ) : (
                  <div style={{ height:80, background: `${goalColor}22`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Dumbbell size={32} style={{ color: goalColor, opacity:.6 }} />
                  </div>
                )}
                <div style={{ padding:'12px 14px' }}>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:6 }}>
                    <span style={{ background: goalColor+'22', color: goalColor, borderRadius:99, padding:'1px 8px', fontSize:'0.7rem', fontWeight:700 }}>
                      {GOAL_LABEL[prog.goal] || prog.goal}
                    </span>
                    <span style={{ background: DIFF_COLOR[prog.difficulty]+'22', color: DIFF_COLOR[prog.difficulty], borderRadius:99, padding:'1px 8px', fontSize:'0.7rem', fontWeight:700 }}>
                      {prog.difficulty}
                    </span>
                    {isActive && <span style={{ background:'#d1fae5', color:'#059669', borderRadius:99, padding:'1px 8px', fontSize:'0.7rem', fontWeight:700 }}>actief</span>}
                  </div>
                  <div style={{ fontWeight:700, fontSize:'0.95rem', color:'var(--text)', marginBottom:4 }}>{prog.name}</div>
                  {prog.description && (
                    <div style={{ color:'var(--text-muted)', fontSize:'0.78rem', lineHeight:1.4, marginBottom:8,
                      overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
                      {prog.description}
                    </div>
                  )}
                  <div style={{ display:'flex', gap:12, color:'var(--text-muted)', fontSize:'0.73rem' }}>
                    <span><Calendar size={10} style={{ verticalAlign:'middle', marginRight:2 }} />{prog.duration_weeks}w</span>
                    <span><Dumbbell size={10} style={{ verticalAlign:'middle', marginRight:2 }} />{prog.sessions_per_week}×/week</span>
                    <span>{prog.equipment}</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
