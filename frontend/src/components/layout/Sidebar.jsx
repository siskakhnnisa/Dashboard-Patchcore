import React, { useState } from "react";
import {
  LayoutDashboard,
  ShoppingCart,
  FolderOpen,
  User,
  Building2,
  FileText,
  BookOpen,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Plane,
  Star,
  Clock,
} from "lucide-react";
import "../../styles/Sidebar.css";

const NAV_GROUPS = [
  {
    label: "Favorites",
    items: [
      { id: "overview", label: "Overview", icon: null },
      { id: "projects", label: "Projects", icon: null },
    ],
  },
  {
    label: "Dashboards",
    items: [
      {
        id: "dashboard-overview",
        label: "Overview",
        icon: LayoutDashboard,
        active: true,
      },
      { id: "ecommerce", label: "Overview", icon: ShoppingCart },
      { id: "projects-dash", label: "Projects", icon: FolderOpen },
    ],
  },
  {
    label: "Pages",
    items: [
      {
        id: "user-profile",
        label: "User Profile",
        icon: User,
        children: [
          { id: "profile-overview", label: "Overview" },
          { id: "profile-projects", label: "Projects" },
          { id: "profile-campaigns", label: "Campaigns" },
          { id: "profile-documents", label: "Documents" },
          { id: "profile-followers", label: "History" },
        ],
      },
      { id: "account", label: "Account", icon: User },
      { id: "corporate", label: "Corporate", icon: Building2 },
      { id: "blog", label: "Blog", icon: BookOpen },
      { id: "social", label: "Social", icon: MessageSquare },
    ],
  },
];

export default function Sidebar({ activePage, onNavigate }) {
  const [expandedItems, setExpandedItems] = useState({ "user-profile": true });

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
        <span className="sidebar-brand-name">ByeWind</span>
      </div>

      {/* Quick Nav Tabs */}
      <div className="sidebar-tabs">
        <button className="sidebar-tab active">Favorites</button>
        <button className="sidebar-tab">Recently</button>
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

      {/* Footer brand */}
      {/* <div className="sidebar-footer">
        <div className="sidebar-footer-brand">
          <span className="sidebar-footer-icon">❄</span>
          <span className="sidebar-footer-text">snowUI</span>
        </div>
      </div> */}
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
          else onNavigate(item.id);
        }}
      >
        {Icon ? (
          <span className="sidebar-item-icon">
            <Icon size={15} />
          </span>
        ) : (
          <span className="sidebar-item-dot">
            <span className="dot" />
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
              className={`sidebar-child-item ${
                activePage === child.id ? "active" : ""
              }`}
              onClick={() => onNavigate(child.id)}
            >
              {child.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
