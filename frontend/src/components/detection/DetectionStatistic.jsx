import React, { useMemo } from "react";
import { Download } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, ReferenceLine,
  ResponsiveContainer, Tooltip,
} from "recharts";
import "../../styles/DetectionStatistic.css";

const SEVERITY_CONFIG = {
  HIGH:   { color: "#EF4444", label: "High" },
  MEDIUM: { color: "#F59E0B", label: "Medium" },
  LOW:    { color: "#22C55E", label: "Low" },
};

function getRiskLevel(score) {
  if (score >= 0.7) return { label: "HIGH",   color: "#EF4444" };
  if (score >= 0.5) return { label: "MEDIUM", color: "#F59E0B" };
  return               { label: "LOW",    color: "#22C55E" };
}

export default function DetectionStatistics({
  scoreHistory  = [],
  totalFodCount = 0,
  anomalyScore  = 0,
  recentEvents  = [],
  runwayAreaPct = 0,
}) {
  // Download CSV handler
  function handleDownloadCSV() {
    if (!recentEvents.length) return;
    const header = ["Time", "Frame", "Type", "Message", "Score", "Severity"];
    const rows = recentEvents.map(e => [
      e.timestamp ? new Date(e.timestamp).toLocaleString() : "",
      e.frame_id ?? "",
      e.type ?? "",
      (e.message ?? "").replace(/\n/g, " "),
      e.max_score ?? "",
      e.severity ?? ""
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "detection_log.csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
  }
  // ── Severity counts ──────────────────────────────────────────────────────
  const severityCounts = useMemo(() => {
    const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    recentEvents.forEach((e) => {
      const key = (e.severity ?? "LOW").toUpperCase();
      if (key in counts) counts[key]++;
    });
    return counts;
  }, [recentEvents]);

  const totalEvents = recentEvents.length > 0 ? recentEvents.length : totalFodCount;

  // ── Score statistics ─────────────────────────────────────────────────────
  const { avgScore, peakScore, minScore } = useMemo(() => {
    if (!scoreHistory.length) {
      return { avgScore: anomalyScore, peakScore: anomalyScore, minScore: 0 };
    }
    const avg  = scoreHistory.reduce((a, b) => a + b, 0) / scoreHistory.length;
    const peak = Math.max(...scoreHistory);
    const min  = Math.min(...scoreHistory);
    return { avgScore: avg, peakScore: peak, minScore: min };
  }, [scoreHistory, anomalyScore]);

  // ── Recharts data ─────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const data = scoreHistory.slice(-40);
    return data.map((score, i) => ({ idx: i, score }));
  }, [scoreHistory]);

  const risk = getRiskLevel(anomalyScore);

  return (
    <div className="ds-widget">

      {/* ── Header ── */}
      <div className="ds-header" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h3 className="ds-title">Detection Statistics</h3>
        <span className="ds-live-badge">
          <span className="ds-live-dot" />
          Live
        </span>
      </div>

      {/* Download log button and info (only below score pills) */}

      {/* ── Summary Row ── */}
      <div className="ds-summary">
        <div className="ds-summary-item">
          <span className="ds-summary-val">{totalFodCount}</span>
          <span className="ds-summary-lbl">Total Events</span>
        </div>
        <div className="ds-summary-div" />
        <div className="ds-summary-item">
          <span className="ds-summary-val">{avgScore.toFixed(2)}</span>
          <span className="ds-summary-lbl">Avg Score</span>
        </div>
        <div className="ds-summary-div" />
        <div className="ds-summary-item">
          <span className="ds-summary-val" style={{ color: risk.color }}>
            {risk.label}
          </span>
          <span className="ds-summary-lbl">Risk Level</span>
        </div>
      </div>

      {/* ── Severity Breakdown ── */}
      <div className="ds-section">
        <span className="ds-section-label">Severity Breakdown</span>
        <div className="ds-severity-list">
          {Object.entries(SEVERITY_CONFIG).map(([key, cfg]) => {
            const count = severityCounts[key];
            const pct   = totalEvents > 0 ? (count / totalEvents) * 100 : 0;
            return (
              <div key={key} className="ds-sev-item">
                <div className="ds-sev-left">
                  <span className="ds-sev-dot" style={{ background: cfg.color }} />
                  <span className="ds-sev-label">{cfg.label}</span>
                </div>
                <div className="ds-sev-bar-wrap">
                  <div
                    className="ds-sev-bar"
                    style={{ width: `${pct}%`, background: cfg.color }}
                  />
                </div>
                <div className="ds-sev-right">
                  <span className="ds-sev-count">{count}</span>
                  <span className="ds-sev-pct">{Math.round(pct)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Score Trend (Recharts) ── */}
      <div className="ds-section">
        <div className="ds-section-label-row">
          <span className="ds-section-label">Score Trend</span>
          {chartData.length > 1 && (
            <span className="ds-section-sub">last {chartData.length} frames</span>
          )}
        </div>
        <div className="ds-sparkline-wrap">
          {chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={64}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="ds-area-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366F1" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#6366F1" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="idx" hide />
                <YAxis domain={[0, 1]} hide />
                <ReferenceLine y={0.5} stroke="#EF4444" strokeDasharray="3 3" strokeWidth={1} opacity={0.55} />
                <Tooltip
                  contentStyle={{ background: "#1F2937", border: "none", borderRadius: 6, fontSize: 11, color: "#E5E7EB" }}
                  labelFormatter={() => ""}
                  formatter={(v) => [v.toFixed(3), "Score"]}
                />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke="#6366F1"
                  strokeWidth={1.8}
                  fill="url(#ds-area-grad)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="ds-sparkline-empty">Menunggu data stream...</div>
          )}
          <span className="ds-threshold-lbl">threshold 0.5</span>
        </div>

        {/* Score stats pills */}
        <div className="ds-score-row">
          <div className="ds-score-pill">
            <span className="ds-score-pill-lbl">Peak</span>
            <span className="ds-score-pill-val" style={{ color: "#EF4444" }}>
              {peakScore.toFixed(2)}
            </span>
          </div>
          <div className="ds-score-pill ds-score-pill--current">
            <span className="ds-score-pill-lbl">Current</span>
            <span className="ds-score-pill-val" style={{ color: risk.color }}>
              {anomalyScore.toFixed(2)}
            </span>
          </div>
          <div className="ds-score-pill">
            <span className="ds-score-pill-lbl">Min</span>
            <span className="ds-score-pill-val" style={{ color: "#22C55E" }}>
              {minScore.toFixed(2)}
            </span>
          </div>
        </div>
        {/* Download log button and info */}
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 11.5, color: '#64748b', textAlign: 'center', maxWidth: 260, marginTop: 10 }}>
            Unduh riwayat deteksi FOD dalam format CSV.
          </span>
          <button
            className="ds-log-btn"
            style={{
              display: 'flex', alignItems: 'center', gap: 5, background: '#F5F7FF', border: '1px solid #E0E7FF', borderRadius: 7, padding: '6px 15px', fontSize: 12, color: '#6366F1', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s', marginTop: 2
            }}
            onClick={handleDownloadCSV}
            title="Download detection log as CSV"
            disabled={!recentEvents.length}
          >
            <Download size={15} style={{ marginRight: 2, opacity: 0.85 }} />
            Download Detection Log
          </button>
        </div>
      </div>



    </div>
  );
}
