import React from "react";
import StatsRow from "../components/dashboard/StatsRow";
import DetectionStatistics from "../components/detection/DetectionStatistic";
import { useDetectionStream } from "../hooks/useDetectionStream";
import { useDetectionStore } from "../stores/useDetectionStore";
import "../styles/DashboardPage.css";

export default function DashboardPage() {

  // useDetectionStream hanya dipanggil untuk memastikan WS aktif;
  // data sebenarnya dibaca langsung dari Zustand store (shared, no double state)
  useDetectionStream();

  const lastPayload = useDetectionStore((s) => s.lastPayload);

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

      {/* Detection Statistics */}
      <div className="dashboard-card dashboard-traffic-col">
        <DetectionStatistics
          scoreHistory={lastPayload?.score_history ?? []}
          totalFodCount={lastPayload?.total_fod_count ?? 0}
          anomalyScore={lastPayload?.anomaly_score ?? 0}
          recentEvents={lastPayload?.recent_events ?? []}
          runwayAreaPct={lastPayload?.runway_area_pct ?? 0}
        />
      </div>
    </div>
  );
}