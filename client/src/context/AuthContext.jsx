import { createContext, useContext, useState, useCallback } from 'react'
import api from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mhgym_user')) } catch { return null }
  })
  const [membership, setMembership] = useState(null)

  const login = useCallback(async (email, password, user_id) => {
    const { data } = await api.post('/auth/login', { email, password, ...(user_id ? { user_id } : {}) })
    // Profile-picker: meerdere accounts op dit e-mailadres
    if (data.needs_profile_selection) return data
    localStorage.setItem('mhgym_token', data.token)
    localStorage.setItem('mhgym_user', JSON.stringify(data.user))
    setUser(data.user)
    return data
  }, [])

  const register = useCallback(async (payload) => {
    const { data } = await api.post('/auth/register', payload)
    localStorage.setItem('mhgym_token', data.token)
    localStorage.setItem('mhgym_user', JSON.stringify(data.user))
    setUser(data.user)
    return data
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('mhgym_token')
    localStorage.removeItem('mhgym_user')
    setUser(null)
    setMembership(null)
  }, [])

  const refreshUser = useCallback(async () => {
    const { data } = await api.get('/auth/me')
    localStorage.setItem('mhgym_user', JSON.stringify(data.user))
    setUser(data.user)
    setMembership(data.membership)
    return data
  }, [])

  return (
    <AuthContext.Provider value={{ user, membership, setMembership, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
