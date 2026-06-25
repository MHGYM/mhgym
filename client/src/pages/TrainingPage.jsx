import { useState, useEffect, createContext, useContext } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api'
import { PlayCircle, Dumbbell, TrendingUp, Salad, Users, ListChecks, BookOpen, Utensils } from 'lucide-react'
import AccessGate from './training/AccessGate'
import AdminSubscriptions from './training/AdminSubscriptions'
import ExerciseAdmin from './training/ExerciseAdmin'
import ProgramAdmin from './training/ProgramAdmin'
import ProgramBrowser from './training/ProgramBrowser'
import WorkoutLogger from './training/WorkoutLogger'
import ProgressSection from './training/ProgressSection'
import NutritionSection from './training/NutritionSection'
import NutritionAdmin from './training/NutritionAdmin'

// ── Training config context (bunny library ID) ───────────────────────────────
export const TrainingCtx = createContext({ bunnyLibraryId: '' })
export const useTraining = () => useContext(TrainingCtx)

const MEMBER_TABS = [
  { key: 'programs',  label: "Programma's", Icon: PlayCircle  },
  { key: 'workout',   label: 'Workout',      Icon: Dumbbell    },
  { key: 'progress',  label: 'Voortgang',    Icon: TrendingUp  },
  { key: 'nutrition', label: 'Voeding',      Icon: Salad       },
]

const ADMIN_TABS = [
  { key: 'programs',        label: "Programma's", Icon: PlayCircle  },
  { key: 'workout',         label: 'Workout',      Icon: Dumbbell    },
  { key: 'progress',        label: 'Voortgang',    Icon: TrendingUp  },
  { key: 'nutrition',       label: 'Voeding',      Icon: Salad       },
  { key: 'admin-sub',       label: 'Abonnementen', Icon: Users       },
  { key: 'admin-exercises', label: 'Oefeningen',   Icon: ListChecks  },
  { key: 'admin-programs',  label: 'Prog. beheer', Icon: BookOpen    },
  { key: 'admin-nutrition', label: 'Voeding beh.', Icon: Utensils    },
]

export default function TrainingPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [access, setAccess]   = useState(null)
  const [config, setConfig]   = useState({ bunnyLibraryId: '' })
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState(isAdmin ? 'admin-sub' : 'programs')

  useEffect(() => {
    Promise.all([
      api.get('/training/access').then(r => r.data).catch(() => ({ has_access: false, access: null })),
      api.get('/training/config').then(r => r.data).catch(() => ({ bunny_library_id: '' })),
    ]).then(([acc, cfg]) => {
      setAccess(acc)
      setConfig({ bunnyLibraryId: cfg.bunny_library_id || '' })
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:300 }}>
      <div style={{ textAlign:'center', color:'var(--text-muted)' }}>
        <PlayCircle size={40} style={{ marginBottom:12, opacity:.5 }} />
        <div>Trainingen laden...</div>
      </div>
    </div>
  )

  if (!isAdmin && !access?.has_access) return <AccessGate />

  const tabs = isAdmin ? ADMIN_TABS : MEMBER_TABS

  return (
    <TrainingCtx.Provider value={config}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 0 80px' }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' }}>
          <h1 style={{ display:'flex', alignItems:'center', gap:8, margin:0, fontSize:'1.4rem' }}>
            <PlayCircle size={22} style={{ color:'var(--primary)' }} />
            Online Trainingen
          </h1>
          {!isAdmin && access?.access && (
            <span style={{ background:'var(--success-bg,#d1fae5)', color:'var(--success,#059669)', borderRadius:99, padding:'2px 10px', fontSize:'0.75rem', fontWeight:600 }}>
              Actief {access.access.end_date
                ? `t/m ${new Date(access.access.end_date).toLocaleDateString('nl-NL')}`
                : '(geen einddatum)'}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:20, borderBottom:'1px solid var(--border)', paddingBottom:4 }}>
          {tabs.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                display:'flex', alignItems:'center', gap:6,
                padding:'6px 14px', border:'none', borderRadius:'6px 6px 0 0',
                cursor:'pointer', fontSize:'0.82rem', fontWeight: tab===key ? 700 : 500,
                background: tab===key ? 'var(--primary)' : 'transparent',
                color: tab===key ? '#fff' : 'var(--text-muted)',
                borderBottom: tab===key ? '2px solid var(--primary)' : '2px solid transparent',
                transition:'all .15s',
              }}
            >
              <Icon size={13} />{label}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === 'programs'         && <ProgramBrowser />}
        {tab === 'workout'          && <WorkoutLogger />}
        {tab === 'progress'         && <ProgressSection />}
        {tab === 'nutrition'        && <NutritionSection />}
        {tab === 'admin-sub'        && <AdminSubscriptions />}
        {tab === 'admin-exercises'  && <ExerciseAdmin />}
        {tab === 'admin-programs'   && <ProgramAdmin />}
        {tab === 'admin-nutrition'  && <NutritionAdmin />}
      </div>
    </TrainingCtx.Provider>
  )
}
