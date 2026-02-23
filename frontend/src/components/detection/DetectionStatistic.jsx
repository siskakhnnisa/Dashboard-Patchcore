import React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import "../../styles/DetectionStatistic.css";

const DETECTION_STATS = [
  { 
    category: "Metal Objects", 
    count: 24, 
    percentage: 85, 
    trend: "up",
    change: "+12%",
    color: "#6366F1", 
    severity: "high" 
  },
  { 
    category: "Debris", 
    count: 18, 
    percentage: 65, 
    trend: "down",
    change: "-5%",
    color: "#F59E0B", 
    severity: "medium" 
  },
  { 
    category: "Wildlife", 
    count: 12, 
    percentage: 45, 
    trend: "up",
    change: "+8%",
    color: "#10B981", 
    severity: "medium" 
  },
  { 
    category: "Equipment", 
    count: 8, 
    percentage: 30, 
    trend: "stable",
    change: "0%",
    color: "#8B5CF6", 
    severity: "low" 
  },
  { 
    category: "Vehicles", 
    count: 6, 
    percentage: 22, 
    trend: "down",
    change: "-3%",
    color: "#EC4899", 
    severity: "low" 
  },
  { 
    category: "Unknown", 
    count: 4, 
    percentage: 15, 
    trend: "up",
    change: "+2%",
    color: "#64748B", 
    severity: "low" 
  },
];

export default function DetectionStatistics() {
  const maxCount = Math.max(...DETECTION_STATS.map((d) => d.count));
  const totalDetections = DETECTION_STATS.reduce((sum, item) => sum + item.count, 0);
  const highPriorityCount = DETECTION_STATS.filter(d => d.severity === "high")
    .reduce((sum, item) => sum + item.count, 0);

  const getTrendIcon = (trend) => {
    switch (trend) {
      case "up":
        return <TrendingUp size={12} />;
      case "down":
        return <TrendingDown size={12} />;
      default:
        return <Minus size={12} />;
    }
  };

  const getTrendClass = (trend) => {
    switch (trend) {
      case "up":
        return "trend-up";
      case "down":
        return "trend-down";
      default:
        return "trend-stable";
    }
  };

  return (
    <div className="detection-stats-widget">
      <div className="detection-stats-header">
        <h3 className="detection-stats-title">Detection Statistics</h3>
        <span className="detection-stats-period">Last 24 Hours</span>
      </div>
      
      <div className="detection-stats-summary">
        <div className="summary-item">
          <span className="summary-value">{totalDetections}</span>
          <span className="summary-label">Total Detections</span>
        </div>
        <div className="summary-divider"></div>
        <div className="summary-item">
          <span className="summary-value">{highPriorityCount}</span>
          <span className="summary-label">High Priority</span>
        </div>
      </div>

      <div className="detection-stats-list">
        {DETECTION_STATS.map((item) => (
          <div key={item.category} className="detection-stat-item">
            <div className="stat-item-header">
              <div className="stat-item-left">
                <span 
                  className="stat-category-dot" 
                  style={{ backgroundColor: item.color }}
                ></span>
                <span className="stat-category">{item.category}</span>
              </div>
              <div className="stat-item-right">
                <span className="stat-count">{item.count}</span>
                <span className={`stat-trend ${getTrendClass(item.trend)}`}>
                  {getTrendIcon(item.trend)}
                  <span className="trend-value">{item.change}</span>
                </span>
              </div>
            </div>
            <div className="stat-bar-wrap">
              <div
                className="stat-bar"
                style={{
                  width: `${(item.count / maxCount) * 100}%`,
                  background: item.color,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="detection-stats-footer">
        <button className="stats-view-all-btn">View Detailed Report</button>
      </div>
    </div>
  );
}