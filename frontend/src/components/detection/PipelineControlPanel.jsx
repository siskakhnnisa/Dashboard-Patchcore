import { useState, useEffect } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Settings,
  MapPinned,
  CheckCircle2,
  Circle,
  AlertCircle,
  Upload,
  SlidersHorizontal,
} from "lucide-react";
import "../../styles/PipelineControlPanel.css";

// ── Simulated API (replace with real import in production) ────────────────────
import { api } from '../../services/api';

// ── Component ─────────────────────────────────────────────────────────────────

export default function PipelineControlPanel({
  pipelineStatus: externalStatus,
  videoProgress = 0,
  currentFrame = 0,
  totalFrames: externalTotal,
  videoId: externalVideoId,
  onOpenMapping,
  connected = false,
  onUploadingChange,
  // Toolbar mode props
  toolbar = false,
  fps = 0,
  anomalyDetected = false,
}) {
  const [videoId, setVideoId]               = useState(externalVideoId ?? null);
  const [videoMeta, setVideoMeta]           = useState(null);
  const [uploading, setUploading]           = useState(false);
  const [threshold, setThreshold]           = useState(0.5);
  const [pipelineStatus, setPipelineStatus] = useState(externalStatus ?? "idle");

  // Sync videoId from parent if changed
  useEffect(() => {
    if (externalVideoId && externalVideoId !== videoId) {
      setVideoId(externalVideoId);
    }
  }, [externalVideoId]);

  // Sync pipelineStatus from parent if changed
  useEffect(() => {
    if (externalStatus && externalStatus !== pipelineStatus) {
      setPipelineStatus(externalStatus);
    }
  }, [externalStatus]);

  const isRunning   = pipelineStatus === "running";
  const isPaused    = pipelineStatus === "paused";
  const isActive    = isRunning || isPaused;

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Reset file input agar user bisa upload file yang sama lagi jika perlu
    e.target.value = "";
    setUploading(true);
    onUploadingChange?.(true);
    try {
      const meta = await api.uploadVideo(file);
      setVideoId(meta.video_id);
      setVideoMeta(meta);
    } catch (err) {
      alert(`Upload gagal: ${err.message}`);
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
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

  const handlePause = async () => {
    try {
      await api.pausePipeline();
      setPipelineStatus("paused");
    } catch (err) {
      alert(`Gagal pause: ${err.message}`);
    }
  };

  const handleResume = async () => {
    try {
      await api.resumePipeline();
      setPipelineStatus("running");
    } catch (err) {
      alert(`Gagal resume: ${err.message}`);
    }
  };

  const handleThresholdChange = async (val) => {
    setThreshold(val);
    if (isRunning) await api.updateThreshold(val);
  };

  const handleTogglePipeline = () => {
    if (isRunning) handleStop();
    else if (pipelineStatus === "stopped") handleStart();
  };

  const progress    = videoProgress ?? 0;
  const totalFrames = externalTotal ?? videoMeta?.total_frames ?? 0;
  const canOpenMapping = Boolean(videoId) && !isActive && !uploading;

  // ── Toolbar variant (compact horizontal bar above monitor) ────────────────────
  if (toolbar) {
    const truncName = videoMeta?.filename
      ? videoMeta.filename.length > 22
        ? videoMeta.filename.slice(0, 19) + "\u2026"
        : videoMeta.filename
      : null;

    return (
      <div className={`pipeline-toolbar pipeline-toolbar--${pipelineStatus}`}>
        {/* \u2500\u2500 Left: status + upload \u2500\u2500 */}
        <div className="ptb-seg ptb-left">
          <span className={`ptb-status-badge ptb-status--${pipelineStatus}`}>
            <span className={`ptb-dot${isRunning ? " ptb-dot--live" : isPaused ? " ptb-dot--paused" : ""}`} />
            {pipelineStatus.toUpperCase()}
          </span>
          {anomalyDetected && (
            <span className="ptb-alert-chip">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L1 21h22L12 2zm0 15h-.01zm-1-4h2V9h-2v4z" />
              </svg>
              FOD ALERT
            </span>
          )}
          <div className="ptb-sep" />
          <label className={`ptb-upload${uploading || isActive ? " ptb-upload--disabled" : ""}`}>
            <input
              type="file"
              accept="video/mp4,video/avi,video/quicktime,video/x-msvideo,video/x-matroska,video/webm,.mp4,.avi,.mov,.mkv,.webm"
              onChange={handleFileChange}
              style={{ display: "none" }}
              disabled={uploading || isActive}
            />
            <Upload size={12} />
            <span className="ptb-upload-label">
              {uploading ? "Uploading\u2026" : truncName ?? "Upload Video"}
            </span>
          </label>
          {videoMeta && !isActive && (
            <span className="ptb-file-meta">
              {videoMeta.resolution} \u00b7 {videoMeta.fps.toFixed(0)} fps \u00b7 {videoMeta.duration_seconds.toFixed(1)}s
            </span>
          )}
        </div>

        {/* \u2500\u2500 Center: progress or hint \u2500\u2500 */}
        <div className="ptb-seg ptb-center">
          {isActive ? (
            <>
              <span className="ptb-mono ptb-frames">
                F {currentFrame.toLocaleString()} / {(totalFrames ?? 0).toLocaleString()}
              </span>
              <div className="ptb-progress-wrap">
                <div className="ptb-progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <span className="ptb-mono ptb-pct">{progress.toFixed(1)}%</span>
              {isPaused && <span className="ptb-paused-chip">PAUSED</span>}
            </>
          ) : uploading ? (
            <span className="ptb-hint ptb-uploading-hint">
              <span className="ptb-upload-spinner" /> Mengupload video…
            </span>
          ) : (
            <span className="ptb-hint">
              {videoMeta
                ? "Video siap \u00b7 tekan START untuk memulai deteksi"
                : "Upload video untuk memulai deteksi FOD"}
            </span>
          )}
        </div>

        {/* \u2500\u2500 Right: controls \u2500\u2500 */}
        <div className="ptb-seg ptb-right">
          <div className="ptb-threshold-ctrl">
            <SlidersHorizontal size={11} className="ptb-icon-muted" />
            <input
              type="range" min="0" max="1" step="0.01"
              value={threshold}
              onChange={(e) => handleThresholdChange(parseFloat(e.target.value))}
              className="ptb-range"
              title={`Threshold: ${threshold.toFixed(2)}`}
            />
            <span className="ptb-mono ptb-threshold-val">{threshold.toFixed(2)}</span>
          </div>
          {connected && fps > 0 && (
            <span className="ptb-fps-chip">{fps} <span className="ptb-fps-unit">FPS</span></span>
          )}
          <div className="ptb-sep" />
          <button
            className="ptb-btn ptb-btn--start"
            onClick={handleStart}
            disabled={!videoId || isActive || uploading}
          >
            <Play size={11} /> START
          </button>
          <button
            className={`ptb-btn ptb-btn--pause${isPaused ? " ptb-btn--resume" : ""}`}
            onClick={isPaused ? handleResume : handlePause}
            disabled={!isActive}
            title={isPaused ? "Resume pipeline" : "Pause pipeline"}
          >
            {isPaused ? <><Play size={11} /> RESUME</> : <><Pause size={11} /> PAUSE</>}
          </button>
          <button
            className="ptb-btn ptb-btn--stop"
            onClick={handleStop}
            disabled={!isActive}
          >
            <span className="ptb-stop-icon">&#9632;</span> STOP
          </button>
          <button
            className="ptb-btn ptb-btn--map"
            onClick={() => onOpenMapping?.(videoId)}
            disabled={!canOpenMapping}
            title="Open FOD Mapping"
          >
            <MapPinned size={14} />
          </button>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="pipeline-panel">
          {/* ── Header ── */}
          <div className="pipeline-header">
            <div className="pipeline-header-left">
              <span className="pipeline-title">Pipeline Control</span>
              <span className="pipeline-count">4/4 active</span>
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
            <label className={`pipeline-upload-box ${uploading || isActive ? "disabled" : ""}`}>
              <input
                type="file"
                accept="video/mp4,video/avi,video/quicktime,video/x-msvideo,video/x-matroska,video/webm,.mp4,.avi,.mov,.mkv,.webm"
                onChange={handleFileChange}
                style={{ display: "none" }}
                disabled={uploading || isActive}
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

          {/* ── Pipeline Stages removed ── */}

          <div className="pipeline-divider" />

          {/* ── Progress (only when active) ── */}
          {isActive && (
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
              disabled={!videoId || isActive || uploading}
            >
              <Play size={12} />
              {uploading ? "Uploading…" : "START"}
            </button>
            <button
              className={`pipeline-btn ${isPaused ? "pipeline-btn-start" : "pipeline-btn-pause"}`}
              onClick={isPaused ? handleResume : handlePause}
              disabled={!isActive}
            >
              {isPaused ? <><Play size={12} /> RESUME</> : <><Pause size={12} /> PAUSE</>}
            </button>
            <button
              className="pipeline-btn pipeline-btn-stop"
              onClick={handleStop}
              disabled={!isActive}
            >
              <span style={{ fontSize: "10px" }}>■</span> STOP
            </button>
          </div>

          <div className="pipeline-map-box">
            <div className="pipeline-map-copy">
              <div className="pipeline-map-title">FOD Mapping</div>
              <div className="pipeline-map-desc">
                Buka peta titik FOD dan rute pengambilan setelah monitoring selesai.
              </div>
            </div>
            <button
              className="pipeline-btn pipeline-btn-map"
              onClick={() => onOpenMapping?.(videoId)}
              disabled={!canOpenMapping}
            >
              <MapPinned size={13} /> OPEN MAP
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