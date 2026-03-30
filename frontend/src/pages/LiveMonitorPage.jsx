import React from "react";
import LiveMonitorPanel from "../components/monitoring/LiveMonitorPanel";
import PipelineControlPanel from "../components/detection/PipelineControlPanel";
import FODSnapshotGallery from "../components/FODSnapshotGallery";
import { useDetectionStream } from "../hooks/useDetectionStream";
import { useDetectionStore } from "../stores/useDetectionStore";
import "../styles/LiveMonitorPage.css";

export default function LiveMonitorPage() {
  const { connected, lastPayload, fps, frameBitmap } = useDetectionStream();
  const persistedVideoId = useDetectionStore((s) => s.persistedVideoId);

  const pipelineRunning = lastPayload?.pipeline_status === "running";
  const pipelineError = lastPayload?.type === "error" ? lastPayload.message : null;
  const pipelineStatus = lastPayload?.pipeline_status ?? "idle";

  return (
    <div className="livefeed">
      {/* Header */}
      <div className="livefeed-header">
        <h1 className="livefeed-title">Live Feed</h1>
      </div>

      {/* Main Row: Live Monitor + Pipeline Control */}
      <div className="livefeed-main">
        <div className="livefeed-card livefeed-monitor-col">
          <LiveMonitorPanel
            frameBitmap={frameBitmap}
            bboxes={lastPayload?.bboxes ?? []}
            anomalyDetected={lastPayload?.anomaly_detected ?? false}
            fps={fps}
            connected={connected}
            pipelineError={pipelineError}
            pipelineStatus={pipelineStatus}
          />
        </div>
        <div className="livefeed-card livefeed-pipeline-col">
          <PipelineControlPanel
            connected={connected}
            pipelineStatus={lastPayload?.pipeline_status ?? "idle"}
            videoProgress={lastPayload?.video_progress_pct ?? 0}
            currentFrame={lastPayload?.current_frame ?? 0}
            totalFrames={lastPayload?.total_frames ?? 0}
            elapsedSeconds={lastPayload?.elapsed_seconds ?? 0}
            videoId={lastPayload?.video_id ?? persistedVideoId}
          />
        </div>
      </div>

      {/* FOD Snapshot Gallery */}
      <div className="livefeed-card">
        <FODSnapshotGallery
          enabled={pipelineRunning}
          videoId={persistedVideoId}
        />
      </div>
    </div>
  );
}
