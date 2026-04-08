import React, { useState, useEffect } from "react";
import { useStreamDetection } from "../hooks/useStreamDetection";
import {
  Radio, Play, Square, Pause, PlayCircle, Wifi,
  AlertTriangle, Shield, Clock, Zap, Eye, Settings2,
  RefreshCw, CheckCircle2, TrendingUp, Activity, Link2,
  ChevronLeft, ChevronRight,
} from "lucide-react";

import LiveMonitorPanel from "../components/monitoring/LiveMonitorPanel";
import "../styles/StreamPage.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

/* ── Helpers ── */
function fmtDuration(sec) {
  if (!sec) return "00:00:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

const PRESET_STREAMS = [
  { label: "RTSP Drone (Example)", url: "rtsp://192.168.1.100:8554/live" },
  { label: "RTMP Drone", url: "rtmp://192.168.1.100:1935/live/drone" },
  { label: "HTTP MJPEG", url: "http://192.168.1.100:8080/video" },
  { label: "Local Webcam", url: "0" },
];



/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */

export default function StreamPage() {
  const [streamUrl, setStreamUrl] = useState("");
  const [streamName, setStreamName] = useState("Drone Feed");
  const [threshold, setThreshold] = useState(0.5);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [configOpen, setConfigOpen] = useState(true);
  const [starting, setStarting] = useState(false);

  const { connected, lastPayload, fps, frameBitmap } = useStreamDetection(true);

  // Stream status is received live via WebSocket in lastPayload; no separate poll needed
  const streamStatus = null;

  const pipelineStatus = lastPayload?.pipeline_status ?? "idle";
  const isRunning = pipelineStatus === "running";
  const isPaused = pipelineStatus === "paused";

  // Clear starting indicator once pipeline actually runs
  useEffect(() => {
    if (isRunning) setStarting(false);
  }, [isRunning]);

  // Test stream connection
  const handleTest = async () => {
    if (!streamUrl.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/stream/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stream_url: streamUrl }),
      });
      setTestResult(await res.json());
    } catch (e) {
      setTestResult({ success: false, error: e.message });
    } finally {
      setTesting(false);
    }
  };

  // Start stream pipeline
  const handleStart = async () => {
    if (!streamUrl.trim()) return;
    setStarting(true);
    try {
      const res = await fetch(`${API_BASE}/api/stream/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stream_url: streamUrl,
          stream_name: streamName || "Drone Feed",
          anomaly_threshold: threshold,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setStarting(false);
        alert(data.message || "Gagal start stream");
      }
    } catch (e) {
      setStarting(false);
      alert("Error: " + e.message);
    }
  };

  // Stop stream pipeline
  const handleStop = async () => {
    try {
      await fetch(`${API_BASE}/api/stream/stop`, { method: "POST" });
    } catch { /* ignore */ }
  };

  // Pause/resume
  const handlePauseToggle = async () => {
    try {
      await fetch(`${API_BASE}/api/stream/${isPaused ? "resume" : "pause"}`, { method: "POST" });
    } catch { /* ignore */ }
  };

  // Use preset
  const handlePreset = (url) => {
    setStreamUrl(url);
    setTestResult(null);
  };

  return (
    <div className="stream-page">
      {/* ── Header ── */}
      <div className="stream-page-header">
        <div className="stream-page-header-left">
          <Radio size={20} />
          <div>
            <h1 className="stream-page-title">Live Stream Detection</h1>
            <p className="stream-page-subtitle">
              Deteksi FOD real-time dari drone video stream (RTSP/RTMP/SRT)
            </p>
          </div>
        </div>
        <div className="stream-page-header-right">
          <span className={`stream-status-pill${isRunning ? " running" : isPaused ? " paused" : ""}`}>
            <span className="stream-status-dot" />
            {isPaused ? "Paused" : isRunning ? "Streaming" : "Idle"}
          </span>
        </div>
      </div>

      {/* ── Monitor + Drawer Wrapper ── */}
      <div className="stream-workspace">

        {/* ── Monitor row: video col + config drawer side by side ── */}
        <div className={`stream-monitor-row${configOpen ? " drawer-open" : ""}`}>

          {/* Video column — grows to fill available width */}
          <div className="stream-video-col">
            <div className="stream-card stream-video-card" style={{ padding: 0, background: "none", position: "relative", height: "100%" }}>
              <LiveMonitorPanel
                variant="stream"
                frameBitmap={frameBitmap}
                bboxes={lastPayload?.bboxes ?? []}
                anomalyDetected={lastPayload?.anomaly_detected ?? false}
                fps={fps}
                connected={connected}
                pipelineStatus={pipelineStatus}
                pipelineError={lastPayload?.pipeline_error}
              />

              {/* Floating toggle tab — anchored to right edge of video */}
              <button
                className={`stream-drawer-tab${configOpen ? " open" : ""}`}
                onClick={() => setConfigOpen((v) => !v)}
                title={configOpen ? "Minimize configuration" : "Expand configuration"}
              >
                {configOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                <Settings2 size={13} />
                {!configOpen && <span className="stream-drawer-tab-label">CONFIG</span>}
              </button>
            </div>
          </div>

          {/* ── Config Drawer — inline beside monitor ── */}
          <div className={`stream-config-drawer${configOpen ? " open" : ""}`}>
            {/* Drawer Header */}
            <div className="stream-config-header">
              <div className="stream-config-header-info">
                <span className="stream-config-header-icon"><Settings2 size={15} /></span>
                <span className="stream-config-header-title">Stream Configuration</span>
                {isRunning && (
                  <span className="stream-config-running-badge">
                    <span className="stream-config-running-dot" />
                    LIVE
                  </span>
                )}
              </div>
              <button
                className="stream-config-collapse-btn"
                onClick={() => setConfigOpen(false)}
                title="Minimize panel"
              >
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="stream-config-body">

              {/* Stream Name */}
              <div className="stream-field">
                <label>Stream Name</label>
                <input
                  type="text"
                  value={streamName}
                  onChange={(e) => setStreamName(e.target.value)}
                  placeholder="Drone Feed"
                  disabled={isRunning}
                />
              </div>

              {/* Stream URL */}
              <div className="stream-field">
                <label>Stream URL</label>
                <div className="stream-url-row">
                  <input
                    type="text"
                    value={streamUrl}
                    onChange={(e) => { setStreamUrl(e.target.value); setTestResult(null); }}
                    placeholder="rtsp://192.168.1.100:8554/live"
                    disabled={isRunning}
                    className="stream-url-input"
                  />
                  <button
                    className="stream-test-btn"
                    onClick={handleTest}
                    disabled={!streamUrl.trim() || testing || isRunning}
                    title="Test koneksi"
                  >
                    {testing ? <RefreshCw size={13} className="stream-spin" /> : <Link2 size={13} />}
                  </button>
                </div>
              </div>

              {/* Test Result */}
              {testResult && (
                <div className={`stream-test-result${testResult.success ? " success" : " fail"}`}>
                  {testResult.success ? (
                    <><CheckCircle2 size={13} /><span>Connected — {testResult.width}x{testResult.height} @ {testResult.fps?.toFixed(0)}fps ({testResult.codec})</span></>
                  ) : (
                    <><AlertTriangle size={13} /><span>{testResult.error || "Gagal konek"}</span></>
                  )}
                </div>
              )}

              <div className="stream-config-divider" />

              {/* Quick Presets */}
              <div className="stream-field">
                <label>Quick Presets</label>
                <div className="stream-presets">
                  {PRESET_STREAMS.map((p, i) => (
                    <button key={i} className="stream-preset-btn" onClick={() => handlePreset(p.url)} disabled={isRunning}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Threshold */}
              <div className="stream-field">
                <label>
                  Anomaly Threshold
                  <strong className="stream-threshold-val">{(threshold * 100).toFixed(0)}%</strong>
                </label>
                <input
                  type="range" min="0.1" max="0.95" step="0.05"
                  value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value))}
                  disabled={isRunning}
                  className="stream-slider"
                />
                <div className="stream-slider-labels">
                  <span>Sensitif</span><span>Konservatif</span>
                </div>
              </div>

              <div className="stream-config-divider" />

              {/* Action Buttons */}
              <div className="stream-actions">
                {!isRunning ? (
                  <button
                    className={`stream-btn stream-btn-start${starting ? " starting" : ""}`}
                    onClick={handleStart}
                    disabled={!streamUrl.trim() || starting}
                  >
                    {starting
                      ? <><RefreshCw size={15} className="stream-spin" /> Menghubungkan...</>
                      : <><Play size={15} /> Start Stream</>
                    }
                  </button>
                ) : (
                  <>
                    <button className="stream-btn stream-btn-pause" onClick={handlePauseToggle}>
                      {isPaused ? <PlayCircle size={15} /> : <Pause size={15} />}
                      {isPaused ? "Resume" : "Pause"}
                    </button>
                    <button className="stream-btn stream-btn-stop" onClick={handleStop}>
                      <Square size={15} /> Stop
                    </button>
                  </>
                )}
              </div>

            </div>
          </div>

        </div>{/* end stream-monitor-row */}

        {/* ── Metrics Row (full width, below monitor row) ── */}
        <div className="stream-metrics-row">
          <MetricPill icon={Zap}        label="FPS"        value={fps || 0}                                                      color="#6366F1" />
          <MetricPill icon={Activity}   label="Score"      value={lastPayload?.anomaly_score != null ? (lastPayload.anomaly_score * 100).toFixed(1) + "%" : "—"} color={lastPayload?.anomaly_detected ? "#EF4444" : "#22C55E"} />
          <MetricPill icon={Eye}        label="FOD Total"  value={lastPayload?.total_fod_count ?? 0}                             color="#F59E0B" />
          <MetricPill icon={Clock}      label="Uptime"     value={fmtDuration(lastPayload?.elapsed_seconds || streamStatus?.elapsed_seconds)} color="#3B82F6" />
          <MetricPill icon={TrendingUp} label="Stream FPS" value={lastPayload?.stream_fps ?? streamStatus?.stream_info?.actual_fps ?? 0} color="#8B5CF6" />
          <MetricPill icon={RefreshCw}  label="Reconnects" value={lastPayload?.stream_reconnects ?? streamStatus?.stream_info?.reconnect_attempts ?? 0} color="#64748B" />
        </div>

        {/* ── Stream Info + Detection Summary ── */}
        <div className="stream-bottom-grid">
          {/* Stream Info */}
          <div className="stream-card">
            <div className="stream-card-header">
              <Wifi size={14} />
              <span>Stream Info</span>
            </div>
            <div className="stream-card-body">
              <div className="stream-info-grid">
                <InfoRow label="Status" value={
                  <span className={`stream-info-status${isRunning ? " online" : ""}`}>
                    {isRunning ? (isPaused ? "Paused" : "Online") : "Offline"}
                  </span>
                } />
                <InfoRow label="URL" value={
                  <span className="stream-info-mono">
                    {streamStatus?.stream_url || lastPayload?.stream_url || "—"}
                  </span>
                } />
                <InfoRow label="Resolution"        value={lastPayload?.stream_resolution || streamStatus?.stream_info?.resolution || "—"} />
                <InfoRow label="Stream FPS"        value={lastPayload?.stream_fps ?? streamStatus?.stream_info?.actual_fps ?? "—"} />
                <InfoRow label="Frames Processed"  value={lastPayload?.total_frames_processed ?? streamStatus?.total_frames_processed ?? 0} />
                <InfoRow label="Connection"        value={
                  <span style={{ color: connected ? "#22C55E" : "#EF4444" }}>
                    {connected ? "WebSocket OK" : "Disconnected"}
                  </span>
                } />
              </div>
            </div>
          </div>

          {/* Detection Summary */}
          <div className="stream-card">
            <div className="stream-card-header">
              <Shield size={14} />
              <span>Detection Summary</span>
            </div>
            <div className="stream-card-body">
              <div className="stream-summary-grid">
                <SummaryItem label="Total FOD"  value={lastPayload?.total_fod_count ?? streamStatus?.total_fod_detected ?? 0} color="#EF4444" />
                <SummaryItem label="Runway"     value={lastPayload?.runway_area_pct != null ? (lastPayload.runway_area_pct * 100).toFixed(1) + "%" : "—"} color="#3B82F6" />
                <SummaryItem label="Elapsed"    value={fmtDuration(lastPayload?.elapsed_seconds || streamStatus?.elapsed_seconds)} color="#8B5CF6" />
                <SummaryItem label="Reconnects" value={lastPayload?.stream_reconnects ?? 0} color="#64748B" />
              </div>
            </div>
          </div>
        </div>

      </div>{/* end stream-workspace */}
    </div>
  );
}

/* ── Sub-components ── */
function MetricPill({ icon: Icon, label, value, color }) {
  return (
    <div className="stream-metric-pill">
      <Icon size={13} style={{ color }} />
      <span className="stream-metric-val" style={{ color }}>{value}</span>
      <span className="stream-metric-label">{label}</span>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="stream-info-row">
      <span className="stream-info-label">{label}</span>
      <span className="stream-info-value">{value}</span>
    </div>
  );
}

function SummaryItem({ label, value, color }) {
  return (
    <div className="stream-summary-item">
      <span className="stream-summary-value" style={{ color }}>{value}</span>
      <span className="stream-summary-label">{label}</span>
    </div>
  );
}
