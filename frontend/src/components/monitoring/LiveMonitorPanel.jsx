// src/components/monitoring/LiveMonitorPanel.jsx
import React, { useEffect, useRef } from "react";
import "../../styles/LiveMonitorPanel.css";

const LiveMonitorPanel = React.memo(function LiveMonitorPanel({
  frameBitmap, anomalyDetected, bboxes, fps, connected, pipelineError, pipelineStatus
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!frameBitmap || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width  = frameBitmap.width;
    canvas.height = frameBitmap.height;
    ctx.drawImage(frameBitmap, 0, 0);
    bboxes.forEach((bbox) => {
      const color = bbox.confidence >= 0.8 ? "#FF3333"
                  : bbox.confidence >= 0.6 ? "#FF8800" : "#FFCC00";
      ctx.strokeStyle = color;
      ctx.lineWidth   = 3;
      ctx.strokeRect(bbox.x, bbox.y, bbox.width, bbox.height);
      const label = `FOD ${(bbox.confidence * 100).toFixed(0)}%`;
      ctx.font = "bold 14px monospace";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = color;
      ctx.fillRect(bbox.x, bbox.y - 22, tw + 8, 22);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(label, bbox.x + 4, bbox.y - 5);
    });
  }, [frameBitmap, bboxes]);

  const now = new Date();
  const timeStr = now.toLocaleTimeString("id-ID", {
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
  const dateStr = now.toLocaleDateString("id-ID", {
    day: "2-digit", month: "short", year: "numeric"
  });

  return (
    <div className={`live-monitor${anomalyDetected ? " alert-state" : ""}`}>

      {/* ── Header ── */}
      <div className="monitor-header">
        <div className="monitor-header-left">
          <span className={`monitor-live-dot${connected ? " live" : ""}`} />
          <span className="monitor-title">Runway Live Monitor</span>
          {connected && fps > 0 && (
            <span className="monitor-meta">
              <span className="monitor-meta-sep">·</span> {fps} FPS
            </span>
          )}
          {!connected && (
            <span className="monitor-meta">Disconnected</span>
          )}
        </div>

        <div className="monitor-header-right">
          {anomalyDetected && (
            <span className="monitor-alert-badge">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L1 21h22L12 2zm0 3.5L20.5 19h-17L12 5.5zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/>
              </svg>
              FOD DETECTED
            </span>
          )}
          {connected && (
            <span className="monitor-meta" style={{ fontSize: "10px", opacity: 0.7 }}>
              {timeStr}
            </span>
          )}
        </div>
      </div>

      {/* ── Video Feed ── */}
      <div className="monitor-feed">

        {/* Scanline overlay */}
        <div className="monitor-scanline" />

        {/* Crosshair when active */}
        {frameBitmap && <div className="monitor-crosshair" />}

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          className="w-full"
          style={{
            display: "block",
            width: "100%",
            aspectRatio: "16/9",
            objectFit: "contain",
          }}
        />

        {/* Placeholder when no frame */}
        {!frameBitmap && (
          <div style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}>
            {pipelineError ? (
              <>
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none"
                  stroke="rgba(255,60,60,0.7)" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 8v4M12 16h.01"/>
                </svg>
                <span className="hud-text" style={{ fontSize: "11px", color: "#ff5555" }}>
                  Pipeline Error
                </span>
                <span className="hud-text" style={{ fontSize: "10px", opacity: 0.6, maxWidth: 280, textAlign: "center" }}>
                  {pipelineError}
                </span>
              </>
            ) : !connected ? (
              <>
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none"
                  stroke="rgba(255,200,0,0.5)" strokeWidth="1.2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 8v4M12 16h.01"/>
                </svg>
                <span className="hud-text" style={{ fontSize: "11px", opacity: 0.6 }}>
                  Menghubungkan ke server…
                </span>
              </>
            ) : pipelineStatus === "running" ? (
              <>
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none"
                  stroke="rgba(100,220,100,0.35)" strokeWidth="1.2">
                  <circle cx="12" cy="12" r="10"/>
                  <circle cx="12" cy="12" r="6"/>
                  <circle cx="12" cy="12" r="2"/>
                </svg>
                <span className="hud-text" style={{ fontSize: "11px", opacity: 0.6 }}>
                  Loading frame pertama…
                </span>
              </>
            ) : (
              <>
                {/* Animated radar icon */}
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none"
                  stroke="rgba(100,220,100,0.35)" strokeWidth="1.2">
                  <circle cx="12" cy="12" r="10"/>
                  <circle cx="12" cy="12" r="6"/>
                  <circle cx="12" cy="12" r="2"/>
                  <line x1="12" y1="2"  x2="12" y2="6"/>
                  <line x1="12" y1="18" x2="12" y2="22"/>
                  <line x1="2"  y1="12" x2="6"  y2="12"/>
                  <line x1="18" y1="12" x2="22" y2="12"/>
                </svg>
                <span className="hud-text" style={{ fontSize: "11px", opacity: 0.6 }}>
                  Upload video dan tekan START untuk memulai deteksi
                </span>
              </>
            )}
          </div>
        )}

        {/* ── HUD corners ── */}
        <div className="monitor-hud-tl">
          <span className="hud-text">CAM-01</span>
          <span className="hud-text">RUNWAY A</span>
        </div>

        <div className="monitor-hud-tr">
          <span className="hud-text">{dateStr}</span>
          <span className="hud-text">
            {connected ? "● ONLINE" : "○ OFFLINE"}
          </span>
        </div>

        <div className="monitor-hud-bl">
          <span className="hud-text">
            {bboxes.length > 0 ? `${bboxes.length} OBJECT(S)` : "NO DETECTION"}
          </span>
        </div>

        <div className="monitor-hud-br">
          <span className="hud-text">FOD DETECTION SYSTEM</span>
          <span className="hud-text">v1.0</span>
        </div>

      </div>
    </div>
  );
});

export default LiveMonitorPanel;
