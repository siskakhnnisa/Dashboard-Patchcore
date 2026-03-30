
import React from "react";
import { MapPin, TrendingUp, Zap, Wifi, ArrowUpRight } from "lucide-react";
import "../../styles/FODeventsTimeline.css";

// Dummy telemetry data for demonstration
const INITIAL_TELEMETRY = [
  { id: 1, time: new Date(Date.now() - 10000), lat: -6.2001, lon: 106.8167, alt: 120, speed: 15.2, battery: 87, signal: 4 },
  { id: 2, time: new Date(Date.now() - 8000), lat: -6.2002, lon: 106.8168, alt: 122, speed: 15.4, battery: 86, signal: 4 },
  { id: 3, time: new Date(Date.now() - 6000), lat: -6.2003, lon: 106.8169, alt: 125, speed: 15.7, battery: 86, signal: 3 },
  { id: 4, time: new Date(Date.now() - 4000), lat: -6.2004, lon: 106.8170, alt: 127, speed: 15.9, battery: 85, signal: 3 },
  { id: 5, time: new Date(Date.now() - 2000), lat: -6.2005, lon: 106.8171, alt: 130, speed: 16.0, battery: 85, signal: 2 },
];

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}


function BatteryBar({ value }) {
  const color = value > 60 ? "#22c55e" : value > 30 ? "#eab308" : "#ef4444";
  return (
    <div style={{ width: 34, height: 9, background: "#f1f5f9", borderRadius: 4, overflow: "hidden", border: "1px solid #e2e8f0", display: "inline-block", marginRight: 4 }}>
      <div style={{ width: `${value}%`, height: "100%", background: color, transition: "width 0.3s" }} />
    </div>
  );
}

function SignalBars({ level }) {
  // level: 0-4
  return (
    <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 1, marginRight: 4 }}>
      {[1, 2, 3, 4].map((n) => (
        <span key={n} style={{
          width: 3,
          height: 3 + n * 3,
          background: n <= level ? "#38bdf8" : "#e2e8f0",
          borderRadius: 1.5,
          display: "inline-block"
        }} />
      ))}
    </span>
  );
}


export default function DroneTelemetryPanel({ telemetry = [] }) {
  // Ambil data terbaru (paling akhir), fallback ke dummy jika kosong

  const latest = (telemetry.length > 0 ? telemetry : INITIAL_TELEMETRY)[telemetry.length > 0 ? telemetry.length - 1 : INITIAL_TELEMETRY.length - 1];

  return (
    <div className="timeline card" style={{ minHeight: 120, background: "linear-gradient(120deg, #f8fafc 60%, #e0e7ff 100%)", boxShadow: "0 1px 4px #0001", borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'center', border: '1px solid #e5e7eb' }}>
      <div className="timeline-header" style={{ marginBottom: 8 }}>
        <div className="timeline-title-row" style={{ alignItems: 'center', gap: 8 }}>
          <ArrowUpRight size={18} color="#2563eb" style={{ background: '#e0e7ff', borderRadius: 6, padding: 2 }} />
          <span className="section-title" style={{ margin: 0, fontWeight: 600, fontSize: 15.5, color: "#1e293b", letterSpacing: 0.2 }}>
            Drone Telemetry
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'center', fontSize: 13, color: '#334155', justifyContent: 'space-between', paddingTop: 2 }}>
        <span style={{ minWidth: 140, display: 'flex', alignItems: 'center', gap: 7 }}>
          <MapPin size={16} color="#0ea5e9" style={{ opacity: 0.85 }} />
          <span style={{ color: "#64748b" }}>GPS:</span> <b>{latest.lat.toFixed(5)}, {latest.lon.toFixed(5)}</b>
        </span>
        <span style={{ minWidth: 90, display: 'flex', alignItems: 'center', gap: 7 }}>
          <TrendingUp size={16} color="#f59e42" style={{ opacity: 0.85 }} />
          <span style={{ color: "#64748b" }}>Altitude:</span> <b>{latest.alt} m</b>
        </span>
        <span style={{ minWidth: 90, display: 'flex', alignItems: 'center', gap: 7 }}>
          <ArrowUpRight size={15} color="#22c55e" style={{ opacity: 0.85 }} />
          <span style={{ color: "#64748b" }}>Speed:</span> <b>{latest.speed} m/s</b>
        </span>
        <span style={{ minWidth: 110, display: "flex", alignItems: "center", gap: 7 }}>
          <Zap size={15} color="#facc15" style={{ opacity: 0.85 }} />
          <span style={{ color: "#64748b" }}>Battery:</span> <BatteryBar value={latest.battery} /> <b>{latest.battery}%</b>
        </span>
        <span style={{ minWidth: 80, display: "flex", alignItems: "center", gap: 7 }}>
          <Wifi size={15} color="#38bdf8" style={{ opacity: 0.85 }} />
          <SignalBars level={latest.signal} />
          <span style={{ fontSize: 11.5, color: "#64748b", marginLeft: 2 }}>Signal</span>
        </span>
      </div>
    </div>
  );
}
