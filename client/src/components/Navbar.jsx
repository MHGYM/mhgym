import { useState, useEffect, useRef } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Dumbbell, LayoutDashboard, Calendar, CreditCard, UserCircle, LogOut, ShoppingBag, Shield, Zap, Users2, MessageCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [unread, setUnread] = useState(0)
  const pollRef = useRef(null)

  useEffect(() => {
    if (!user) return
    const fetchUnread = async () => {
      try {
        if (user.role === 'admin') {
          const r = await api.get('/admin/messages/unread-count')
          setUnread(r.data.unread || 0)
        } else {
          // Leden: tel ongelezen admin-berichten (niet read_at)
          const r = await api.get('/messages')
          const msgs = r.data.messages || []
          setUnread(msgs.filter(m => m.sender === 'admin' && !m.read_at).length)
        }
      } catch (_) {}
    }
    fetchUnread()
    pollRef.current = setInterval(fetchUnread, 30_000)
    return () => clearInterval(pollRef.current)
  }, [user])

  const initials = user
    ? `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase()
    : 'MH'

  const handleLogout = () => { logout(); navigate('/login') }

  // Desktop nav links (top bar)
  const TOP_LINKS = [
    { to: '/dashboard',         label: 'Dashboard',    Icon: LayoutDashboard },
    { to: '/schedule',          label: 'Lessen',        Icon: Calendar        },
    { to: '/agenda',            label: 'Agenda',         Icon: Calendar        },
    { to: '/community',         label: 'Community',      Icon: Users2          },
    { to: '/personal-training', label: 'PT',             Icon: Zap             },
    { to: '/memberships',       label: 'Lidmaatschap',  Icon: CreditCard      },
    { to: '/shop',              label: 'Winkel',         Icon: ShoppingBag     },
    { to: '/profile',           label: 'Profiel',        Icon: UserCircle      },
    { to: '/messages',          label: 'Berichten',      Icon: MessageCircle, badge: unread },
    ...(user?.role === 'admin' ? [{ to: '/admin', label: 'Admin', Icon: Shield }] : []),
  ]

  // Mobile bottom nav (always 5 items)
  const BOTTOM_LINKS = [
    { to: '/dashboard',  label: 'Dashboard',  Icon: LayoutDashboard },
    { to: '/agenda',     label: 'Agenda',      Icon: Calendar        },
    { to: '/messages',   label: 'Berichten',   Icon: MessageCircle, badge: unread },
    { to: '/community',  label: 'Community',   Icon: Users2          },
    ...(user?.role === 'admin'
      ? [{ to: '/admin', label: 'Admin', Icon: Shield }]
      : [{ to: '/profile', label: 'Profiel', Icon: UserCircle }]
    ),
  ]

  return (
    <>
      {/* ── Top navbar (desktop) ── */}
      <nav className="navbar">
        <div className="navbar-logo">
          <Dumbbell size={22} className="logo-icon" />
          <span className="logo-text"><span className="logo-accent">MH</span>GYM</span>
        </div>

        <div className="navbar-links">
          {TOP_LINKS.map(({ to, label, Icon, badge }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} style={{ position:'relative' }}>
              <Icon size={14} />
              {label}
              {badge > 0 && (
                <span style={{ position:'absolute', top:2, right:2, minWidth:16, height:16, borderRadius:99, background:'var(--error,#ef4444)', color:'#fff', fontSize:'0.62rem', fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px', lineHeight:1 }}>
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </NavLink>
          ))}
        </div>

        <div className="navbar-user">
          <div className="user-avatar">{initials}</div>
          <span className="user-name hide-mobile">{user?.first_name}</span>
          <button className="btn-icon" onClick={handleLogout} title="Uitloggen">
            <LogOut size={17} />
          </button>
        </div>
      </nav>

      {/* ── Page content ── */}
      <main className="app-content">
        <Outlet />
      </main>

      {/* ── Bottom nav (mobile only) ── */}
      <nav className="bottom-nav">
        {BOTTOM_LINKS.map(({ to, label, Icon, badge }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`} style={{ position:'relative' }}>
            <Icon size={20} />
            {badge > 0 && (
              <span style={{ position:'absolute', top:4, right:'calc(50% - 14px)', minWidth:15, height:15, borderRadius:99, background:'var(--error,#ef4444)', color:'#fff', fontSize:'0.6rem', fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 2px', lineHeight:1 }}>
                {badge > 9 ? '9+' : badge}
              </span>
            )}
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  )
}
