import React, { useState, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import StatsRow from "../components/dashboard/StatsRow";
import DetectionStatistics from "../components/detection/DetectionStatistic";
import LiveMonitorPanel from "../components/monitoring/LiveMonitorPanel";
import DetectionInfoPanel from "../components/detection/DetectionInfoPanel";
import PipelineControlPanel from "../components/detection/PipelineControlPanel";
import FODeventsTimeline from "../components/detection/FODeventsTimeline";
import "../pages/DashboardPage.css";

export default function DashboardPage() {
  const [liveDetections, setLiveDetections] = useState([]);

  const handleDetectionUpdate = useCallback((detections) => {
    setLiveDetections(detections);
  }, []);

  // Card data for stats row
  const stats = [
    { key: "views", component: <StatsRow statKey="views" />, bgColor: "#E8E9F3" },
    { key: "visits", component: <StatsRow statKey="visits" />, bgColor: "#E3F2FD" },
    { key: "newUsers", component: <StatsRow statKey="newUsers" />, bgColor: "#FFF9E6" },
    { key: "activeUsers", component: <StatsRow statKey="activeUsers" />, bgColor: "#E8F5E9" },
  ];

  return (
    <div className="dashboard">
      {/* Header with title and date selector */}
      <div className="dashboard-header">
        <h1 className="dashboard-title">Overview</h1>
        <button className="dashboard-date-btn">
          <span>Today</span>
          <ChevronDown size={16} />
        </button>
      </div>

      {/* Stats Row: 4 cards with different background colors */}
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
          <LiveMonitorPanel onDetectionUpdate={handleDetectionUpdate} />
        </div>
        <div className="dashboard-card dashboard-traffic-col">
          <DetectionStatistics />
        </div>
      </div>

      {/* Detection Panels Row */}
      <div className="dashboard-detection-row">
        <div className="dashboard-card dashboard-det-info">
          <DetectionInfoPanel detections={liveDetections} />
        </div>
        <div className="dashboard-card dashboard-pipeline">
          <PipelineControlPanel />
        </div>
      </div>

      {/* FOD Events Timeline */}
      <div className="dashboard-card">
        <FODeventsTimeline liveDetections={liveDetections} />
      </div>
    </div>
  );
}