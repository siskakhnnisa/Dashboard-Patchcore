import React, { useMemo } from "react";
import {
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, ReferenceLine,
  ResponsiveContainer, Tooltip, Legend,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  TrendingUp,
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  Target,
  Download,
} from "lucide-react";
import { useDetectionStream } from "../hooks/useDetectionStream";
import { useAllSnapshots } from "../hooks/useQueries";
import "../styles/DetectionStatsPage.css";

// ── Helpers ──────────────────────────────────────────────────────────────────
const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) ||
  "http://localhost:8000";

function getRiskLevel(score) {
  if (score >= 0.7) return { label: "HIGH",   color: "#EF4444" };
  if (score >= 0.5) return { label: "MEDIUM", color: "#F59E0B" };
  return              { label: "LOW",    color: "#22C55E" };
}

function fmtScore(v) {
  return typeof v === "number" ? v.toFixed(3) : "—";
}

function fmtTime(ts) {
  if (!ts) return "—";
  const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────
function DsTooltip({ active, payload, label, labelPrefix = "" }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="ds-tooltip">
      {label !== undefined && (
        <div className="ds-tooltip-label">{labelPrefix}{label}</div>
      )}
      {payload.map((p, i) => (
        <div key={i} className="ds-tooltip-row">
          <span className="ds-tooltip-dot" style={{ background: p.color || p.fill }} />
          <span>{p.name}: <strong>{typeof p.value === "number" ? p.value.toFixed(3) : p.value}</strong></span>
        </div>
      ))}
    </div>
  );
}

// ── Severity Badge ────────────────────────────────────────────────────────────
function SevBadge({ sev }) {
  const colors = {
    HIGH:    { color: "#EF4444", bg: "#FEF2F2", border: "#FCA5A5" },
    MEDIUM:  { color: "#F59E0B", bg: "#FFFBEB", border: "#FDE68A" },
    LOW:     { color: "#22C55E", bg: "#F0FDF4", border: "#86EFAC" },
  };
  const s = (sev || "LOW").toUpperCase();
  const cfg = colors[s] || colors.LOW;
  return (
    <span className="ds-sev-badge" style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}>
      {s}
    </span>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, iconBg, iconColor, value, label, sub }) {
  return (
    <div className="ds-kpi-card">
      <div className="ds-kpi-icon" style={{ background: iconBg }}>
        <Icon size={17} color={iconColor} />
      </div>
      <div className="ds-kpi-body">
        <span className="ds-kpi-value">{value}</span>
        <span className="ds-kpi-label">{label}</span>
        {sub && <span className="ds-kpi-sub">{sub}</span>}
      </div>
    </div>
  );
}

