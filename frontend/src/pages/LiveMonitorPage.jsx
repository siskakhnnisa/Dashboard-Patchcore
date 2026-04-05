import React from "react";
import { useNavigate } from "react-router-dom";
import LiveMonitorPanel from "../components/monitoring/LiveMonitorPanel";
import PipelineControlPanel from "../components/detection/PipelineControlPanel";
import FODSnapshotGallery from "../components/FODSnapshotGallery";
import { useDetectionStream } from "../hooks/useDetectionStream";
import { useDetectionStore } from "../stores/useDetectionStore";
import "../styles/LiveMonitorPage.css";

export default function LiveMonitorPage() {
  const navigate = useNavigate();
  const { connected, lastPayload, fps, frameBitmap } = useDetectionStream();
  const persistedVideoId = useDetectionStore((s) => s.persistedVideoId);

  const pipelineRunning = lastPayload?.pipeline_status === "running";
  const pipelineError   = lastPayload?.type === "error" ? lastPayload.message : null;
  const pipelineStatus  = lastPayload?.pipeline_status ?? "idle";

  /*
   * activeVideoId — ID video yang sedang/terakhir diproses pipeline.
   *
   * Prioritas:
   *  1. lastPayload.video_id  → video yang sedang aktif di stream (paling fresh)
   *  2. persistedVideoId      → ID yang disimpan store saat pipeline terakhir
   *                             dijalankan (fallback ketika stream belum/sudah
   *                             tidak mengirim payload)
   *
   * Nilai ini diteruskan ke FODSnapshotGallery sebagai `videoId` sehingga
   * galeri HANYA menampilkan snapshot dari sesi deteksi yang relevan,
   * bukan semua snapshot dari seluruh video.
   */
  const activeVideoId = lastPayload?.video_id ?? persistedVideoId ?? null;

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
            onOpenMapping={(videoId) => navigate(`/fod-mapping?videoId=${encodeURIComponent(videoId)}`)}
          />
        </div>
      </div>

      {/* FOD Snapshot Gallery — hanya snapshot dari video aktif */}
      <div className="livefeed-card">
        <FODSnapshotGallery
          enabled={pipelineRunning}
          videoId={activeVideoId}
        />
      </div>
    </div>
  );
}