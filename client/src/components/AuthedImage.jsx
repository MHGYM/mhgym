import { useState, useEffect } from 'react'
import { Camera } from 'lucide-react'
import api from '../api'

/**
 * Laadt een afbeelding via een geauthenticeerde API-call (JWT in header) i.p.v.
 * een kale <img src>, omdat de meetresultaat-endpoints achter `authenticate`
 * zitten en dus geen publieke URL hebben.
 */
export default function AuthedImage({ src, alt, style, onClick }) {
  const [url, setUrl] = useState(null)

  useEffect(() => {
    let objectUrl
    let cancelled = false
    setUrl(null)
    api.get(src, { responseType: 'blob' }).then(r => {
      if (cancelled) return
      objectUrl = URL.createObjectURL(r.data)
      setUrl(objectUrl)
    }).catch(() => {})
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [src])

  if (!url) {
    return (
      <div style={{ ...style, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Camera size={16} style={{ color: 'var(--text-muted)' }} />
      </div>
    )
  }
  return <img src={url} alt={alt} style={style} onClick={onClick} />
}
