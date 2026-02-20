import React, { useState } from 'react'
import Sidebar from './components/layout/Sidebar'
import TopBar from './components/layout/TopBar'
import DashboardPage from './pages/DashboardPage'
import './App.css'

export default function App() {
  const [activePage, setActivePage] = useState('overview')

  return (
    <div className="app-shell">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <div className="app-main">
        <TopBar />
        <div className="app-content">
          <DashboardPage activePage={activePage} />
        </div>
      </div>
    </div> 
  )
}