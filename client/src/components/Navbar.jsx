import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Dumbbell, LayoutDashboard, Calendar, CreditCard, UserCircle, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const NAV_LINKS = [
  { to: '/dashboard',   label: 'Dashboard',    Icon: LayoutDashboard },
  { to: '/schedule',    label: 'Lessen',        Icon: Calendar },
  { to: '/memberships', label: 'Lidmaatschap',  Icon: CreditCard },
  { to: '/profile',     label: 'Profiel',       Icon: UserCircle },
]

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const initials = user
    ? `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase()
    : 'MH'

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <>
      <nav className="navbar">
        {/* Logo */}
        <div className="navbar-logo">
          <Dumbbell size={22} className="logo-icon" />
          <span className="logo-text">
            <span className="logo-accent">MH</span>GYM
          </span>
        </div>

        {/* Nav links */}
        <div className="navbar-links">
          {NAV_LINKS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
        </div>

        {/* User section */}
        <div className="navbar-user">
          <div className="user-avatar">{initials}</div>
          <span className="user-name">{user?.first_name}</span>
          <button className="btn-icon" onClick={handleLogout} title="Uitloggen">
            <LogOut size={17} />
          </button>
        </div>
      </nav>

      <main className="app-content">
        <Outlet />
      </main>
    </>
  )
}
