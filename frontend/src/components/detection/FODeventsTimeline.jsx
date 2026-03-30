import React, { useState, useEffect } from "react";
// import {
//   AlertTriangle,
//   Info,
//   CheckCircle,
//   Clock,
//   ChevronDown,
// } from "lucide-react";
import "../../styles/FODEventsTimeline.css";

const EVENT_TYPES = {
  detection: { color: "#ef4444", label: "FOD Detection" },
  clear: { color: "#22c55e", label: "Clear" },
  info: { color: "#3b82f6", label: "System Info" },
};

const INITIAL_EVENTS = [
  {
    id: 1,
    type: "detection",
    message: "FOD detected in Zone A — confidence 94%",
    details: "Object: Unknown debris | Area: 2,340 px | Persistence: 12 frames",
    time: new Date(Date.now() - 3 * 60000),
    severity: "high",
  },
  {
    id: 2,
    type: "detection",
    message: "FOD detected in Zone C — confidence 81%",
    details: "Object: Possible bolt | Area: 1,120 px | Persistence: 6 frames",
    time: new Date(Date.now() - 8 * 60000),
    severity: "medium",
  },
  {
    id: 3,
    type: "clear",
    message: "Runway cleared — no FOD detected",
    details: "All clear confirmed after 30 second monitoring window",
    time: new Date(Date.now() - 18 * 60000),
    severity: null,
  },
  {
    id: 4,
    type: "detection",
    message: "Anomaly detected in Zone B — confidence 73%",
    details:
      "Object: Unidentified debris | Area: 890 px | Persistence: 4 frames",
    time: new Date(Date.now() - 35 * 60000),
    severity: "low",
  },
  {
    id: 5,
    type: "info",
    message: "System calibration completed",
    details: "PatchCore model re-calibrated. Threshold: 0.72",
    time: new Date(Date.now() - 59 * 60000),
    severity: null,
  },
];

function formatTime(date) {
  const diff = Math.round((new Date() - date) / 60000);
  if (diff < 1) return "just now";
  if (diff === 1) return "1 min ago";
  if (diff < 60) return `${diff} mins ago`;
  return `${Math.round(diff / 60)}h ago`;
}

function formatTimestamp(date) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function FODEventsTimeline({ events = [] }) {
  const [expandedId, setExpandedId] = useState(null);
  const [, forceUpdate] = useState(0);

  // Re-render every 30s for "time ago" updates
  useEffect(() => {
    const t = setInterval(() => forceUpdate((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // Tampilkan event dari backend, fallback ke dummy jika kosong
  const timelineEvents = events.length > 0 ? events.map((e, idx) => ({
    id: e.event_id || idx,
    type: e.type || 'detection',
    message: e.message || `FOD detected — ${e.fod_count ?? 1} object(s)`,
    details: e.details || `Frame: ${e.frame_id ?? '-'} | Score: ${e.max_score ?? '-'} | Severity: ${e.severity ?? '-'}`,
    time: e.timestamp ? new Date(e.timestamp) : new Date(),
    severity: (e.severity || '').toLowerCase(),
  })) : INITIAL_EVENTS;

  return (
    <div className="timeline card">
      <div className="timeline-header">
        <div className="timeline-title-row">
          <span className="section-title" style={{ margin: 0 }}>
            FOD Events Timeline
          </span>
          <span className="timeline-count">{timelineEvents.length} events</span>
        </div>
        <div className="timeline-filters">
          <button className="timeline-filter active">All</button>
          <button className="timeline-filter">Detections</button>
          <button className="timeline-filter">Cleared</button>
        </div>
      </div>

      <div className="timeline-list">
        {timelineEvents.map((event) => {
          const { color } = EVENT_TYPES[event.type] || EVENT_TYPES.detection;
          const isExpanded = expandedId === event.id;
          return (
            <div
              key={event.id}
              className={`timeline-event ${event.type} ${
                isExpanded ? "expanded" : ""
              }`}
              onClick={() => setExpandedId(isExpanded ? null : event.id)}
            >
              {/* Timeline line */}
              <div className="timeline-track">
                <div
                  className="timeline-node"
                  style={{ background: color, borderColor: color }}
                />
                <div
                  className="timeline-line"
                  style={{ background: color + "30" }}
                />
              </div>

              {/* Content */}
              <div className="timeline-event-content">
                <div className="timeline-event-top">
                  <div className="timeline-event-left">
                    <span className="timeline-event-msg">{event.message}</span>
                    {event.severity && (
                      <span
                        className={`badge badge-${
                          event.severity === "high"
                            ? "red"
                            : event.severity === "medium"
                            ? "yellow"
                            : "gray"
                        }`}
                      >
                        {event.severity}
                      </span>
                    )}
                  </div>
                  <div className="timeline-event-right">
                    <div className="timeline-event-time">
                      <span>{formatTime(event.time)}</span>
                    </div>
                    <span
                      className={`timeline-expand-icon ${isExpanded ? "rotated" : ""}`}
                    >▼</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="timeline-event-details animate-fade-in">
                    <div className="timeline-detail-text">{event.details}</div>
                    <div className="timeline-timestamp">
                      {formatTimestamp(event.time)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
