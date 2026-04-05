import React, { useEffect, Suspense } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../layout/Sidebar";
import { useDetectionStore } from "../../stores/useDetectionStore";
import { useStreamStore } from "../../stores/useStreamStore";
import "../../styles/Layout.css";

/**
 * Bootstraps both WebSocket connections once when the layout mounts.
 * Because MainLayout wraps ALL routes, the connections survive page navigation.
 * They are never torn down until the browser tab is closed.
 */
function PersistentConnections() {
  const connectDetection = useDetectionStore((s) => s.connect);
  const connectStream    = useStreamStore((s) => s.connect);

  useEffect(() => {
    connectDetection();
    connectStream();
    // No cleanup — connections are intentionally kept alive across navigation
  }, [connectDetection, connectStream]);

  return null; // renders nothing
}

export default function MainLayout() {
  return (
    <div className="layout">
      <PersistentConnections />
      <Sidebar />
      <div className="layout-main">
        <div className="layout-content">
          <Suspense fallback={<div className="page-suspense" />}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
