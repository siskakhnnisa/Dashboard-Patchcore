import React, { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import LiveMonitorPanel from "../components/monitoring/LiveMonitorPanel";
import PipelineControlPanel from "../components/detection/PipelineControlPanel";
import FODSnapshotGallery from "../components/FODSnapshotGallery";
import { useDetectionStream } from "../hooks/useDetectionStream";
import { useDetectionStore } from "../stores/useDetectionStore";
import { useRealtimeEvents } from "../hooks/useQueries";
import { Download, Activity } from "lucide-react";
import "../styles/LiveMonitorPage.css";

export default function LiveMonitorPage() {
  const navigate = useNavigate();
  const { connected, lastPayload, fps, frameBitmap } = useDetectionStream();
  const persistedVideoId = useDetectionStore((s) => s.persistedVideoId);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState("snapshots");

  const pipelineRunning = lastPayload?.pipeline_status === "running";
  const pipelineError   = lastPayload?.type === "error" ? lastPayload.message : null;
  const pipelineStatus  = lastPayload?.pipeline_status ?? "idle";
  const anomalyDetected = lastPayload?.anomaly_detected ?? false;

  const activeVideoId = lastPayload?.video_id ?? persistedVideoId ?? null;

  // Realtime events for inspection log tab
  const realtimeQ = useRealtimeEvents();
  const realtimeEvents = realtimeQ.data?.events ?? [];

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
    <div className="livefeed">
      {/* ── Page Header ── */}
      <div className="livefeed-header">
        <h1 className="livefeed-title">Live Feed</h1>
      </div>

      {/* ── Unified Workspace: Control Toolbar + Monitor (single card, no gap) ── */}
      <div className={`livefeed-workspace${anomalyDetected ? " alert-state" : ""}`}>
        <PipelineControlPanel
          toolbar
          fps={fps}
          anomalyDetected={anomalyDetected}
          connected={connected}
          pipelineStatus={pipelineStatus}
          videoProgress={lastPayload?.video_progress_pct ?? 0}
          currentFrame={lastPayload?.current_frame ?? 0}
          totalFrames={lastPayload?.total_frames ?? 0}
          elapsedSeconds={lastPayload?.elapsed_seconds ?? 0}
          videoId={lastPayload?.video_id ?? persistedVideoId}
          onUploadingChange={setUploading}
          onOpenMapping={(videoId) =>
            navigate(`/fod-mapping?videoId=${encodeURIComponent(videoId)}`)
          }
        />
        <LiveMonitorPanel
          hideHeader
          frameBitmap={frameBitmap}
          bboxes={lastPayload?.bboxes ?? []}
          anomalyDetected={anomalyDetected}
          fps={fps}
          connected={connected}
          pipelineError={pipelineError}
          pipelineStatus={pipelineStatus}
          uploading={uploading}
        />
      </div>

      {/* ── Tabbed Section: FOD Snapshots / Inspection Log ── */}
      <div className="livefeed-card">
        <div className="livefeed-tabs">
          <button
            className={`livefeed-tab${activeTab === "snapshots" ? " livefeed-tab--active" : ""}`}
            onClick={() => setActiveTab("snapshots")}
          >
            FOD Snapshots
          </button>
          <button
            className={`livefeed-tab${activeTab === "inspection" ? " livefeed-tab--active" : ""}`}
            onClick={() => setActiveTab("inspection")}
          >
            Inspection Log
          </button>
        </div>

        {activeTab === "snapshots" && (
          <FODSnapshotGallery
            enabled={pipelineRunning}
            videoId={activeVideoId}
          />
        )}

        {activeTab === "inspection" && (
          <div className="livefeed-inspection-log">
            <div className="livefeed-ilog-header">
              <span className="livefeed-ilog-count">
                <Activity size={14} />
                {realtimeEvents.length} event terbaru
              </span>
              <button
                className="livefeed-ilog-export"
                onClick={handleExportCSV}
                disabled={!realtimeEvents.length}
              >
                <Download size={14} /> Export CSV
              </button>
            </div>
            <div className="livefeed-ilog-scroll">
              {realtimeEvents.length > 0 ? (
                <table className="livefeed-ilog-table">
                  <thead>
                    <tr>
                      <th>Waktu</th><th>Frame</th><th>FOD</th><th>Score</th><th>Severity</th><th>Sumber</th>
                    </tr>
                  </thead>
                  <tbody>
                    {realtimeEvents.slice(0, 50).map((evt, i) => (
                      <tr key={evt.event_id || i}>
                        <td className="livefeed-ilog-mono">{evt.time_str}</td>
                        <td className="livefeed-ilog-mono">#{evt.frame_id}</td>
                        <td style={{ fontWeight: 600 }}>{evt.fod_count}</td>
                        <td style={{ fontWeight: 600 }}>{Math.round((evt.max_score ?? 0) * 100)}%</td>
                        <td>
                          <span className={`livefeed-ilog-sev livefeed-ilog-sev--${(evt.severity ?? "low").toLowerCase()}`}>
                            {evt.severity}
                          </span>
                        </td>
                        <td className="livefeed-ilog-mono">
                          {evt.source === "stream" ? "Stream" : "Live Feed"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="livefeed-ilog-empty">
                  Belum ada deteksi. Mulai pipeline untuk melihat log.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}