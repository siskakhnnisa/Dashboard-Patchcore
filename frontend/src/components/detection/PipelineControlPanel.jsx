import { useState } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Settings,
  CheckCircle2,
  Circle,
  AlertCircle,
  Upload,
  SlidersHorizontal,
} from "lucide-react";
import "../../styles/PipelineControlPanel.css";

// ── Pipeline stage definitions ────────────────────────────────────────────────
const STAGES = [
  { id: "runway-seg",  label: "Runway Segmentation", color: "#22c55e", desc: "Semantic segmentation of runway area" },
  { id: "roi-masking", label: "ROI Masking",          color: "#eab308", desc: "Region of interest extraction" },
  { id: "patchcore",   label: "Patchcore Detection",  color: "#3b82f6", desc: "Anomaly detection via PatchCore" },
  { id: "postproc",    label: "Post-processing",      color: "#f97316", desc: "NMS, filtering, bounding box refinement" },
];

// ── Simulated API (replace with real import in production) ────────────────────
import { api } from '../../services/api';

// ── Component ─────────────────────────────────────────────────────────────────
export default function PipelineControlPanel({
  pipelineStatus: externalStatus,
  videoProgress = 37.5,
  currentFrame = 478,
  totalFrames: externalTotal,
}) {
  const [videoId, setVideoId]               = useState(null);
  const [videoMeta, setVideoMeta]           = useState(null);
  const [uploading, setUploading]           = useState(false);
  const [threshold, setThreshold]           = useState(0.5);
  const [pipelineStatus, setPipelineStatus] = useState(externalStatus ?? "idle");
  const [stages, setStages]                 = useState(
    STAGES.reduce((acc, s) => ({ ...acc, [s.id]: true }), {})
  );

  const isRunning   = pipelineStatus === "running";
  const activeCount = Object.values(stages).filter(Boolean).length;

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const meta = await api.uploadVideo(file);
      setVideoId(meta.video_id);
      setVideoMeta(meta);
    } catch (err) {
      alert(`Upload gagal: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleStart = async () => {
    if (!videoId) return alert("Upload video dulu!");
    try {
      await api.startPipeline(videoId, threshold);
      setPipelineStatus("running");
    } catch (err) {
      alert(`Gagal start: ${err.message}`);
    }
  };

  const handleStop = async () => {
    await api.stopPipeline();
    setPipelineStatus("stopped");
  };

  const handleThresholdChange = async (val) => {
    setThreshold(val);
    if (isRunning) await api.updateThreshold(val);
  };

  const toggleStage = (id) => {
    setStages((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleTogglePipeline = () => {
    if (isRunning) handleStop();
    else if (pipelineStatus === "stopped") handleStart();
  };

  const progress    = videoProgress ?? 0;
  const totalFrames = externalTotal ?? videoMeta?.total_frames ?? 0;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="pipeline-panel">

      {/* ── Header ── */}
      <div className="pipeline-header">
        <div className="pipeline-header-left">
          <span className="pipeline-title">Pipeline Control</span>
          <span className="pipeline-count">{activeCount}/{STAGES.length} active</span>
        </div>
        <div className="pipeline-header-right">
          <button
            className={`pipeline-toggle-btn ${isRunning ? "running" : "stopped"}`}
            onClick={handleTogglePipeline}
            disabled={!videoId && !isRunning}
          >
            {isRunning ? <Pause size={11} /> : <Play size={11} />}
            <span>{isRunning ? "Pause" : "Resume"}</span>
          </button>
          <button className="pipeline-icon-btn" onClick={() => setPipelineStatus("idle")}>
            <RotateCcw size={12} />
          </button>
          <button className="pipeline-icon-btn">
            <Settings size={12} />
          </button>
        </div>
      </div>

      {/* ── Upload ── */}
      <div>
        <div className="pipeline-section-label">
          <Upload size={11} /> Video Input
        </div>
        <label className={`pipeline-upload-box ${uploading || isRunning ? "disabled" : ""}`}>
          <input
            type="file"
            accept="video/mp4,video/avi"
            onChange={handleFileChange}
            style={{ display: "none" }}
            disabled={uploading || isRunning}
          />
          <Upload size={14} color="#94a3b8" />
          <span className="pipeline-upload-text">
            {uploading
              ? "Uploading…"
              : videoMeta
              ? videoMeta.filename
              : "Click to upload video (mp4, avi)"}
          </span>
        </label>
        {videoMeta && (
          <div className="pipeline-upload-success">
            ✓ {videoMeta.resolution} · {videoMeta.fps.toFixed(0)} FPS · {videoMeta.duration_seconds.toFixed(1)}s · {videoMeta.total_frames} frames
          </div>
        )}
      </div>

      {/* ── Threshold ── */}
      <div>
        <div className="pipeline-threshold-row">
          <div className="pipeline-section-label">
            <SlidersHorizontal size={11} /> Anomaly Threshold
          </div>
          <span className="pipeline-threshold-val">{threshold.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min="0" max="1" step="0.01"
          value={threshold}
          onChange={(e) => handleThresholdChange(parseFloat(e.target.value))}
          className="pipeline-range"
        />
      </div>

      <div className="pipeline-divider" />

      {/* ── Pipeline stages ── */}
      <div className="pipeline-flow">
        {STAGES.map((stage, idx) => {
          const isEnabled = stages[stage.id];
          const isActive  = isEnabled && isRunning;
          return (
            <div key={stage.id} className="pipeline-stage-wrap">
              <div
                className={`pipeline-stage ${isActive ? "active" : ""} ${!isEnabled ? "disabled" : ""}`}
                onClick={() => toggleStage(stage.id)}
              >
                {/* Status icon */}
                <div className="pipeline-stage-icon">
                  {isActive
                    ? <CheckCircle2 size={13} color={stage.color} />
                    : isEnabled
                    ? <Circle       size={13} color={stage.color} />
                    : <AlertCircle  size={13} color={stage.color} />}
                </div>

                {/* Stage info */}
                <div className="pipeline-stage-info">
                  <div className="pipeline-stage-label">{stage.label}</div>
                  <div className="pipeline-stage-desc">{stage.desc}</div>
                </div>

                {/* Toggle — background color is dynamic per stage, so kept inline */}
                <div
                  className={`pipeline-stage-toggle ${isEnabled ? "on" : "off"}`}
                  style={isEnabled ? { background: stage.color } : undefined}
                />
              </div>

              {/* Connector */}
              {idx < STAGES.length - 1 && (
                <div className={`pipeline-connector ${isActive ? "active" : ""}`}>
                  <div
                    className="pipeline-connector-line"
                    style={isActive ? { background: stage.color } : undefined}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Status bar ── */}
      <div className="pipeline-status-bar">
        {STAGES.map((stage) => (
          <div
            key={stage.id}
            className="pipeline-status-seg"
            style={{
              background: stages[stage.id] && isRunning ? stage.color : "#e2e8f0",
              opacity:    stages[stage.id] && isRunning ? 1 : 0.4,
            }}
          />
        ))}
      </div>

      {/* ── Progress (only when running) ── */}
      {isRunning && (
        <div>
          <div className="pipeline-progress-row">
            <span>Frame {currentFrame} / {totalFrames}</span>
            <span>{progress.toFixed(1)}%</span>
          </div>
          <div className="pipeline-progress-track">
            <div className="pipeline-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* ── Action buttons ── */}
      <div className="pipeline-actions">
        <button
          className="pipeline-btn pipeline-btn-start"
          onClick={handleStart}
          disabled={!videoId || isRunning || uploading}
        >
          <Play size={12} />
          {uploading ? "Uploading…" : "START"}
        </button>
        <button
          className="pipeline-btn pipeline-btn-stop"
          onClick={handleStop}
          disabled={!isRunning}
        >
          <span style={{ fontSize: "10px" }}>■</span> STOP
        </button>
      </div>

      {/* ── Status badge ── */}
      <div className="pipeline-badge-row">
        <span className={`pipeline-badge ${pipelineStatus}`}>
          {pipelineStatus.toUpperCase()}
        </span>
      </div>

    </div>
  );
}