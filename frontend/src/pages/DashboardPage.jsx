import React from "react";
import FODSnapshotGallery from "../components/FODSnapshotGallery";
import StatsRow from "../components/dashboard/StatsRow";
import DetectionStatistics from "../components/detection/DetectionStatistic";
import LiveMonitorPanel from "../components/monitoring/LiveMonitorPanel";
import DetectionInfoPanel from "../components/detection/DetectionInfoPanel";
import PipelineControlPanel from "../components/detection/PipelineControlPanel";
import FODeventsTimeline from "../components/detection/FODeventsTimeline";
import { useDetectionStream } from "../hooks/useDetectionStream";
import "../pages/DashboardPage.css";

export default function DashboardPage() {


  const { connected, lastPayload, fps, frameBitmap } = useDetectionStream();

  // Card data for stats row
  const stats = [
    { key: "views",       component: <StatsRow statKey="views" />,       bgColor: "#E8E9F3" },
    { key: "visits",      component: <StatsRow statKey="visits" />,      bgColor: "#E3F2FD" },
    { key: "newUsers",    component: <StatsRow statKey="newUsers" />,    bgColor: "#FFF9E6" },
    { key: "activeUsers", component: <StatsRow statKey="activeUsers" />, bgColor: "#E8F5E9" },
  ];

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <h1 className="dashboard-title">Overview</h1>
      </div>

      {/* Stats Row */}
      <div className="dashboard-stats-row">
        {stats.map((stat) => (
          <div
            className="dashboard-card stats-card"
            key={stat.key}
            style={{ backgroundColor: stat.bgColor }}
          >
            {stat.component}
          </div>
        ))}
      </div>

      {/* Main Middle Row: Live Monitor + Detection Statistics */}
      <div className="dashboard-middle">
        <div className="dashboard-card dashboard-monitor-col">

          {/* ── LiveMonitorPanel terima frame + bbox dari WebSocket ── */}
          <LiveMonitorPanel
            frameBitmap={frameBitmap}
            bboxes={lastPayload?.bboxes ?? []}
            anomalyDetected={lastPayload?.anomaly_detected ?? false}
            fps={fps}
            connected={connected}
          />

        </div>
        <div className="dashboard-card dashboard-traffic-col">

          {/* ── DetectionStatistics terima history score ── */}
          <DetectionStatistics
            scoreHistory={lastPayload?.score_history ?? []}
            totalFodCount={lastPayload?.total_fod_count ?? 0}
            anomalyScore={lastPayload?.anomaly_score ?? 0}
          />

        </div>
      </div>

      {/* Detection Panels Row */}
      <div className="dashboard-detection-row">
        <div className="dashboard-card dashboard-det-info">

          {/* ── DetectionInfoPanel terima hasil deteksi ── */}
          <DetectionInfoPanel
            anomalyDetected={lastPayload?.anomaly_detected ?? false}
            anomalyScore={lastPayload?.anomaly_score ?? 0}
            bboxes={lastPayload?.bboxes ?? []}
            runwayAreaPct={lastPayload?.runway_area_pct ?? 0}
            frameId={lastPayload?.frame_id ?? 0}
          />

        </div>
        <div className="dashboard-card dashboard-pipeline">

          {/* ── PipelineControlPanel terima status pipeline ── */}
          <PipelineControlPanel
            connected={connected}
            pipelineStatus={lastPayload?.pipeline_status ?? "idle"}
            videoProgress={lastPayload?.video_progress_pct ?? 0}
            currentFrame={lastPayload?.current_frame ?? 0}
            totalFrames={lastPayload?.total_frames ?? 0}
            elapsedSeconds={lastPayload?.elapsed_seconds ?? 0}
          />

        </div>
      </div>

      {/* FOD Events Timeline */}
      <div className="dashboard-card">
        {/* ── FODeventsTimeline terima list events ── */}
        <FODeventsTimeline
          events={lastPayload?.recent_events ?? []}
          totalFodCount={lastPayload?.total_fod_count ?? 0}
        />
      </div>

      {/* FOD Snapshot Gallery */}
      <div className="dashboard-card">
        <h2 style={{marginBottom:12}}>FOD Snapshots Gallery</h2>
        <FODSnapshotGallery enabled={lastPayload?.pipeline_status === 'running'} />
      </div>
    </div>
  );
}



// import { useDetectionStream } from "../hooks/useDetectionStream";
// import { api } from "../services/api.ts";

// export default function DashboardPage() {
//   const { connected, lastPayload, fps } = useDetectionStream();

//   return (
//     <MainLayout>
//       <div className="grid grid-cols-12 gap-4 p-4">
        
//         {/* Kolom kiri — Video Monitor */}
//         <div className="col-span-8">
//           <LiveMonitorPanel
//             frameB64={lastPayload?.frame_b64}
//             anomalyDetected={lastPayload?.anomaly_detected ?? false}
//             bboxes={lastPayload?.bboxes ?? []}
//             fps={fps}
//             connected={connected}
//           />
//         </div>

//         {/* Kolom kanan — Panel Info */}
//         <div className="col-span-4 flex flex-col gap-4">
//           <DetectionInfoPanel
//             anomalyDetected={lastPayload?.anomaly_detected ?? false}
//             anomalyScore={lastPayload?.anomaly_score ?? 0}
//             bboxes={lastPayload?.bboxes ?? []}
//             runwayAreaPct={lastPayload?.runway_area_pct ?? 0}
//           />
//           <PipelineControlPanel
//             connected={connected}
//             pipelineStatus={lastPayload?.pipeline_status ?? "idle"}
//             videoProgress={lastPayload?.video_progress_pct ?? 0}
//             currentFrame={lastPayload?.current_frame ?? 0}
//             totalFrames={lastPayload?.total_frames ?? 0}
//           />
//         </div>

//         {/* Baris bawah */}
//         <div className="col-span-8">
//           <DetectionStatistic
//             scoreHistory={lastPayload?.score_history ?? []}
//             totalFodCount={lastPayload?.total_fod_count ?? 0}
//           />
//         </div>

//         <div className="col-span-4">
//           <FODeventsTimeline
//             events={lastPayload?.recent_events ?? []}
//           />
//         </div>

//       </div>
//     </MainLayout>
//   );
// }


