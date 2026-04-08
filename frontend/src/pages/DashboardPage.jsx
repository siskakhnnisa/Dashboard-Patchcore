import React, { useCallback, useEffect, useState, startTransition } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plane, MonitorPlay, Camera, BarChart2, FolderSearch,
  FileText, Activity, Wifi, WifiOff, AlertTriangle, CheckCircle2,
  Layers, TrendingUp, Radio, Clock, ScrollText, History,
} from "lucide-react";
import { useDetectionStore } from "../stores/useDetectionStore";
import {
  useActivityHistoryEntries,
  useActivityHistorySummary,
  useDetectionStatsOverview,
  useDetectionStatsPerSession,
  usePipelineStatus,
} from "../hooks/useQueries";
import { preloadRoute } from "../utils/routePreloaders";

/* ── helpers ── */
function fmt(v, decimals = 0) {
  if (v == null) return "—";
  return typeof v === "number" ? v.toFixed(decimals) : v;
}
function fmtPct(v) { return v != null ? `${(v * 100).toFixed(1)}%` : "—"; }
function fmtConf(v) { return v != null ? `${(v * 100).toFixed(1)}%` : "—"; }

/* ── KPI Card ── */
function KpiCard({ icon: Icon, iconBg, iconColor, label, value, sub, subColor }) {
  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: 14,
      padding: "18px 20px", display: "flex", alignItems: "center", gap: 14,
      boxShadow: "var(--shadow-card)",
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 11, background: iconBg,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Icon size={20} color={iconColor} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 500, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: "1.45rem", fontWeight: 700, color: "var(--text-heading)", lineHeight: 1.15 }}>{value}</div>
        {sub && <div style={{ fontSize: "0.7rem", color: subColor ?? "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

/* ── Quick Nav Card ── */
const NavCard = React.memo(function NavCard({ icon: Icon, iconColor, iconBg, title, desc, to, onNavigate }) {
  return (
    <button
      type="button"
      onPointerEnter={() => preloadRoute(to)}
      onFocus={() => preloadRoute(to)}
      onMouseDown={() => preloadRoute(to)}
      onClick={() => onNavigate(to)}
      style={{
        background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: 14,
        padding: "18px 18px", textAlign: "left", cursor: "pointer",
        display: "flex", flexDirection: "column", gap: 10,
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div style={{
        width: 38, height: 38, borderRadius: 10, background: iconBg,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={17} color={iconColor} />
      </div>
      <div>
        <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-heading)", marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>{desc}</div>
      </div>
    </button>
  );
});

const DashboardHero = React.memo(function DashboardHero({ connected }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hour = now.getHours();
  const greeting = hour < 5  ? "Selamat Malam"
               : hour < 12 ? "Selamat Pagi"
               : hour < 15 ? "Selamat Siang"
               : hour < 19 ? "Selamat Sore"
               :              "Selamat Malam";
  const dateStr = now.toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  const timeStr = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div style={{
      background: "linear-gradient(180deg, var(--bg-card) 0%, var(--bg-page) 100%)",
      border: "1px solid var(--border-default)",
      borderRadius: 16,
      padding: "24px 28px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      flexWrap: "wrap",
      boxShadow: "var(--shadow-card)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: "#EFF6FF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid #BFDBFE",
        }}>
          <Plane size={26} color="#2563EB" />
        </div>
        <div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 4 }}>{greeting}</div>
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, color: "var(--text-heading)", letterSpacing: "-0.02em" }}>
            FOD Detection Dashboard
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
            Runway Safety Intelligence System
          </p>
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "var(--text-heading)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
          {timeStr}
        </div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 }}>{dateStr}</div>
        <div style={{
          marginTop: 8,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: 20,
          background: connected ? "#F0FDF4" : "#FEF2F2",
          border: `1px solid ${connected ? "#BBF7D0" : "#FECACA"}`,
        }}>
          {connected
            ? <><Wifi size={12} color="#16A34A" /><span style={{ fontSize: "0.72rem", color: "#16A34A", fontWeight: 600 }}>Stream Terhubung</span></>
            : <><WifiOff size={12} color="#DC2626" /><span style={{ fontSize: "0.72rem", color: "#DC2626", fontWeight: 600 }}>Stream Terputus</span></>
          }
        </div>
      </div>
    </div>
  );
});

