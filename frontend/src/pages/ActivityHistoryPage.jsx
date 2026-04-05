import React, { useMemo, useState, useCallback } from "react";
import {
  History,
  Upload,
  Radio,
  Search,
  Clock3,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Download,
  Play,
  X,
  Calendar,
} from "lucide-react";
import { useActivityHistoryEntries, useActivityHistorySummary } from "../hooks/useQueries";
import "../styles/ActivityHistoryPage.css";

const API_BASE = import.meta.env?.VITE_API_BASE || "http://localhost:8000";

function fmtDateTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(sec) {
  if (sec == null) return "—";
  if (sec < 60) return `${sec.toFixed(0)} dtk`;
  if (sec < 3600) return `${(sec / 60).toFixed(1)} mnt`;
  return `${(sec / 3600).toFixed(1)} jam`;
}

function statusMeta(status) {
  if (status === "uploaded") return { color: "#2563EB", bg: "#EFF6FF", label: "Uploaded" };
  if (status === "running") return { color: "#059669", bg: "#ECFDF5", label: "Running" };
  if (status === "stopped") return { color: "#D97706", bg: "#FFFBEB", label: "Stopped" };
  if (status === "finished") return { color: "#0F766E", bg: "#F0FDFA", label: "Finished" };
  if (status === "error") return { color: "#DC2626", bg: "#FEF2F2", label: "Error" };
  return { color: "#64748B", bg: "#F8FAFC", label: status || "Unknown" };
}

function typeMeta(type) {
  if (type === "upload") return { icon: Upload, label: "Video Upload", color: "#2563EB", bg: "#EFF6FF" };
  return { icon: Radio, label: "Live Stream", color: "#059669", bg: "#ECFDF5" };
}

function buildMetadataBadges(item) {
  const badges = [];
  if (item.resolution) badges.push(item.resolution);
  else if (item.width_px && item.height_px) badges.push(`${item.width_px}x${item.height_px}`);
  if (item.file_extension) badges.push(item.file_extension.toUpperCase());
  if (item.mime_type) badges.push(item.mime_type);
  if (item.codec_name) badges.push(`Codec ${item.codec_name}`);
  if (item.fps != null) badges.push(`${item.fps.toFixed(1)} FPS`);
  if (item.total_frames != null) badges.push(`${item.total_frames} frame`);
  if (item.size_mb != null) badges.push(`${item.size_mb.toFixed(1)} MB`);
  if (item.detected_fod_count != null) badges.push(`${item.detected_fod_count} FOD`);
  return badges;
}

function getDateRange(timeRange, customFrom, customTo) {
  const now = new Date();
  const pad = (d) => d.toISOString().split("T")[0];
  if (timeRange === "today") {
    return { from: pad(now), to: null };
  }
  if (timeRange === "7d") {
    const d = new Date(now); d.setDate(d.getDate() - 7);
    return { from: pad(d), to: null };
  }
  if (timeRange === "30d") {
    const d = new Date(now); d.setDate(d.getDate() - 30);
    return { from: pad(d), to: null };
  }
  if (timeRange === "custom") {
    return { from: customFrom || null, to: customTo || null };
  }
  return { from: null, to: null };
}

function VideoPreviewModal({ item, onClose }) {
  if (!item) return null;
  const src = `${API_BASE}/api/activity-history/${item.id}/video`;
  const downloadHref = `${API_BASE}/api/activity-history/${item.id}/download`;
  return (
    <div className="ah-modal-overlay" onClick={onClose}>
      <div className="ah-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ah-modal-header">
          <span className="ah-modal-title">{item.filename || item.title || "Preview Video"}</span>
          <button className="ah-modal-close" onClick={onClose} aria-label="Tutup">
            <X size={18} />
          </button>
        </div>
        <video
          className="ah-modal-video"
          controls
          autoPlay
          src={src}
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <div className="ah-modal-footer">
          <a
            className="ah-modal-dl-btn"
            href={downloadHref}
            target="_blank"
            rel="noreferrer"
            download
          >
            <Download size={14} />
            <span>Download Video</span>
          </a>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, sub, tint }) {
  return (
    <div className="ah-card ah-summary-card">
      <div className="ah-summary-icon" style={{ background: tint.bg, color: tint.color }}>
        <Icon size={18} />
      </div>
      <div>
        <div className="ah-summary-label">{label}</div>
        <div className="ah-summary-value">{value}</div>
        {sub ? <div className="ah-summary-sub">{sub}</div> : null}
      </div>
    </div>
  );
}

