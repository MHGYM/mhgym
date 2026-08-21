import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import PrivateRoute from './components/PrivateRoute'
import Navbar from './components/Navbar'
import AuthPage from './pages/AuthPage'
import DashboardPage from './pages/DashboardPage'
import SchedulePage from './pages/SchedulePage'
import MembershipsPage from './pages/MembershipsPage'
import ProfilePage from './pages/ProfilePage'
import ShopPage from './pages/ShopPage'
import AdminPage from './pages/AdminPage'
import PersonalTrainingPage from './pages/PersonalTrainingPage'
import AgendaPage from './pages/AgendaPage'
import CommunityPage from './pages/CommunityPage'
import MessagesPage from './pages/MessagesPage'
import InstallPage from './pages/InstallPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import MayaChatWidget from './components/MayaChatWidget'
import TrainingPage from './pages/TrainingPage'
import MijnVoortgangPage from './pages/MijnVoortgangPage'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public */}
        <Route path="/install"        element={<InstallPage />} />
        <Route path="/login"          element={<AuthPage mode="login" />} />
        <Route path="/register"       element={<AuthPage mode="register" />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Protected */}
        <Route element={<PrivateRoute />}>
          <Route element={<Navbar />}>
            <Route path="/dashboard"         element={<DashboardPage />} />
            <Route path="/dashboard/mijn-voortgang" element={<MijnVoortgangPage />} />
            <Route path="/schedule"          element={<SchedulePage />} />
            <Route path="/agenda"            element={<AgendaPage />} />
            <Route path="/community"         element={<CommunityPage />} />
            <Route path="/messages"          element={<MessagesPage />} />
            <Route path="/memberships"       element={<MembershipsPage />} />
            <Route path="/shop"              element={<ShopPage />} />
            <Route path="/personal-training" element={<PersonalTrainingPage />} />
            <Route path="/profile"           element={<ProfilePage />} />
            <Route path="/admin"             element={<AdminPage />} />
            <Route path="/training"          element={<TrainingPage />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <MayaChatWidget />
    </AuthProvider>
  )
}
