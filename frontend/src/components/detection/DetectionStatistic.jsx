import React, { useMemo } from "react";
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

  // ── Sparkline SVG path ───────────────────────────────────────────────────
  const sparkline = useMemo(() => {
    const data = scoreHistory.slice(-40);
    if (data.length < 2) return null;
    const W = 200, H = 52;
    const THRESHOLD = 0.5;
    const minVal  = Math.min(...data, 0);
    const maxVal  = Math.max(...data, 1);
    const range   = maxVal - minVal || 1;
    const toX     = (i) => (i / (data.length - 1)) * W;
    const toY     = (v) => H - ((v - minVal) / range) * H;
    const path    = data
      .map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`)
      .join(" ");
    const threshY = toY(THRESHOLD);
    return { path, threshY, W, H, count: data.length };
  }, [scoreHistory]);

  const risk = getRiskLevel(anomalyScore);

  return (
    <div className="ds-widget">

      {/* ── Header ── */}
      <div className="ds-header">
        <h3 className="ds-title">Detection Statistics</h3>
        <span className="ds-live-badge">
          <span className="ds-live-dot" />
          Live
        </span>
      </div>

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

      {/* ── Score Trend Sparkline ── */}
      <div className="ds-section">
        <div className="ds-section-label-row">
          <span className="ds-section-label">Score Trend</span>
          {sparkline && (
            <span className="ds-section-sub">last {sparkline.count} frames</span>
          )}
        </div>
        <div className="ds-sparkline-wrap">
          {sparkline ? (
            <svg
              viewBox={`0 0 ${sparkline.W} ${sparkline.H}`}
              className="ds-sparkline"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="ds-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#6366F1" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#6366F1" stopOpacity="0.01" />
                </linearGradient>
              </defs>
              {/* Threshold line */}
              <line
                x1="0" y1={sparkline.threshY}
                x2={sparkline.W} y2={sparkline.threshY}
                stroke="#EF4444" strokeDasharray="3 3" strokeWidth="1" opacity="0.55"
              />
              {/* Fill area under line */}
              <path
                d={`${sparkline.path} L${sparkline.W},${sparkline.H} L0,${sparkline.H} Z`}
                fill="url(#ds-grad)"
              />
              {/* Main line */}
              <path
                d={sparkline.path}
                fill="none"
                stroke="#6366F1"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
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
      </div>

      {/* ── Runway Contamination ── */}
      <div className="ds-runway">
        <div className="ds-runway-top">
          <span className="ds-runway-label">Runway Contamination</span>
          <span className="ds-runway-val">
            {runwayAreaPct.toFixed(1)}
            <span className="ds-runway-unit">%</span>
          </span>
        </div>
        <div className="ds-runway-track">
          <div
            className="ds-runway-fill"
            style={{
              width: `${Math.min(runwayAreaPct, 100)}%`,
              background: runwayAreaPct > 5
                ? "#EF4444"
                : runwayAreaPct > 2
                ? "#F59E0B"
                : "#22C55E",
            }}
          />
        </div>
        <div className="ds-runway-scale">
          <span>0%</span>
          <span>5%</span>
          <span>10%+</span>
        </div>
      </div>

    </div>
  );
}