export default function DashboardPage() {
  const navigate = useNavigate();
  const navigateFast = useCallback((to) => {
    preloadRoute(to);
    startTransition(() => navigate(to));
  }, [navigate]);

  /* ── Store ── */
  const connected   = useDetectionStore((s) => s.connected);
  const lastPayload = useDetectionStore((s) => s.lastPayload);

  /* ── Queries ── */
  const overviewQ  = useDetectionStatsOverview();
  const sessionsQ  = useDetectionStatsPerSession();
  const pipelineQ  = usePipelineStatus();
  const historySummaryQ = useActivityHistorySummary();
  const historyEntriesQ = useActivityHistoryEntries({ limit: 5, offset: 0 });

  const ov       = overviewQ.data ?? {};
  const sessions = sessionsQ.data?.sessions ?? [];
  const ps       = pipelineQ.data;
  const historySummary = historySummaryQ.data;
  const recentHistory = historyEntriesQ.data?.items ?? [];

  const pipelineRunning = ps?.status === "running";
  const anomalyScore    = lastPayload?.anomaly_score ?? null;
  const isAnomaly       = lastPayload?.anomaly_detected ?? false;

  const S = {
    page: {
      display: "flex", flexDirection: "column", gap: 22,
      padding: "24px 28px 48px", maxWidth: 1280, margin: "0 auto",
      background: "var(--bg-page)", minHeight: "100vh",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Arial, sans-serif",
    },
    sectionLabel: {
      fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)",
      textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10,
    },
  };

  return (
    <div style={S.page}>

      {/* ── Hero Header ── */}
      <DashboardHero connected={connected} />

      {/* ── System Status Bar ── */}
      <div style={{
        display: "flex", gap: 12, flexWrap: "wrap",
        background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: 12,
        padding: "14px 20px", alignItems: "center",
        boxShadow: "var(--shadow-card)",
      }}>
        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 4 }}>
          Status Sistem:
        </span>

        {/* Pipeline */}
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "4px 12px", borderRadius: 20, fontSize: "0.75rem", fontWeight: 600,
          background: pipelineRunning ? "#F0FDF4" : "#F8FAFC",
          border: `1px solid ${pipelineRunning ? "#86EFAC" : "#E2E8F0"}`,
          color: pipelineRunning ? "#16A34A" : "#64748B",
        }}>
          <Activity size={11} />
          Pipeline: {ps ? (pipelineRunning ? "Running" : ps.status ?? "Idle") : "—"}
        </span>

        {/* Anomaly state */}
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "4px 12px", borderRadius: 20, fontSize: "0.75rem", fontWeight: 600,
          background: isAnomaly ? "#FEF2F2" : "#F0FDF4",
          border: `1px solid ${isAnomaly ? "#FECACA" : "#86EFAC"}`,
          color: isAnomaly ? "#DC2626" : "#16A34A",
        }}>
          {isAnomaly ? <AlertTriangle size={11} /> : <CheckCircle2 size={11} />}
          {isAnomaly ? "Anomali Terdeteksi" : "Runway Aman"}
        </span>

        {/* Anomaly score */}
        {anomalyScore != null && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "4px 12px", borderRadius: 20, fontSize: "0.75rem", fontWeight: 600,
            background: "#F5F3FF", border: "1px solid #DDD6FE", color: "#7C3AED",
          }}>
            <TrendingUp size={11} />
            Score: {anomalyScore.toFixed(3)}
          </span>
        )}

        {/* FPS */}
        {lastPayload?.fps != null && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "4px 12px", borderRadius: 20, fontSize: "0.75rem", fontWeight: 600,
            background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#2563EB",
          }}>
            <Clock size={11} />
            {lastPayload.fps.toFixed(1)} FPS
          </span>
        )}
      </div>

      {/* ── KPI Row ── */}
      <div>
        <div style={S.sectionLabel}>Statistik Keseluruhan</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          <KpiCard
            icon={AlertTriangle} iconBg="#FEF2F2" iconColor="#EF4444"
            label="Total Deteksi FOD"
            value={fmt(ov.total)}
            sub="semua sesi"
          />
          <KpiCard
            icon={Layers} iconBg="#EEF2FF" iconColor="#6366F1"
            label="Sesi Diproses"
            value={fmt(ov.total_sessions)}
            sub="video unik"
          />
          <KpiCard
            icon={BarChart2} iconBg="#FFF7ED" iconColor="#F97316"
            label="Avg Confidence"
            value={fmtConf(ov.avg_confidence)}
            sub="seluruh deteksi"
          />
          <KpiCard
            icon={CheckCircle2} iconBg="#F0FDF4" iconColor="#22C55E"
            label="Confirmation Rate"
            value={fmtPct(ov.confirmation_rate)}
            sub="true positive"
            subColor="#16A34A"
          />
        </div>
      </div>

      {/* ── Quick Navigation ── */}
      <div>
        <div style={S.sectionLabel}>Navigasi Cepat</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          <NavCard
            icon={MonitorPlay} iconBg="#EEF2FF" iconColor="#6366F1"
            title="Live Feed"
            desc="Monitor kamera secara real-time dengan deteksi FOD aktif"
            to="/live-monitor" onNavigate={navigateFast}
          />
          <NavCard
            icon={Radio} iconBg="#F0FDF4" iconColor="#22C55E"
            title="Stream"
            desc="Kelola sumber video stream untuk analisis pipeline"
            to="/stream" onNavigate={navigateFast}
          />
          <NavCard
            icon={Camera} iconBg="#FFF7ED" iconColor="#F97316"
            title="FOD Snapshots"
            desc="Galeri foto deteksi FOD beserta validasi petugas"
            to="/fod-snapshots" onNavigate={navigateFast}
          />
          <NavCard
            icon={BarChart2} iconBg="#F5F3FF" iconColor="#7C3AED"
            title="Detection Stats"
            desc="Statistik & analitik mendetail hasil deteksi FOD"
            to="/detection-stats" onNavigate={navigateFast}
          />
          <NavCard
            icon={FolderSearch} iconBg="#EFF6FF" iconColor="#2563EB"
            title="Inspection Log"
            desc="Riwayat lengkap log inspeksi dan pemeriksaan runway"
            to="/inspection-log" onNavigate={navigateFast}
          />
          <NavCard
            icon={FileText} iconBg="#F0FDF4" iconColor="#0EA5E9"
            title="Laporan"
            desc="Generate dan ekspor laporan deteksi FOD per sesi"
            to="/reports" onNavigate={navigateFast}
          />
          <NavCard
            icon={ScrollText} iconBg="#FFFBEB" iconColor="#D97706"
            title="System Log"
            desc="Pantau log aktivitas sistem dan pipeline secara detail"
            to="/pipeline/log" onNavigate={navigateFast}
          />
          <NavCard
            icon={History} iconBg="#EFF6FF" iconColor="#2563EB"
            title="Activity History"
            desc="Riwayat upload video dan sesi streaming yang tersusun rapi"
            to="/activity-history" onNavigate={navigateFast}
          />
        </div>
      </div>

      <div>
        <div style={S.sectionLabel}>Riwayat Upload & Streaming</div>
        <div style={{
          background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: 14,
          overflow: "hidden", boxShadow: "var(--shadow-card)",
        }}>
          <div style={{
            padding: "14px 16px", borderBottom: "1px solid var(--border-default)",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span style={{ padding: "6px 10px", borderRadius: 999, background: "#EFF6FF", color: "#2563EB", fontSize: "0.76rem", fontWeight: 700 }}>
                Upload: {historySummary?.total_uploads ?? "—"}
              </span>
              <span style={{ padding: "6px 10px", borderRadius: 999, background: "#ECFDF5", color: "#059669", fontSize: "0.76rem", fontWeight: 700 }}>
                Stream: {historySummary?.total_stream_sessions ?? "—"}
              </span>
              <span style={{ padding: "6px 10px", borderRadius: 999, background: "#FFFBEB", color: "#D97706", fontSize: "0.76rem", fontWeight: 700 }}>
                Aktif: {historySummary?.active_streams ?? "—"}
              </span>
            </div>
            <button
              type="button"
              onPointerEnter={() => preloadRoute("/activity-history")}
              onFocus={() => preloadRoute("/activity-history")}
              onMouseDown={() => preloadRoute("/activity-history")}
              onClick={() => navigateFast("/activity-history")}
              style={{
                padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border-medium)",
                background: "var(--bg-card-soft)", color: "var(--text-heading)", fontWeight: 700, fontSize: "0.8rem", cursor: "pointer",
              }}
            >
              Lihat Semua History
            </button>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-card-soft)" }}>
                {['Tipe', 'Nama', 'Status', 'Waktu', 'Metadata'].map((h) => (
                  <th key={h} style={{
                    textAlign: "left", padding: "10px 16px",
                    color: "var(--text-secondary)", fontSize: "0.7rem", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentHistory.length ? recentHistory.map((item) => {
                const statusStyle = item.status === "error"
                  ? { bg: "#FEF2F2", color: "#DC2626" }
                  : item.status === "running"
                    ? { bg: "#ECFDF5", color: "#059669" }
                    : item.status === "uploaded"
                      ? { bg: "#EFF6FF", color: "#2563EB" }
                      : { bg: "#FFFBEB", color: "#D97706" };
                return (
                  <tr key={item.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                    <td style={{ padding: "10px 16px", fontWeight: 700, color: "var(--text-primary)" }}>{item.activity_type === "upload" ? "Upload" : "Stream"}</td>
                    <td style={{ padding: "10px 16px", color: "var(--text-heading)" }}>{item.title}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{ padding: "4px 8px", borderRadius: 999, background: statusStyle.bg, color: statusStyle.color, fontWeight: 700, fontSize: "0.74rem" }}>
                        {item.status}
                      </span>
                    </td>
                    <td style={{ padding: "10px 16px", color: "var(--text-secondary)" }}>{item.started_at ? new Date(item.started_at).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                    <td style={{ padding: "10px 16px", color: "var(--text-secondary)" }}>
                      {item.activity_type === "upload"
                        ? `${item.resolution ?? "—"} · ${item.total_frames ?? 0} frame`
                        : `${item.stream_name ?? "Live Stream"}${item.detected_fod_count != null ? ` · ${item.detected_fod_count} FOD` : ""}`}
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={5} style={{ padding: "34px 16px", textAlign: "center", color: "var(--text-muted)" }}>
                    Belum ada history upload atau streaming.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Recent Sessions Table ── */}
      <div>
        <div style={S.sectionLabel}>Sesi Deteksi Terakhir</div>
        <div style={{
          background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: 14,
          overflow: "hidden", boxShadow: "var(--shadow-card)",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-card-soft)" }}>
                {["#", "Sesi ID", "Tanggal Pertama Deteksi", "Jumlah FOD", "Avg Confidence"].map((h) => (
                  <th key={h} style={{
                    textAlign: "left", padding: "10px 16px",
                    color: "var(--text-secondary)", fontSize: "0.7rem", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.length > 0 ? sessions.slice(0, 8).map((s, i) => (
                <tr key={s.video_id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                  <td style={{ padding: "10px 16px", color: "#6366F1", fontWeight: 700 }}>{i + 1}</td>
                  <td style={{ padding: "10px 16px", fontFamily: "monospace", fontSize: "0.75rem", color: "var(--text-primary)" }}>
                    {s.short_id?.toUpperCase() ?? s.video_id}
                  </td>
                  <td style={{ padding: "10px 16px", color: "var(--text-secondary)" }}>
                    {s.first_detection
                      ? new Date(s.first_detection).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                      : "—"}
                  </td>
                  <td style={{ padding: "10px 16px", fontWeight: 700, color: "var(--text-heading)" }}>{s.count}</td>
                  <td style={{ padding: "10px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: "#F1F5F9", borderRadius: 999, overflow: "hidden", minWidth: 60 }}>
                        <div style={{
                          height: "100%",
                          width: `${(s.avg_confidence ?? 0) * 100}%`,
                          background: (s.avg_confidence ?? 0) >= 0.7 ? "#EF4444" : (s.avg_confidence ?? 0) >= 0.4 ? "#F59E0B" : "#22C55E",
                          borderRadius: 999,
                        }} />
                      </div>
                      <span style={{ fontWeight: 700, color: "var(--text-primary)", minWidth: 40 }}>{fmtConf(s.avg_confidence)}</span>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                    Belum ada data sesi…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}