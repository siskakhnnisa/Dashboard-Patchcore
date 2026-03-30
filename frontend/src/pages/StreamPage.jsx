import React, { useState, useEffect, useRef, useCallback } from "react";
import { useStreamDetection } from "../hooks/useStreamDetection";
import { useStreamStore } from "../stores/useStreamStore";
import {
  Radio, Play, Square, Pause, PlayCircle, Wifi, WifiOff,
  AlertTriangle, Shield, Clock, Zap, Eye, Settings2,
  RefreshCw, CheckCircle2, TrendingUp, Activity, Link2,
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
   SCORE SPARKLINE — Real-time anomaly score mini-chart
   ═══════════════════════════════════════════════════════════════ */
function ScoreSparkline({ scoreHistory, threshold = 0.5 }) {
  const data = (scoreHistory || []).map((v, i) => ({ idx: i, score: v }));
  if (data.length === 0) return <div className="stream-sparkline-empty">No data</div>;
  return (
    <ResponsiveContainer width="100%" height={80}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366F1" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="score" stroke="#6366F1" fill="url(#sparkGrad)" strokeWidth={1.5} dot={false} />
        <ReferenceLine y={threshold} stroke="#EF4444" strokeDasharray="4 4" strokeWidth={1} />
        <Tooltip
          contentStyle={{ background: "#1E293B", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11, padding: "4px 8px" }}
          labelStyle={{ display: "none" }}
          formatter={(v) => [(v * 100).toFixed(1) + "%", "Score"]}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ═══════════════════════════════════════════════════════════════
   RECENT EVENT LIST
   ═══════════════════════════════════════════════════════════════ */
function RecentEventsList({ events }) {
  const list = events || [];
  if (list.length === 0) {
    return (
      <div className="stream-events-empty">
        <Clock size={16} />
        <span>Menunggu deteksi FOD...</span>
      </div>
    );
  }
  return (
    <div className="stream-events-list">
      {list.slice(0, 8).map((evt, i) => {
        const sev = evt.severity || "LOW";
        const color = sev === "HIGH" ? "#EF4444" : sev === "MEDIUM" ? "#F59E0B" : "#22C55E";
        return (
          <div key={i} className="stream-event-item">
            <div className="stream-event-dot" style={{ background: color }} />
            <div className="stream-event-body">
              <span className="stream-event-time">{evt.time_str}</span>
              <span className="stream-event-text">
                Frame #{evt.frame_id} — {evt.fod_count} FOD — {(evt.max_score * 100).toFixed(0)}%
              </span>
            </div>
            <span className="stream-event-badge" style={{ color, background: color + "18" }}>
              {sev}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */
export default function StreamPage() {
  const [streamUrl, setStreamUrl] = useState("");
  const [streamName, setStreamName] = useState("Drone Feed");
  const [threshold, setThreshold] = useState(0.5);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [streamStatus, setStreamStatus] = useState(null);

  const { connected, lastPayload, fps, frameBitmap } = useStreamDetection(true);

  const pipelineStatus = lastPayload?.pipeline_status ?? streamStatus?.status ?? "idle";
  const isRunning = pipelineStatus === "running";
  const isPaused = streamStatus?.paused ?? false;

  // Poll stream status
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/stream/status`);
        if (res.ok) setStreamStatus(await res.json());
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

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
      if (!data.success) alert(data.message || "Gagal start stream");
    } catch (e) {
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
      {/* Header */}
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
            {isRunning ? (isPaused ? "Paused" : "Streaming") : "Idle"}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="stream-content">
        {/* LEFT — Video Feed + Events */}
        <div className="stream-left">
          {/* Video Feed - gunakan LiveMonitorPanel agar konsisten dengan Live Feed */}
          <div className="stream-card stream-video-card" style={{ padding: 0, background: 'none', border: 'none' }}>
            <LiveMonitorPanel
              frameBitmap={frameBitmap}
              bboxes={lastPayload?.bboxes ?? []}
              anomalyDetected={lastPayload?.anomaly_detected ?? false}
              fps={fps}
              connected={connected}
              pipelineStatus={pipelineStatus}
              pipelineError={lastPayload?.pipeline_error}
            />
          </div>

          {/* Metrics Row */}
          <div className="stream-metrics-row">
            <MetricPill icon={Zap} label="FPS" value={fps || 0} color="#6366F1" />
            <MetricPill
              icon={Activity}
              label="Score"
              value={lastPayload?.anomaly_score != null ? (lastPayload.anomaly_score * 100).toFixed(1) + "%" : "—"}
              color={lastPayload?.anomaly_detected ? "#EF4444" : "#22C55E"}
            />
            <MetricPill icon={Eye} label="FOD Total" value={lastPayload?.total_fod_count ?? 0} color="#F59E0B" />
            <MetricPill
              icon={Clock}
              label="Uptime"
              value={fmtDuration(lastPayload?.elapsed_seconds || streamStatus?.elapsed_seconds)}
              color="#3B82F6"
            />
            <MetricPill
              icon={TrendingUp}
              label="Stream FPS"
              value={lastPayload?.stream_fps ?? streamStatus?.stream_info?.actual_fps ?? 0}
              color="#8B5CF6"
            />
            <MetricPill
              icon={RefreshCw}
              label="Reconnects"
              value={lastPayload?.stream_reconnects ?? streamStatus?.stream_info?.reconnect_attempts ?? 0}
              color="#64748B"
            />
          </div>

          {/* Score chart + Events (two columns) */}
          <div className="stream-bottom-grid">
            <div className="stream-card">
              <div className="stream-card-header">
                <TrendingUp size={14} />
                <span>Anomaly Score (Last 60 Frames)</span>
              </div>
              <div className="stream-card-body">
                <ScoreSparkline scoreHistory={lastPayload?.score_history} threshold={threshold} />
              </div>
            </div>

            <div className="stream-card">
              <div className="stream-card-header">
                <Activity size={14} />
                <span>Recent Detections</span>
                {isRunning && (
                  <span className="stream-live-badge">
                    <span className="stream-live-dot" /> LIVE
                  </span>
                )}
              </div>
              <div className="stream-card-body stream-events-body">
                <RecentEventsList events={lastPayload?.recent_events} />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — Control Panel */}
        <div className="stream-right">
          {/* Stream Configuration */}
          <div className="stream-card stream-control-card">
            <div className="stream-card-header">
              <Settings2 size={14} />
              <span>Stream Configuration</span>
            </div>
            <div className="stream-card-body">
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
                    <>
                      <CheckCircle2 size={13} />
                      <span>Connected — {testResult.width}x{testResult.height} @ {testResult.fps?.toFixed(0)}fps ({testResult.codec})</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={13} />
                      <span>{testResult.error || "Gagal konek"}</span>
                    </>
                  )}
                </div>
              )}

              {/* Presets */}
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
                <label>Anomaly Threshold: <strong>{(threshold * 100).toFixed(0)}%</strong></label>
                <input
                  type="range"
                  min="0.1"
                  max="0.95"
                  step="0.05"
                  value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value))}
                  disabled={isRunning}
                  className="stream-slider"
                />
                <div className="stream-slider-labels">
                  <span>Sensitif</span>
                  <span>Konservatif</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="stream-actions">
                {!isRunning ? (
                  <button
                    className="stream-btn stream-btn-start"
                    onClick={handleStart}
                    disabled={!streamUrl.trim()}
                  >
                    <Play size={15} /> Start Stream
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
                <InfoRow label="Resolution" value={
                  lastPayload?.stream_resolution || streamStatus?.stream_info?.resolution || "—"
                } />
                <InfoRow label="Stream FPS" value={
                  lastPayload?.stream_fps ?? streamStatus?.stream_info?.actual_fps ?? "—"
                } />
                <InfoRow label="Frames Processed" value={
                  lastPayload?.total_frames_processed ?? streamStatus?.total_frames_processed ?? 0
                } />
                <InfoRow label="Connection" value={
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
                <SummaryItem label="Total FOD" value={lastPayload?.total_fod_count ?? streamStatus?.total_fod_detected ?? 0} color="#EF4444" />
                <SummaryItem label="Runway" value={
                  lastPayload?.runway_area_pct != null
                    ? (lastPayload.runway_area_pct * 100).toFixed(1) + "%"
                    : "—"
                } color="#3B82F6" />
                <SummaryItem label="Elapsed" value={fmtDuration(lastPayload?.elapsed_seconds || streamStatus?.elapsed_seconds)} color="#8B5CF6" />
                <SummaryItem label="Reconnects" value={lastPayload?.stream_reconnects ?? 0} color="#64748B" />
              </div>
            </div>
          </div>
        </div>
      </div>
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
