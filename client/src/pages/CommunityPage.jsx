import { useState, useEffect, useRef } from 'react'
import { Heart, MessageCircle, Pin, Crown, Plus, X, Trash2, Send } from 'lucide-react'
import api from '../api'
import { useAuth } from '../context/AuthContext'

const POST_TYPES = [
  { value: 'admin_news',         label: '📰 Nieuws',         admin: true  },
  { value: 'admin_announcement', label: '📢 Aankondiging',   admin: true  },
  { value: 'admin_action',       label: '⚡ Actie',          admin: true  },
  { value: 'admin_motivation',   label: '💪 Motivatie',      admin: true  },
  { value: 'member_result',      label: '🏆 Resultaat',      admin: false },
  { value: 'member_progress',    label: '📈 Voortgang',      admin: false },
  { value: 'member_photo',       label: '📸 Foto',           admin: false },
  { value: 'member',             label: '💬 Bericht',        admin: false },
]

function timeAgo(isoStr) {
  const s = (Date.now() - new Date(isoStr)) / 1000
  if (s < 60)   return 'Zojuist'
  if (s < 3600) return `${Math.floor(s/60)} min geleden`
  if (s < 86400) return `${Math.floor(s/3600)} uur geleden`
  if (s < 604800) return `${Math.floor(s/86400)} dagen geleden`
  return new Date(isoStr).toLocaleDateString('nl-NL', { day:'numeric', month:'long' })
}

