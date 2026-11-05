import { Outlet } from 'react-router-dom'
import { Footer } from '../components/Footer'
import { Header } from '../components/Header'
import { PatientWorkspaceProvider } from '../lib/patientWorkspace'

export function App() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Перейти до вмісту
      </a>

      <Header />

      <main className="app-main" id="main-content">
        <PatientWorkspaceProvider>
          <Outlet />
        </PatientWorkspaceProvider>
      </main>

      <Footer />
    </div>
  )
}
