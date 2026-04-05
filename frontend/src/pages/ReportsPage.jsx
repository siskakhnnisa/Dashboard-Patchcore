import React, { useRef } from "react";
import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip,
} from "recharts";
import {
  FileText,
  Download,
  Calendar,
  Layers,
  Printer,
} from "lucide-react";
import {
  useDetectionStatsPerSession,
} from "../hooks/useQueries";

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) ||
  "http://localhost:8000";

function fmtConf(v) { return v != null ? `${(v * 100).toFixed(1)}%` : "â€”"; }

/* â”€â”€ Section header â”€â”€ */
function SectionHead({ icon: Icon, title, color = "#6366F1" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid #E2E8F0" }}>
      <Icon size={15} color={color} />
      <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#374151" }}>{title}</span>
    </div>
  );
}

/* â”€â”€ Card wrapper â”€â”€ */
function Card({ children, style = {} }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, overflow: "hidden", ...style }}>
      {children}
    </div>
  );
}

export default function ReportsPage() {
  const printRef = useRef(null);

  /* â”€â”€ Queries â”€â”€ */
  const perSessionQ = useDetectionStatsPerSession();
  const sessions    = perSessionQ.data?.sessions ?? [];

  /* â”€â”€ CSV Export â”€â”€ */
  function handleExportCSV() {
    if (!sessions.length) return;
    const header = ["Sesi ID", "Tanggal Pertama Deteksi", "Jumlah FOD", "Avg Confidence"];
    const rows = sessions.map((s) => [
      s.video_id,
      s.first_detection ? new Date(s.first_detection).toLocaleString("id-ID") : "",
      s.count,
      fmtConf(s.avg_confidence),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan-fod-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
  }

  const today = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div ref={printRef} style={{
      display: "flex", flexDirection: "column", gap: 20,
      padding: "24px 28px 48px", maxWidth: 1280, margin: "0 auto",
      background: "#F9FAFB", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Arial, sans-serif",
      minHeight: "100vh",
    }}>

      {/* â”€â”€ Page Header â”€â”€ */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <FileText size={20} color="#6366F1" />
            <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, color: "#1E293B", letterSpacing: "-0.02em" }}>
              Laporan Deteksi FOD
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: "0.82rem", color: "#64748B" }}>
            Digenerate: {today}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={handleExportCSV} disabled={!sessions.length} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "7px 14px", borderRadius: 8, fontSize: "0.82rem",
            fontWeight: 600, cursor: sessions.length ? "pointer" : "not-allowed",
            background: "#F5F7FF", border: "1px solid #E0E7FF", color: "#6366F1",
            opacity: sessions.length ? 1 : 0.45,
          }}>
            <Download size={14} /> Export CSV
          </button>
          <button onClick={() => window.print()} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "7px 14px", borderRadius: 8, fontSize: "0.82rem",
            fontWeight: 600, cursor: "pointer",
            background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#15803D",
          }}>
            <Printer size={14} /> Cetak / PDF
          </button>
        </div>
      </div>

      {/* â”€â”€ Chart: Jumlah Deteksi per Sesi â”€â”€ */}
      <Card>
        <SectionHead icon={Layers} title="Jumlah Deteksi per Sesi Video" color="#6366F1" />
        <div style={{ padding: "16px" }}>
          {sessions.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={sessions.slice(0, 10)} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="short_id" tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} width={28} allowDecimals={false} />
                <Tooltip
                  formatter={(v) => [v, "Deteksi FOD"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E2E8F0" }}
                />
                <Bar dataKey="count" name="count" fill="#6366F1" radius={[4, 4, 0, 0]} fillOpacity={0.85} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8", fontSize: "0.82rem" }}>
              Belum ada sesiâ€¦
            </div>
          )}
        </div>
      </Card>

      {/* â”€â”€ Tabel Rincian Per Sesi â”€â”€ */}
      <Card>
        <SectionHead icon={Calendar} title="Rincian Per Sesi Video" color="#0EA5E9" />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #E2E8F0" }}>
                {["#", "Sesi ID", "Tanggal Pertama Deteksi", "Total FOD", "Avg Confidence"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 14px", color: "#64748B", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.length > 0 ? sessions.map((s, i) => (
                <tr key={s.video_id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td style={{ padding: "10px 14px", color: "#6366F1", fontWeight: 700 }}>{i + 1}</td>
                  <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: "0.75rem", color: "#374151" }}>{s.short_id?.toUpperCase()}</td>
                  <td style={{ padding: "10px 14px", color: "#64748B" }}>
                    {s.first_detection
                      ? new Date(s.first_detection).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                      : "â€”"}
                  </td>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: "#1E293B" }}>{s.count}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: "#F1F5F9", borderRadius: 999, overflow: "hidden", minWidth: 60 }}>
                        <div style={{
                          height: "100%",
                          width: `${(s.avg_confidence ?? 0) * 100}%`,
                          background: (s.avg_confidence ?? 0) >= 0.7 ? "#EF4444" : (s.avg_confidence ?? 0) >= 0.4 ? "#F59E0B" : "#22C55E",
                          borderRadius: 999,
                        }} />
                      </div>
                      <span style={{ fontWeight: 700, color: "#374151", minWidth: 40 }}>{fmtConf(s.avg_confidence)}</span>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "#94A3B8" }}>Belum ada data sesiâ€¦</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

    </div>
  );
}
