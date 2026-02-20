import React, { useState, useEffect } from "react";
import {
  AlertTriangle,
  Info,
  CheckCircle,
  Clock,
  ChevronDown,
} from "lucide-react";
import "../../styles/FODEventsTimeline.css";

const EVENT_TYPES = {
  detection: { icon: AlertTriangle, color: "#ef4444", label: "FOD Detection" },
  clear: { icon: CheckCircle, color: "#22c55e", label: "Clear" },
  info: { icon: Info, color: "#3b82f6", label: "System Info" },
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

export default function FODEventsTimeline({ liveDetections = [] }) {
  const [events, setEvents] = useState(INITIAL_EVENTS);
  const [expandedId, setExpandedId] = useState(null);
  const [, forceUpdate] = useState(0);

  // Re-render every 30s for "time ago" updates
  useEffect(() => {
    const t = setInterval(() => forceUpdate((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // Add new events based on live detections
  useEffect(() => {
    if (liveDetections.length > 0) {
      const highSev = liveDetections.filter((d) => d.severity === "high");
      if (highSev.length > 0) {
        setEvents((prev) => {
          // Don't add duplicate events too quickly
          const last = prev[0];
          if (
            last &&
            new Date() - last.time < 30000 &&
            last.type === "detection"
          )
            return prev;
          const newEvent = {
            id: Date.now(),
            type: "detection",
            message: `FOD detected — ${highSev.length} object${
              highSev.length > 1 ? "s" : ""
            }`,
            details: `Objects: ${liveDetections.length} total | High severity: ${highSev.length}`,
            time: new Date(),
            severity: "high",
          };
          return [newEvent, ...prev].slice(0, 20);
        });
      }
    }
  }, [liveDetections.length]);

  return (
    <div className="timeline card">
      <div className="timeline-header">
        <div className="timeline-title-row">
          <span className="section-title" style={{ margin: 0 }}>
            FOD Events Timeline
          </span>
          <span className="timeline-count">{events.length} events</span>
        </div>
        <div className="timeline-filters">
          <button className="timeline-filter active">All</button>
          <button className="timeline-filter">Detections</button>
          <button className="timeline-filter">Cleared</button>
        </div>
      </div>

      <div className="timeline-list">
        {events.map((event) => {
          const { icon: Icon, color } = EVENT_TYPES[event.type];
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
                >
                  <Icon size={9} color="white" />
                </div>
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
                      <Clock size={9} />
                      <span>{formatTime(event.time)}</span>
                    </div>
                    <ChevronDown
                      size={11}
                      className={`timeline-expand-icon ${
                        isExpanded ? "rotated" : ""
                      }`}
                    />
                  </div>
                </div>

                {isExpanded && (
                  <div className="timeline-event-details animate-fade-in">
                    <div className="timeline-detail-text">{event.details}</div>
                    <div className="timeline-timestamp">
                      <Clock size={9} />
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
