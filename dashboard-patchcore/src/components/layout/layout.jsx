import React from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import "../../styles/Layout.css";

export default function Layout({ activePage, onNavigate, children }) {
  return (
    <div className="layout">
      <Sidebar activePage={activePage} onNavigate={onNavigate} />

      <div className="layout-main">
        <TopBar />
        <main className="layout-content">{children}</main>
      </div>
    </div>
  );
}
