import React, { useState } from 'react'
import {
  LayoutDashboard,
  Star,
  Search,
  Settings,
  History,
  Bell,
  Maximize2,
  ChevronDown
} from 'lucide-react'
import '../../styles/TopBar.css'

export default function TopBar() {
  const [searchVal, setSearchVal] = useState('')

  return (
    <header className="topbar">
      {/* Left: Breadcrumb / Dashboard label */}
      <div className="topbar-left">
        <button className="topbar-icon-btn">
          <LayoutDashboard size={16} />
        </button>
        <button className="topbar-icon-btn">
          <Star size={16} />
        </button>
        <span className="topbar-separator">/</span>
        <span className="topbar-section">Dashboards</span>
        <span className="topbar-separator">/</span>
        <span className="topbar-active">Default</span>
      </div>

      {/* Center: Search */}
      <div className="topbar-search">
        <Search size={14} className="topbar-search-icon" />
        <input
          className="topbar-search-input"
          type="text"
          placeholder="Search"
          value={searchVal}
          onChange={e => setSearchVal(e.target.value)}
        />
        <kbd className="topbar-search-kbd">/</kbd>
      </div>

      {/* Right: Actions */}
      <div className="topbar-right">
        <button className="topbar-icon-btn">
          <Settings size={16} />
        </button>
        <button className="topbar-icon-btn">
          <History size={16} />
        </button>
        <button className="topbar-icon-btn topbar-notif-btn">
          <Bell size={16} />
          <span className="topbar-notif-dot" />
        </button>
        <button className="topbar-icon-btn">
          <Maximize2 size={16} />
        </button>
      </div>
    </header>
  )
}