import React from "react";
import Sidebar from "../layout/Sidebar";
import TopBar from "../layout/TopBar";
import "../../styles/Layout.css";

export default function MainLayout({ children }) {
  return (
    <div className="layout">
      <Sidebar />
      <div className="layout-main">
        <TopBar />
        <div className="layout-content">{children}</div>
      </div>
    </div>
  );
}
