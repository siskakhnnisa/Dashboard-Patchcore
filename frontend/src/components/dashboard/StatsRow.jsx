import React from "react";
import {
  TrendingUp,
  TrendingDown,
  Users,
  Activity,
  AlertTriangle,
} from "lucide-react";
import "../../styles/StatsRow.css";

const STATS = [
  {
    label: "Menu",
    value: "FOD Detection",
    positive: true,
  }
];

export default function StatsRow() {
  return (
    <div className="stats-row">
      {STATS.map((stat) => (
        <div key={stat.label} className="stat-card card">
          <div className="stat-label">{stat.label}</div>
          <div className="stat-bottom">
            <div className="stat-value">{stat.value}</div>
            <div
              className={`stat-change ${
                stat.positive ? "positive" : "negative"
              }`}
            >
              {stat.positive ? (
                <TrendingUp size={13} />
              ) : (
                <TrendingDown size={13} />
              )}
              <span>{stat.change}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
