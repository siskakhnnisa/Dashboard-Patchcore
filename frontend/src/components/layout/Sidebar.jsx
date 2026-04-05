import React, { memo, startTransition, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  MonitorPlay,
  Camera,
  Map,
  BarChart2,
  History,
  FileText,
  Plane,
  Shield,
  ScrollText,
  FolderSearch,
  Radio,
} from "lucide-react";
import "../../styles/Sidebar.css";
import { preloadRoute } from "../../utils/routePreloaders";

const ROUTE_MAP = {
  "home":              "/",
  "live-monitor":      "/live-monitor",
  "stream":            "/stream",
  "fod-snapshots":     "/fod-snapshots",
  "fod-mapping":       "/fod-mapping",
  "activity-history":  "/activity-history",
  "detection-stats":   "/detection-stats",
  "inspection-log":    "/inspection-log",
  "pipeline-log":      "/pipeline/log",
  "reports":           "/reports",
};

const NAV_GROUPS = [
  {
    label: "Monitoring",
    items: [
      { id: "home",           label: "Home",           icon: LayoutDashboard },
      { id: "live-monitor",   label: "Live Feed",      icon: MonitorPlay },
      { id: "stream",         label: "Stream",         icon: Radio },
      { id: "fod-snapshots",  label: "FOD Snapshots",  icon: Camera },
      { id: "fod-mapping",    label: "FOD Mapping",    icon: Map },
    ],
  },
  {
    label: "Analysis",
    items: [
      { id: "detection-stats",  label: "Detection Stats",  icon: BarChart2 },
      { id: "inspection-log",   label: "Inspection Log",   icon: FolderSearch },
    ],
  },
  {
    label: "System",
    items: [
      { id: "activity-history", label: "Activity History", icon: History },
      { id: "pipeline-log",  label: "System Log",  icon: ScrollText },
      { id: "reports",       label: "Reports",     icon: FileText },
    ],
  },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const currentId = Object.entries(ROUTE_MAP).find(
    ([, path]) => path === location.pathname
  )?.[0] ?? "home";

  const handleIntent = useCallback((id) => {
    preloadRoute(id);
  }, []);

  const handleNavigate = useCallback((id) => {
    const path = ROUTE_MAP[id];
    if (!path || path === location.pathname) return;
    preloadRoute(id);
    startTransition(() => navigate(path));
  }, [location.pathname, navigate]);

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
                activePage={currentId}
                onNavigate={handleNavigate}
                onIntent={handleIntent}
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

const SidebarItem = memo(function SidebarItem({ item, activePage, onNavigate, onIntent }) {
  const Icon = item.icon;
  const isActive = activePage === item.id;

  return (
    <div className="sidebar-item-wrapper">
      <button
        type="button"
        className={`sidebar-item ${isActive ? "active" : ""}`}
        onPointerEnter={() => onIntent?.(item.id)}
        onFocus={() => onIntent?.(item.id)}
        onMouseDown={() => onIntent?.(item.id)}
        onClick={() => onNavigate?.(item.id)}
      >
        {Icon && (
          <span className="sidebar-item-icon">
            <Icon size={15} />
          </span>
        )}
        <span className="sidebar-item-label">{item.label}</span>
      </button>
    </div>
  );
});
