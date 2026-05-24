import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Dumbbell, LayoutDashboard, Calendar, CreditCard, UserCircle, LogOut, ShoppingBag, Shield, Zap, Users2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

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
    ...(user?.role === 'admin' ? [{ to: '/admin', label: 'Admin', Icon: Shield }] : []),
  ]

  // Mobile bottom nav (always 5 items)
  const BOTTOM_LINKS = [
    { to: '/dashboard',  label: 'Dashboard',  Icon: LayoutDashboard },
    { to: '/agenda',     label: 'Agenda',      Icon: Calendar        },
    { to: '/community',  label: 'Community',   Icon: Users2          },
    { to: '/profile',    label: 'Profiel',     Icon: UserCircle      },
    ...(user?.role === 'admin'
      ? [{ to: '/admin', label: 'Admin', Icon: Shield }]
      : [{ to: '/personal-training', label: 'PT', Icon: Zap }]
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
          {TOP_LINKS.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <Icon size={14} />
              {label}
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
        {BOTTOM_LINKS.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}>
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  )
}