export default function ActivityHistoryPage() {
  const [activityType, setActivityType] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [timeRange, setTimeRange] = useState("all");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [previewItem, setPreviewItem] = useState(null);

  const limit = 20;
  const offset = page * limit;
  const normalizedSearch = search.trim();

  const { from: dateFrom, to: dateTo } = getDateRange(timeRange, customDateFrom, customDateTo);

  const resetPage = useCallback(() => setPage(0), []);

  const summaryQ = useActivityHistorySummary();
  const entriesQ = useActivityHistoryEntries({
    activityType: activityType === "all" ? null : activityType,
    status: status === "all" ? null : status,
    search: normalizedSearch || null,
    dateFrom,
    dateTo,
    limit,
    offset,
  });

  const summary = summaryQ.data;
  const items = entriesQ.data?.items ?? [];
  const total = entriesQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const activeFilters = useMemo(() => {
    const out = [];
    if (activityType !== "all") out.push(`Tipe: ${activityType}`);
    if (status !== "all") out.push(`Status: ${status}`);
    if (normalizedSearch) out.push(`Cari: ${normalizedSearch}`);
    if (timeRange === "today") out.push("Periode: Hari ini");
    else if (timeRange === "7d") out.push("Periode: 7 hari terakhir");
    else if (timeRange === "30d") out.push("Periode: 30 hari terakhir");
    else if (timeRange === "custom" && (dateFrom || dateTo)) out.push(`Periode: ${dateFrom || "?"} → ${dateTo || "??"}`);
    return out;
  }, [activityType, status, normalizedSearch, timeRange, dateFrom, dateTo]);

  return (
    <div className="ah-page">
      <div className="ah-hero ah-card">
        <div>
          <div className="ah-kicker">Structured History</div>
          <h1 className="ah-title">Riwayat Upload & Streaming</h1>
          <p className="ah-subtitle">
            Halaman ini menyusun riwayat upload video dan sesi live stream secara terstruktur, dipisahkan dari log mentah
            agar dashboard tetap ringan dan mudah dianalisis.
          </p>
        </div>
        <div className="ah-hero-pill">
          <History size={17} />
          <span>Paginated + summary-first loading</span>
        </div>
      </div>

      <div className="ah-summary-grid">
        <SummaryCard icon={Upload} label="Total Upload" value={summary?.total_uploads ?? "—"} sub={`${summary?.uploads_last_7d ?? 0} upload dalam 7 hari`} tint={{ bg: "#EFF6FF", color: "#2563EB" }} />
        <SummaryCard icon={Radio} label="Sesi Stream" value={summary?.total_stream_sessions ?? "—"} sub={`${summary?.streams_last_7d ?? 0} stream dalam 7 hari`} tint={{ bg: "#ECFDF5", color: "#059669" }} />
        <SummaryCard icon={RefreshCw} label="Stream Aktif" value={summary?.active_streams ?? "—"} sub={`${summary?.completed_streams ?? 0} selesai · ${summary?.failed_streams ?? 0} gagal`} tint={{ bg: "#F5F3FF", color: "#7C3AED" }} />
        <SummaryCard icon={Clock3} label="Aktivitas Terakhir" value={fmtDateTime(summary?.last_stream_at ?? summary?.last_upload_at)} sub="upload/stream terbaru" tint={{ bg: "#FFFBEB", color: "#D97706" }} />
      </div>

      <div className="ah-card ah-toolbar">
        <div className="ah-toolbar-left">
          <div className="ah-filter-group">
            <label>Tipe</label>
            <select value={activityType} onChange={(e) => { setActivityType(e.target.value); resetPage(); }}>
              <option value="all">Semua</option>
              <option value="upload">Upload</option>
              <option value="stream">Stream</option>
            </select>
          </div>

          <div className="ah-filter-group">
            <label>Status</label>
            <select value={status} onChange={(e) => { setStatus(e.target.value); resetPage(); }}>
              <option value="all">Semua</option>
              <option value="uploaded">Uploaded</option>
              <option value="running">Running</option>
              <option value="stopped">Stopped</option>
              <option value="finished">Finished</option>
              <option value="error">Error</option>
            </select>
          </div>

          <div className="ah-filter-group">
            <label><Calendar size={11} style={{ verticalAlign: "middle", marginRight: 4 }} />Periode</label>
            <select value={timeRange} onChange={(e) => { setTimeRange(e.target.value); resetPage(); }}>
              <option value="all">Semua Waktu</option>
              <option value="today">Hari Ini</option>
              <option value="7d">7 Hari Terakhir</option>
              <option value="30d">30 Hari Terakhir</option>
              <option value="custom">Custom...</option>
            </select>
          </div>

          {timeRange === "custom" && (
            <>
              <div className="ah-filter-group">
                <label>Dari</label>
                <input
                  type="date"
                  className="ah-date-input"
                  value={customDateFrom}
                  onChange={(e) => { setCustomDateFrom(e.target.value); resetPage(); }}
                />
              </div>
              <div className="ah-filter-group">
                <label>Sampai</label>
                <input
                  type="date"
                  className="ah-date-input"
                  value={customDateTo}
                  onChange={(e) => { setCustomDateTo(e.target.value); resetPage(); }}
                />
              </div>
            </>
          )}
        </div>

        <div className="ah-search-wrap">
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            placeholder="Cari filename, stream name, video_id..."
          />
        </div>
      </div>

      {activeFilters.length ? (
        <div className="ah-active-filters">
          {activeFilters.map((item) => <span key={item}>{item}</span>)}
        </div>
      ) : null}

      <div className="ah-card ah-table-wrap">
        <table className="ah-table">
          <thead>
            <tr>
              <th>Aktivitas</th>
              <th>Sumber</th>
              <th>Status</th>
              <th>Waktu Mulai</th>
              <th>Durasi</th>
              <th>Metadata</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {items.length ? items.map((item) => {
              const type = typeMeta(item.activity_type);
              const statusCfg = statusMeta(item.status);
              const Icon = type.icon;
              return (
                <tr key={item.id}>
                  <td>
                    <div className="ah-activity-cell">
                      <span className="ah-type-icon" style={{ background: type.bg, color: type.color }}>
                        <Icon size={14} />
                      </span>
                      <div>
                        <strong>{type.label}</strong>
                        <div>{item.title}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="ah-source-block">
                      <strong>{item.activity_type === "upload" ? (item.filename ?? "—") : (item.stream_name ?? "—")}</strong>
                      <div>{item.video_id ?? item.stream_url ?? "—"}</div>
                    </div>
                  </td>
                  <td>
                    <span className="ah-status-pill" style={{ color: statusCfg.color, background: statusCfg.bg }}>
                      {item.status === "error" ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
                      {statusCfg.label}
                    </span>
                  </td>
                  <td>{fmtDateTime(item.started_at)}</td>
                  <td>{fmtDuration(item.duration_seconds)}</td>
                  <td>
                    <div className="ah-meta-list">
                      {buildMetadataBadges(item).map((meta) => <span key={`${item.id}-${meta}`}>{meta}</span>)}
                      {item.error_message ? <span className="is-error">{item.error_message}</span> : null}
                    </div>
                  </td>
                  <td>
                    {item.activity_type === "upload" ? (
                      <div className="ah-actions">
                        <button
                          className="ah-action-btn ah-action-preview"
                          title="Preview Video"
                          onClick={() => setPreviewItem(item)}
                        >
                          <Play size={13} />
                          <span>Preview</span>
                        </button>
                        <a
                          className="ah-action-btn ah-action-download"
                          href={`${API_BASE}/api/activity-history/${item.id}/download`}
                          target="_blank"
                          rel="noreferrer"
                          download
                          title="Download Video"
                        >
                          <Download size={13} />
                          <span>Unduh</span>
                        </a>
                      </div>
                    ) : (
                      <span className="ah-no-action">—</span>
                    )}
                  </td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={7} className="ah-empty">Belum ada history yang cocok dengan filter saat ini.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="ah-pagination">
        <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Sebelumnya</button>
        <span>Halaman {page + 1} / {totalPages}</span>
        <button disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Berikutnya</button>
      </div>

      {previewItem && (
        <VideoPreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
      )}
    </div>
  );
}