function PostCard({ post, onLike, onDelete, onPin, currentUser }) {
  const [showComments, setShowComments] = useState(false)
  const [comments,     setComments]     = useState([])
  const [newComment,   setNewComment]   = useState('')
  const [posting,      setPosting]      = useState(false)

  const isAdmin  = currentUser?.role === 'admin'
  const isOwn    = post.user_id === currentUser?.id
  const isAdminPost = post.author_role === 'admin'

  const typeInfo = POST_TYPES.find(t => t.value === post.type) || POST_TYPES[POST_TYPES.length - 1]

  const loadComments = async () => {
    const r = await api.get(`/community/${post.id}/comments`)
    setComments(r.data.comments)
  }

  const toggleComments = async () => {
    if (!showComments) await loadComments()
    setShowComments(s => !s)
  }

  const submitComment = async () => {
    if (!newComment.trim()) return
    setPosting(true)
    try {
      const r = await api.post(`/community/${post.id}/comments`, { body: newComment })
      setComments(c => [...c, r.data.comment])
      setNewComment('')
    } catch (e) { alert(e.response?.data?.error || 'Fout') }
    setPosting(false)
  }

  const deleteComment = async (cid) => {
    await api.delete(`/community/${post.id}/comments/${cid}`)
    setComments(c => c.filter(x => x.id !== cid))
  }

  return (
    <div className={`community-card${post.pinned ? ' pinned' : ''}`}>
      {/* Header */}
      <div className="community-card-header">
        <div className="community-avatar">
          {(post.first_name?.[0] || '?') + (post.last_name?.[0] || '')}
        </div>
        <div className="community-author-info">
          <div className="community-author-name">
            {post.first_name} {post.last_name}
            {isAdminPost && <Crown size={13} style={{ color:'var(--accent)', marginLeft:5 }}/>}
          </div>
          <div className="community-meta">
            <span className="community-type-badge">{typeInfo.label}</span>
            <span style={{ color:'var(--text-muted)', fontSize:'0.78rem' }}>{timeAgo(post.created_at)}</span>
          </div>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:'0.25rem' }}>
          {post.pinned && <Pin size={14} style={{ color:'var(--accent)', marginTop:2 }}/>}
          {isAdmin && (
            <button className="btn-icon" title="Vastzetten" onClick={() => onPin(post.id, !post.pinned)}>
              <Pin size={15}/>
            </button>
          )}
          {(isOwn || isAdmin) && (
            <button className="btn-icon" title="Verwijderen" onClick={() => onDelete(post.id)}>
              <Trash2 size={15}/>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {post.title && <h3 className="community-post-title">{post.title}</h3>}
      <p className="community-post-body">{post.body}</p>
      {post.image_url && (
        <img src={post.image_url} alt="Post afbeelding"
          style={{ width:'100%', borderRadius:'var(--r)', marginTop:'0.75rem', maxHeight:300, objectFit:'cover' }}/>
      )}

      {/* Actions */}
      <div className="community-actions">
        <button
          className={`community-action-btn${post.i_liked ? ' liked' : ''}`}
          onClick={() => onLike(post.id)}
        >
          <Heart size={16} fill={post.i_liked ? 'var(--error)' : 'none'} color={post.i_liked ? 'var(--error)' : 'currentColor'}/>
          {post.like_count > 0 && <span>{post.like_count}</span>}
          Like
        </button>
        <button className="community-action-btn" onClick={toggleComments}>
          <MessageCircle size={16}/>
          {post.comment_count > 0 && <span>{post.comment_count}</span>}
          Reacties
        </button>
      </div>

      {/* Comments */}
      {showComments && (
        <div className="community-comments">
          {comments.map(c => (
            <div key={c.id} className="community-comment">
              <div className="community-comment-avatar">
                {(c.first_name?.[0] || '?')}
              </div>
              <div style={{ flex:1 }}>
                <span className="community-comment-author">
                  {c.first_name} {c.last_name}
                  {c.author_role === 'admin' && <Crown size={11} style={{ color:'var(--accent)', marginLeft:4 }}/>}
                </span>
                <span className="community-comment-time"> · {timeAgo(c.created_at)}</span>
                <p className="community-comment-body">{c.body}</p>
              </div>
              {(c.user_id === currentUser?.id || currentUser?.role === 'admin') && (
                <button className="btn-icon" style={{ flexShrink:0 }} onClick={() => deleteComment(c.id)}>
                  <X size={13}/>
                </button>
              )}
            </div>
          ))}

          {/* Comment input */}
          <div className="community-comment-form">
            <input
              className="input" style={{ flex:1, padding:'0.45rem 0.75rem', fontSize:'0.875rem' }}
              placeholder="Schrijf een reactie…"
              value={newComment} onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitComment()}
            />
            <button className="btn btn-primary btn-sm" onClick={submitComment} disabled={posting || !newComment.trim()}>
              <Send size={14}/>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CommunityPage() {
  const { user } = useAuth()
  const isAdmin  = user?.role === 'admin'

  const [posts,      setPosts]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [formType,   setFormType]   = useState(isAdmin ? 'admin_news' : 'member_result')
  const [formTitle,  setFormTitle]  = useState('')
  const [formBody,   setFormBody]   = useState('')
  const [formImage,  setFormImage]  = useState('')
  const [formPush,   setFormPush]   = useState(false)
  const [posting,    setPosting]    = useState(false)
  const [postError,  setPostError]  = useState('')

  const availableTypes = POST_TYPES.filter(t => isAdmin ? true : !t.admin)

  useEffect(() => { loadPosts() }, [])

  const loadPosts = async () => {
    setLoading(true)
    try {
      const r = await api.get('/community?limit=30')
      setPosts(r.data.posts)
    } catch (_) {}
    setLoading(false)
  }

  const handleLike = async (postId) => {
    const r = await api.post(`/community/${postId}/like`)
    setPosts(prev => prev.map(p =>
      p.id === postId
        ? { ...p, i_liked: r.data.liked, like_count: p.like_count + (r.data.liked ? 1 : -1) }
        : p
    ))
  }

  const handleDelete = async (postId) => {
    if (!confirm('Weet je zeker dat je dit bericht wilt verwijderen?')) return
    await api.delete(`/community/${postId}`)
    setPosts(prev => prev.filter(p => p.id !== postId))
  }

  const handlePin = async (postId, pinned) => {
    await api.put(`/community/${postId}/pin`, { pinned })
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, pinned } : p)
      .sort((a, b) => b.pinned - a.pinned || new Date(b.created_at) - new Date(a.created_at))
    )
  }

  const submitPost = async () => {
    setPostError('')
    if (!formBody.trim()) { setPostError('Tekst is verplicht.'); return }
    setPosting(true)
    try {
      const r = await api.post('/community', {
        type: formType, title: formTitle || undefined,
        body: formBody, image_url: formImage || undefined,
        send_push: formPush,
      })
      setPosts(prev => [r.data.post, ...prev])
      setShowForm(false)
      setFormTitle(''); setFormBody(''); setFormImage(''); setFormPush(false)
    } catch (e) { setPostError(e.response?.data?.error || 'Fout bij plaatsen.') }
    setPosting(false)
  }

  return (
    <div className="page community-page">
      <div className="page-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1>Community 🏋️</h1>
          <p>Deel je voortgang, resultaten en nieuws</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>
          {showForm ? <X size={16}/> : <Plus size={16}/>}
          {showForm ? 'Annuleren' : 'Nieuw bericht'}
        </button>
      </div>

      {/* Nieuw bericht form */}
      {showForm && (
        <div className="card" style={{ marginBottom:'1.5rem' }}>
          <h3 style={{ marginBottom:'1rem' }}>Nieuw bericht</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
              <div>
                <label className="input-label">Type</label>
                <select className="input" value={formType} onChange={e => setFormType(e.target.value)}>
                  {availableTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Titel (optioneel)</label>
                <input className="input" value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Titel…"/>
              </div>
            </div>
            <div>
              <label className="input-label">Bericht</label>
              <textarea className="input" rows={4} value={formBody} onChange={e => setFormBody(e.target.value)} placeholder="Schrijf hier je bericht…" style={{ resize:'vertical' }}/>
            </div>
            <div>
              <label className="input-label">Afbeelding URL (optioneel)</label>
              <input className="input" value={formImage} onChange={e => setFormImage(e.target.value)} placeholder="https://…"/>
            </div>
            {isAdmin && (
              <label style={{ display:'flex', alignItems:'center', gap:'0.5rem', cursor:'pointer', fontSize:'0.875rem' }}>
                <input type="checkbox" checked={formPush} onChange={e => setFormPush(e.target.checked)}/>
                Push notificatie sturen naar alle leden
              </label>
            )}
            {postError && <p style={{ color:'var(--error)', fontSize:'0.85rem' }}>{postError}</p>}
            <div style={{ display:'flex', gap:'0.75rem' }}>
              <button className="btn btn-primary" onClick={submitPost} disabled={posting}>
                {posting ? 'Bezig…' : 'Plaatsen'}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Annuleren</button>
            </div>
          </div>
        </div>
      )}

      {loading && <p style={{ color:'var(--text-muted)', textAlign:'center', padding:'3rem' }}>Laden…</p>}

      {!loading && posts.length === 0 && (
        <div style={{ textAlign:'center', padding:'4rem 2rem', color:'var(--text-muted)' }}>
          <p style={{ fontSize:'3rem', marginBottom:'1rem' }}>🏋️</p>
          <p>Nog geen berichten. Wees de eerste!</p>
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
        {posts.map(post => (
          <PostCard
            key={post.id} post={post} currentUser={user}
            onLike={handleLike} onDelete={handleDelete} onPin={handlePin}
          />
        ))}
      </div>
    </div>
  )
}