// ── Chart Card wrapper ────────────────────────────────────────────────────────
function ChartCard({ icon: Icon, title, iconColor = "#6366F1", children }) {
  return (
    <div className="ds-chart-card">
      <div className="ds-chart-header">
        <Icon size={14} color={iconColor} />
        {title}
      </div>
      <div className="ds-chart-body">{children}</div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function DetectionStatsPage() {
  const { lastPayload, fps, connected } = useDetectionStream();
  const { data: allSnapshots = [] } = useAllSnapshots();

  // ── Real-time data from WebSocket ─────────────────────────────────────────
  const scoreHistory   = lastPayload?.score_history  ?? [];
  const recentEvents   = lastPayload?.recent_events  ?? [];
  const anomalyScore   = lastPayload?.anomaly_score  ?? 0;
  const totalFodCount  = lastPayload?.total_fod_count ?? 0;
  const runwayAreaPct  = lastPayload?.runway_area_pct ?? 0;
  const elapsedSeconds = lastPayload?.elapsed_seconds ?? 0;
  const currentFps     = lastPayload?.fps ?? fps ?? 0;
  const bboxes         = lastPayload?.bboxes ?? [];

  // ── Score stats ───────────────────────────────────────────────────────────
  const { avgScore, peakScore, minScore } = useMemo(() => {
    if (!scoreHistory.length) return { avgScore: anomalyScore, peakScore: anomalyScore, minScore: 0 };
    const avg  = scoreHistory.reduce((a, b) => a + b, 0) / scoreHistory.length;
    const peak = Math.max(...scoreHistory);
    const min  = Math.min(...scoreHistory);
    return { avgScore: avg, peakScore: peak, minScore: min };
  }, [scoreHistory, anomalyScore]);

  const risk = getRiskLevel(anomalyScore);

  // ── Score trend chart data ────────────────────────────────────────────────
  const scoreTrendData = useMemo(
    () => scoreHistory.slice(-60).map((score, i) => ({ idx: i, score })),
    [scoreHistory]
  );

  // ── Severity breakdown from recent events ────────────────────────────────
  const severityData = useMemo(() => {
    const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    recentEvents.forEach((e) => {
      const k = (e.severity ?? "LOW").toUpperCase();
      if (k in counts) counts[k]++;
    });
    return [
      { name: "High",   value: counts.HIGH,   color: "#EF4444" },
      { name: "Medium", value: counts.MEDIUM, color: "#F59E0B" },
      { name: "Low",    value: counts.LOW,    color: "#22C55E" },
    ];
  }, [recentEvents]);

  const totalSev = severityData.reduce((a, d) => a + d.value, 0);

  // ── Confidence distribution from current bboxes ───────────────────────────
  const confDistData = useMemo(() => {
    const buckets = [
      { range: "0–20%",  min: 0.0,  max: 0.2,  count: 0 },
      { range: "20–40%", min: 0.2,  max: 0.4,  count: 0 },
      { range: "40–60%", min: 0.4,  max: 0.6,  count: 0 },
      { range: "60–80%", min: 0.6,  max: 0.8,  count: 0 },
      { range: "80–100%",min: 0.8,  max: 1.01, count: 0 },
    ];
    // Use all bboxes from recentEvents + current frame
    const allBboxConf = [
      ...bboxes.map((b) => b.confidence),
      ...recentEvents.flatMap((e) => (e.bboxes ?? []).map((b) => b.confidence)),
    ].filter((c) => typeof c === "number");

    allBboxConf.forEach((c) => {
      const b = buckets.find((bk) => c >= bk.min && c < bk.max);
      if (b) b.count++;
    });
    return buckets;
  }, [bboxes, recentEvents]);

  // ── Validation status from snapshots (REST) ───────────────────────────────
  const validationData = useMemo(() => {
    const counts = { confirmed: 0, rejected: 0, pending: 0 };
    allSnapshots.forEach((s) => {
      const k = s.validation_status ?? "pending";
      if (k in counts) counts[k]++;
    });
    return [
      { name: "Confirmed", value: counts.confirmed, color: "#22C55E", bg: "#F0FDF4", border: "#86EFAC" },
      { name: "Rejected",  value: counts.rejected,  color: "#EF4444", bg: "#FEF2F2", border: "#FCA5A5" },
      { name: "Pending",   value: counts.pending,   color: "#F59E0B", bg: "#FFFBEB", border: "#FDE68A" },
    ];
  }, [allSnapshots]);

  const totalSnap = allSnapshots.length;

  // ── Score histogram (last 60 scores bucketed) ─────────────────────────────
  const scoreHistogramData = useMemo(() => {
    const buckets = [
      { range: "0.0–0.2", min: 0.0, max: 0.2, count: 0 },
      { range: "0.2–0.4", min: 0.2, max: 0.4, count: 0 },
      { range: "0.4–0.6", min: 0.4, max: 0.6, count: 0 },
      { range: "0.6–0.8", min: 0.6, max: 0.8, count: 0 },
      { range: "0.8–1.0", min: 0.8, max: 1.01, count: 0 },
    ];
    scoreHistory.forEach((s) => {
      const b = buckets.find((bk) => s >= bk.min && s < bk.max);
      if (b) b.count++;
    });
    return buckets;
  }, [scoreHistory]);

  // ── Top events for table ──────────────────────────────────────────────────
  const topEvents = useMemo(
    () => [...recentEvents].sort((a, b) => (b.max_score ?? 0) - (a.max_score ?? 0)).slice(0, 10),
    [recentEvents]
  );

  // ── CSV download ──────────────────────────────────────────────────────────
  function handleExportCSV() {
    if (!recentEvents.length) return;
    const header = ["Time", "Frame", "FOD Count", "Max Score", "Severity"];
    const rows = recentEvents.map((e) => [
      fmtTime(e.timestamp),
      e.frame_id ?? "",
      e.fod_count ?? "",
      e.max_score?.toFixed(3) ?? "",
      e.severity ?? "",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = "detection_stats.csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
  }

  // ── Elapsed time fmt ─────────────────────────────────────────────────────
  const elapsedFmt = useMemo(() => {
    const s = Math.round(elapsedSeconds);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
  }, [elapsedSeconds]);

  return (
    <div className="ds-page">

      {/* ── Page Header ── */}
      <div className="ds-header">
        <div>
          <h1 className="ds-title">Detection Stats</h1>
          <p className="ds-subtitle">
            Statistik real-time deteksi FOD — sesi aktif &amp; riwayat snapshot
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {/* Connection indicator */}
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 12, fontWeight: 600,
            color: connected ? "#059669" : "#94A3B8",
            background: connected ? "#ECFDF5" : "#F8FAFC",
            border: `1px solid ${connected ? "#A7F3D0" : "#E2E8F0"}`,
            borderRadius: 999, padding: "4px 12px",
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: connected ? "#10B981" : "#94A3B8",
              animation: connected ? "ds-pulse 2s infinite" : "none",
            }} />
            {connected ? "Live" : "Offline"}
          </span>
          <button
            onClick={handleExportCSV}
            disabled={!recentEvents.length}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "6px 14px", borderRadius: 8, fontSize: 12,
              fontWeight: 600, cursor: recentEvents.length ? "pointer" : "not-allowed",
              background: "#F5F7FF", border: "1px solid #E0E7FF",
              color: "#6366F1", opacity: recentEvents.length ? 1 : 0.45,
            }}
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      {/* ── KPI Row (5 cards) ── */}
      <div className="ds-kpi-row">
        <KpiCard
          icon={AlertTriangle}
          iconBg="#FEF2F2" iconColor="#EF4444"
          value={totalFodCount}
          label="Total Events"
          sub="sejak pipeline start"
        />
        <KpiCard
          icon={Activity}
          iconBg="#EEF2FF" iconColor="#6366F1"
          value={fmtScore(anomalyScore)}
          label="Anomaly Score"
          sub={<span style={{ color: risk.color, fontWeight: 600 }}>{risk.label}</span>}
        />
        <KpiCard
          icon={TrendingUp}
          iconBg="#FFF7ED" iconColor="#F97316"
          value={fmtScore(peakScore)}
          label="Peak Score"
          sub={`avg ${fmtScore(avgScore)}`}
        />
        <KpiCard
          icon={Zap}
          iconBg="#F0FDF4" iconColor="#22C55E"
          value={`${currentFps.toFixed(1)} fps`}
          label="Pipeline FPS"
          sub={`elapsed ${elapsedFmt}`}
        />
        <KpiCard
          icon={Target}
          iconBg="#F0F9FF" iconColor="#0EA5E9"
          value={`${runwayAreaPct.toFixed(1)}%`}
          label="Runway Coverage"
          sub={`${totalSnap} snapshot tersimpan`}
        />
      </div>

      {/* ── Row 1: Score Trend + Severity Donut ── */}
      <div className="ds-chart-grid ds-grid-2">

        {/* Score Trend */}
        <ChartCard icon={Activity} title="Score Trend — 60 Frame Terakhir" iconColor="#6366F1">
          {scoreTrendData.length > 1 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={scoreTrendData} margin={{ top: 6, right: 8, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="dsp-score-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#6366F1" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#6366F1" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="idx" tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} />
                <YAxis domain={[0, 1]} tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} width={32} />
                <ReferenceLine y={0.5} stroke="#EF4444" strokeDasharray="4 3" strokeWidth={1.2} opacity={0.6} label={{ value: "Threshold 0.5", position: "right", fontSize: 9, fill: "#EF4444" }} />
                <Tooltip content={<DsTooltip labelPrefix="Frame " />} />
                <Area
                  type="monotone"
                  dataKey="score"
                  name="Anomaly Score"
                  stroke="#6366F1"
                  strokeWidth={1.8}
                  fill="url(#dsp-score-grad)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="ds-chart-empty">Menunggu data stream…</div>
          )}
          {/* Min / Avg / Peak pills */}
          <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "center" }}>
            {[
              { label: "Min",  val: fmtScore(minScore),  color: "#22C55E" },
              { label: "Avg",  val: fmtScore(avgScore),  color: "#6366F1" },
              { label: "Peak", val: fmtScore(peakScore), color: "#EF4444" },
            ].map((p) => (
              <div key={p.label} style={{
                flex: 1, textAlign: "center", background: "#F8FAFC",
                border: "1px solid #E2E8F0", borderRadius: 8, padding: "7px 0",
              }}>
                <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 500 }}>{p.label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: p.color }}>{p.val}</div>
              </div>
            ))}
          </div>
        </ChartCard>

        {/* Severity Donut */}
        <ChartCard icon={AlertTriangle} title="Severity Breakdown" iconColor="#F59E0B">
          {totalSev > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie
                    data={severityData}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={78}
                    dataKey="value"
                    paddingAngle={3}
                    isAnimationActive={false}
                  >
                    {severityData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v, n) => [`${v} (${Math.round((v / totalSev) * 100)}%)`, n]}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E2E8F0" }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 4 }}>
                {severityData.map((d) => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: d.color, display: "inline-block" }} />
                    <span style={{ fontSize: 11.5, color: "#64748B" }}>
                      {d.name} <strong style={{ color: "#374151" }}>{d.value}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="ds-chart-empty">Menunggu event…</div>
          )}
        </ChartCard>
      </div>

      {/* ── Row 2: Score Histogram + Validation Status ── */}
      <div className="ds-chart-grid ds-grid-2">

        {/* Score Histogram */}
        <ChartCard icon={TrendingUp} title="Distribusi Anomaly Score" iconColor="#6366F1">
          {scoreHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={scoreHistogramData} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="range" tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} width={28} allowDecimals={false} />
                <Tooltip
                  formatter={(v) => [v, "Jumlah frame"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E2E8F0" }}
                />
                <Bar dataKey="count" name="Frames" radius={[4, 4, 0, 0]}>
                  {scoreHistogramData.map((d) => {
                    const c = d.min >= 0.7 ? "#EF4444" : d.min >= 0.5 ? "#F59E0B" : "#6366F1";
                    return <Cell key={d.range} fill={c} fillOpacity={0.85} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="ds-chart-empty">Menunggu data stream…</div>
          )}
        </ChartCard>

        {/* Validation Status */}
        <ChartCard icon={CheckCircle2} title="Status Validasi Snapshot" iconColor="#22C55E">
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 0" }}>
            {validationData.map((d) => {
              const pct = totalSnap > 0 ? (d.value / totalSnap) * 100 : 0;
              const IconComp = d.name === "Confirmed" ? CheckCircle2 : d.name === "Rejected" ? XCircle : Clock;
              return (
                <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: d.bg, border: `1px solid ${d.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <IconComp size={14} color={d.color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{d.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: d.color }}>{d.value} <span style={{ color: "#94A3B8", fontWeight: 400 }}>({Math.round(pct)}%)</span></span>
                    </div>
                    <div style={{ height: 6, background: "#F1F5F9", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: d.color, borderRadius: 999, transition: "width 0.8s ease" }} />
                    </div>
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 8, padding: "8px 12px", background: "#F8FAFC", borderRadius: 8, border: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11.5, color: "#64748B" }}>Total Snapshot Tersimpan</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#1E293B" }}>{totalSnap}</span>
            </div>
          </div>
        </ChartCard>
      </div>

      {/* ── Confidence Distribution (bbox) ── */}
      {confDistData.some((d) => d.count > 0) && (
        <ChartCard icon={Target} title="Distribusi Confidence Bounding Box" iconColor="#0EA5E9">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={confDistData} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="range" tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} width={28} allowDecimals={false} />
              <Tooltip
                formatter={(v) => [v, "Bounding boxes"]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E2E8F0" }}
              />
              <Bar dataKey="count" name="BBoxes" fill="#0EA5E9" radius={[4, 4, 0, 0]} fillOpacity={0.8} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* ── Top Events Table ── */}
      <ChartCard icon={AlertTriangle} title="Top Events — Berdasarkan Anomaly Score Tertinggi" iconColor="#EF4444">
        {topEvents.length > 0 ? (
          <div className="ds-table-wrap ds-top-frames">
            <table className="ds-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Waktu</th>
                  <th>Frame</th>
                  <th>FOD Count</th>
                  <th>Max Score</th>
                  <th>Severity</th>
                </tr>
              </thead>
              <tbody>
                {topEvents.map((e, i) => (
                  <tr key={e.event_id ?? i}>
                    <td className="ds-cell-rank">{i + 1}</td>
                    <td>
                      <div className="ds-cell-time">
                        <span>{fmtTime(e.timestamp)}</span>
                      </div>
                    </td>
                    <td className="ds-mono">#{e.frame_id ?? "—"}</td>
                    <td style={{ textAlign: "center", fontWeight: 600, color: "#374151" }}>
                      {e.fod_count ?? "—"}
                    </td>
                    <td>
                      <span
                        className="ds-conf"
                        style={{ color: getRiskLevel(e.max_score ?? 0).color }}
                      >
                        {fmtScore(e.max_score)}
                      </span>
                    </td>
                    <td><SevBadge sev={e.severity} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="ds-chart-empty">Belum ada event terdeteksi…</div>
        )}
      </ChartCard>

    </div>
  );
}

