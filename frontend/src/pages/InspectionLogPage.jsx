import React, { useState, useMemo, useCallback } from "react";
import {
  useInspectionLogSummary,
  useRealtimeEvents,
} from "../hooks/useQueries";
import { useDetectionStore } from "../stores/useDetectionStore";
import { useStreamStore } from "../stores/useStreamStore";
import {
  Download,
  Radio,
  Activity,
} from "lucide-react";
import "../styles/InspectionLogPage.css";

export default function InspectionLogPage() {
  const [labelFilter, setLabelFilter] = useState(null);

  // ── Real-time pipeline state (dari global WS stores, persist saat navigasi) ──
  const detPayload = useDetectionStore((s) => s.lastPayload);
  const strPayload = useStreamStore((s) => s.lastPayload);
  const persistedVideoId = useDetectionStore((s) => s.persistedVideoId);

  const fileRunning   = detPayload?.pipeline_status === "running";
  const streamRunning = strPayload?.pipeline_status === "running";
  const anyRunning    = fileRunning || streamRunning;

  // ── Real-time events dari backend (gabungan file + stream) ──
  const realtimeQ = useRealtimeEvents();
  const realtimeEvents = realtimeQ.data?.events ?? [];
  const realtimeFodCount = realtimeQ.data?.total_fod_count ?? 0;

  // ── Active video_id: ambil dari WS store atau realtime endpoint ──
  const activeVideoId = persistedVideoId
    ?? realtimeQ.data?.video_id
    ?? null;

  const summaryQ = useInspectionLogSummary({ videoId: activeVideoId, label: labelFilter, enabled: !!activeVideoId });

  const summary = summaryQ.data;

  const classOptions = useMemo(
    () => summary?.by_label?.map((l) => l.label) ?? [], [summary],
  );

  const handleExportCSV = useCallback(() => {
    if (!realtimeEvents.length) return;
    const header = "Waktu,Frame,FOD,Score,Severity,Sumber\n";
    const rows = realtimeEvents.map((evt) =>
      `${evt.time_str ?? ""},#${evt.frame_id ?? ""},${evt.fod_count ?? 0},${Math.round((evt.max_score ?? 0) * 100)}%,${evt.severity ?? ""},${evt.source === "stream" ? "Stream" : "Live Feed"}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inspection-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [realtimeEvents]);

  return (
    <div className="ilog">
      {/* ── Filter Bar ── */}
      <div className="ilog-topbar">
        <div className="ilog-filters">
          <select
            className="ilog-sel"
            value={labelFilter ?? ""}
            onChange={(e) => { setLabelFilter(e.target.value || null); }}
          >
            <option value="">Semua kelas</option>
            {classOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {activeVideoId && (
            <span className="ilog-sel" style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#EEF2FF", color: "#4338CA", fontWeight: 600, cursor: "default" }}>
              Sesi: {activeVideoId.substring(0, 8).toUpperCase()}
            </span>
          )}
        </div>
        <button className="ilog-csv-btn" onClick={handleExportCSV} disabled={!realtimeEvents.length}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* ── Summary Cards ── */}
      <div className="ilog-stats">
        <div className="ilog-stat">
          <span className="ilog-stat-label">Total deteksi {activeVideoId ? "(sesi ini)" : ""}</span>
          <span className="ilog-stat-val">{summary?.total ?? 0}</span>
        </div>
        <div className="ilog-stat">
          <span className="ilog-stat-label">False positif dikonfirmasi</span>
          <span className="ilog-stat-val">{summary?.by_status?.rejected ?? 0}</span>
        </div>
        <div className="ilog-stat">
          <span className="ilog-stat-label">Rata-rata per hari</span>
          <span className="ilog-stat-val">{summary?.avg_per_day ?? 0}</span>
        </div>
        <div className="ilog-stat">
          <span className="ilog-stat-label">Confidence rata-rata</span>
          <span className="ilog-stat-val ilog-stat-val--accent">{summary?.avg_confidence ?? 0}%</span>
        </div>
      </div>

      {/* ── Live Detection Banner ── */}
      {anyRunning && (
        <div className="ilog-live-banner">
          <div className="ilog-live-banner-left">
            <span className="ilog-live-dot" />
            <Radio size={14} />
            <span className="ilog-live-label">
              Deteksi Aktif
              {fileRunning && streamRunning ? " — Live Feed & Stream"
                : fileRunning ? " — Live Feed" : " — Stream"}
            </span>
          </div>
          <div className="ilog-live-banner-right">
            <Activity size={13} />
            <span>FOD sesi ini: <strong>{realtimeFodCount}</strong></span>
          </div>
        </div>
      )}

      {/* ── Real-time Events CardView ── */}
      <div className="ilog-panel ilog-live-panel">
        <div className="ilog-panel-head">
          <span className="ilog-panel-title">
            <span className="ilog-live-dot" /> DETEKSI REAL-TIME
          </span>
          {anyRunning && realtimeEvents.length > 0 && (
            <span className="ilog-live-count">{realtimeEvents.length} event terbaru</span>
          )}
        </div>
        <div className="ilog-scroll" style={{ maxHeight: 600 }}>
          {anyRunning && realtimeEvents.length > 0 ? (
            <table className="ilog-tbl">
              <thead>
                <tr>
                  <th>Waktu</th><th>Frame</th><th>FOD</th><th>Score</th><th>Severity</th><th>Sumber</th>
                </tr>
              </thead>
              <tbody>
                {realtimeEvents.slice(0, 50).map((evt, i) => (
                  <tr key={evt.event_id || i} className="ilog-live-row">
                    <td className="ilog-mono">{evt.time_str}</td>
                    <td className="ilog-mono">#{evt.frame_id}</td>
                    <td className="ilog-bold">{evt.fod_count}</td>
                    <td className="ilog-bold">{Math.round((evt.max_score ?? 0) * 100)}%</td>
                    <td>
                      <span className={`ilog-st ${
                        evt.severity === "HIGH" ? "ilog-st--active"
                        : evt.severity === "MEDIUM" ? "ilog-st--review"
                        : "ilog-st--cleared"
                      }`}>{evt.severity}</span>
                    </td>
                    <td className="ilog-mono">
                      {evt.source === "stream" ? "Stream" : "Live Feed"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="ilog-empty-placeholder" style={{ padding: '48px 0', textAlign: 'center', color: '#888', fontSize: 18 }}>
              Tidak ada deteksi yang aktif
            </div>
          )}
        </div>
      </div>
    </div>
  );
}