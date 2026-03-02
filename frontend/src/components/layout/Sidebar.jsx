import React, { useState } from "react";
import {
  LayoutDashboard,
  MonitorPlay,
  Clock,
  Camera,
  BarChart2,
  Activity,
  SlidersHorizontal,
  Settings,
  FileText,
  ChevronDown,
  ChevronRight,
  Plane,
  Shield,
  Cpu,
  FolderSearch,
} from "lucide-react";
import "../../styles/Sidebar.css";

const NAV_GROUPS = [
  {
    label: "Monitoring",
    items: [
      { id: "overview",       label: "Overview",       icon: LayoutDashboard },
      { id: "live-monitor",   label: "Live Feed",      icon: MonitorPlay },
      { id: "event-timeline", label: "Event Timeline", icon: Clock },
      { id: "fod-snapshots",  label: "FOD Snapshots",  icon: Camera },
    ],
  },
  {
    label: "Analysis",
    items: [
      { id: "detection-stats",  label: "Detection Stats",  icon: BarChart2 },
      { id: "anomaly-trends",   label: "Anomaly Trends",   icon: Activity },
      { id: "inspection-log",   label: "Inspection Log",   icon: FolderSearch },
    ],
  },
  {
    label: "System",
    items: [
      {
        id: "pipeline",
        label: "Pipeline",
        icon: Cpu,
        children: [
          { id: "pipeline-control", label: "Control Panel" },
          { id: "pipeline-config",  label: "Configuration" },
          { id: "pipeline-log",     label: "Run History" },
        ],
      },
      { id: "settings", label: "Settings",  icon: Settings },
      { id: "reports",  label: "Reports",   icon: FileText },
    ],
  },
];

export default function Sidebar({ activePage, onNavigate }) {
  const [expandedItems, setExpandedItems] = useState({});

  const toggleExpand = (id) => {
    setExpandedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <Plane size={14} />
        </div>
        <div className="sidebar-brand-text">
          <span className="sidebar-brand-name">FOD Detection</span>
          <span className="sidebar-brand-sub">Runway Safety Intelligence</span>
        </div>
      </div>

      {/* Status pill */}
      <div className="sidebar-status">
        <span className="sidebar-status-dot" />
        <span className="sidebar-status-label">System Active</span>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="sidebar-group">
            <div className="sidebar-group-label">{group.label}</div>
            {group.items.map((item) => (
              <SidebarItem
                key={item.id}
                item={item}
                activePage={activePage}
                onNavigate={onNavigate}
                expanded={expandedItems[item.id]}
                onToggle={toggleExpand}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-footer-inner">
          <Shield size={12} />
          <span>Runway Safety System</span>
        </div>
      </div>
    </aside>
  );
}

function SidebarItem({ item, activePage, onNavigate, expanded, onToggle }) {
  const Icon = item.icon;
  const hasChildren = item.children && item.children.length > 0;
  const isActive = activePage === item.id;

  return (
    <div className="sidebar-item-wrapper">
      <button
        className={`sidebar-item ${isActive ? "active" : ""}`}
        onClick={() => {
          if (hasChildren) onToggle(item.id);
          else onNavigate?.(item.id);
        }}
      >
        {Icon && (
          <span className="sidebar-item-icon">
            <Icon size={15} />
          </span>
        )}
        <span className="sidebar-item-label">{item.label}</span>
        {hasChildren && (
          <span className="sidebar-item-arrow">
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
        )}
      </button>

      {hasChildren && expanded && (
        <div className="sidebar-children">
          {item.children.map((child) => (
            <button
              key={child.id}
              className={`sidebar-child-item ${activePage === child.id ? "active" : ""}`}
              onClick={() => onNavigate?.(child.id)}
            >
              {child.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
