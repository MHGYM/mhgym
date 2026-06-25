import { PlayCircle, Lock, Mail } from 'lucide-react'

export default function AccessGate() {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:400, textAlign:'center', padding:32 }}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, padding:'48px 40px', maxWidth:480 }}>
        <div style={{ width:64, height:64, borderRadius:'50%', background:'var(--primary-muted,#ede9fe)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
          <Lock size={28} style={{ color:'var(--primary)' }} />
        </div>
        <h2 style={{ margin:'0 0 10px', fontSize:'1.3rem' }}>Online Trainingen</h2>
        <p style={{ color:'var(--text-muted)', marginBottom:24, lineHeight:1.6 }}>
          Je hebt nog geen actief trainingsabonnement. Neem contact op met de gym om toegang te krijgen tot het trainingsplatform.
        </p>
        <div style={{ display:'flex', alignItems:'center', gap:8, justifyContent:'center', color:'var(--text-muted)', fontSize:'0.85rem' }}>
          <Mail size={15} />
          <span>Vraag je trainer of de admin om toegang te verlenen.</span>
        </div>

        <div style={{ marginTop:28, padding:'16px 20px', background:'var(--bg)', borderRadius:10, textAlign:'left' }}>
          <div style={{ fontSize:'0.78rem', fontWeight:700, color:'var(--text-muted)', marginBottom:10, textTransform:'uppercase', letterSpacing:'.05em' }}>Wat zit inbegrepen?</div>
          {[
            'Trainingsprogramma\'s op maat (vetverbranding, spiermassa, kracht, HIIT)',
            'Video-instructies per oefening',
            'Workout-logger met settracker en rusttimer',
            'Persoonlijke records & voortgangsgrafieken',
            'Voedingsplannen afgestemd op je doel',
          ].map((item, i) => (
            <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8, fontSize:'0.83rem', color:'var(--text)', marginBottom:6 }}>
              <PlayCircle size={14} style={{ color:'var(--primary)', marginTop:2, flexShrink:0 }} />
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
