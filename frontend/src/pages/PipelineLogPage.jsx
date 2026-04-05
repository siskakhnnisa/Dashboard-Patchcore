import React, { useState, useCallback, useEffect, useRef } from "react";
import { useSystemLogs, useSystemLogStats } from "../hooks/useQueries";
import {
  ScrollText,
  Search,
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Info,
  CheckCircle2,
  Bug,
  AlertCircle,
  HardDrive,
  Clock,
  RotateCcw,
  ShieldAlert,
  Filter,
  Radio,
  History,
  Pause,
  Play,
  Trash2,
} from "lucide-react";
import "../styles/PipelineLogPage.css";

const LEVEL_OPTIONS = [
  { value: "IMPORTANT", label: "Penting (Error + Warning)" },
  { value: "",          label: "Semua Level" },
  { value: "ERROR",     label: "Error" },
  { value: "WARNING",   label: "Warning" },
  { value: "SUCCESS",   label: "Success" },
  { value: "INFO",      label: "Info" },
  { value: "DEBUG",     label: "Debug" },
];
const PAGE_SIZE = 200;
const MAX_LIVE_ENTRIES = 500;
const WS_URL = "ws://localhost:8000/api/system-logs/ws";

// ═══════════════════════════════════════════════════
// Live Tab — WebSocket real-time log stream
// ═══════════════════════════════════════════════════
function LiveTab({ levelIcon, formatTimeAgo, stats, hasIssues, recentErrors, recentWarnings }) {
  const [liveEntries, setLiveEntries] = useState([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [liveCount, setLiveCount] = useState(0);
  const scrollRef = useRef(null);
  const wsRef = useRef(null);
  const pausedRef = useRef(false);
  const entriesRef = useRef([]);

  // Sync paused ref
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // WebSocket connection
  useEffect(() => {
    let reconnectTimer = null;

    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => {}; // onclose will handle reconnect

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === "initial" && msg.logs) {
            entriesRef.current = msg.logs;
            setLiveEntries([...msg.logs]);
            setLiveCount(msg.logs.length);
          } else if (msg.type === "new" && msg.logs) {
            if (pausedRef.current) return; // jangan update saat paused
            const updated = [...entriesRef.current, ...msg.logs].slice(-MAX_LIVE_ENTRIES);
            entriesRef.current = updated;
            setLiveEntries(updated);
            setLiveCount((c) => c + msg.logs.length);
          }
        } catch { /* ignore parse errors */ }
      };
    }

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect
        wsRef.current.close();
      }
    };
  }, []);

  // Auto-scroll ke bawah saat ada entry baru
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [liveEntries, autoScroll]);

  // Deteksi user scroll — matikan autoScroll jika scroll ke atas
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setAutoScroll(nearBottom);
  }, []);

  const handleClear = useCallback(() => {
    entriesRef.current = [];
    setLiveEntries([]);
    setLiveCount(0);
  }, []);

  const handleTogglePause = useCallback(() => {
    setPaused((p) => !p);
  }, []);

  return (
    <>
      {/* ── Live Controls ── */}
      <div className="slog-live-controls">
        <div className="slog-live-status">
          <span className={`slog-live-dot ${connected ? "slog-live-dot--on" : "slog-live-dot--off"}`} />
          <span className="slog-live-label">
            {connected ? (paused ? "Dijeda" : "Streaming...") : "Menghubungkan..."}
          </span>
          <span className="slog-live-count">{liveCount} baris diterima</span>
        </div>
        <div className="slog-live-actions">
          <button className="slog-btn" onClick={handleTogglePause}>
            {paused ? <><Play size={14} /> Lanjutkan</> : <><Pause size={14} /> Jeda</>}
          </button>
          <button className="slog-btn" onClick={handleClear}>
            <Trash2 size={14} /> Bersihkan
          </button>
        </div>
      </div>

      {/* ── Live Log Panel ── */}
      <div className="slog-panel slog-panel--live">
        <div className="slog-panel-head">
          <span className="slog-panel-title">
            <span className={`slog-live-dot ${connected ? "slog-live-dot--on" : "slog-live-dot--off"}`} />
            LIVE STREAM
          </span>
          <span className="slog-panel-info">
            {liveEntries.length} entri · {autoScroll ? "auto-scroll aktif" : "scroll manual"}
          </span>
        </div>

        <div className="slog-scroll slog-scroll--live" ref={scrollRef} onScroll={handleScroll}>
          {liveEntries.length > 0 ? (
            <table className="slog-tbl">
              <thead>
                <tr>
                  <th style={{ width: 80 }}>Waktu</th>
                  <th style={{ width: 80 }}>Level</th>
                  <th style={{ width: 180 }}>Source</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {liveEntries.map((entry, i) => (
                  <tr key={`live-${i}`} className={`slog-row--${entry.level} ${i >= liveEntries.length - 3 ? "slog-row--new" : ""}`}>
                    <td className="slog-mono">{entry.timestamp?.slice(11, 19)}</td>
                    <td>
                      <span className={`slog-lvl slog-lvl--${entry.level}`}>
                        {levelIcon(entry.level)} {entry.level}
                      </span>
                    </td>
                    <td className="slog-source">{entry.source}</td>
                    <td className="slog-msg">{entry.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="slog-empty">
              <Radio size={32} />
              {connected
                ? "Menunggu log baru... Jalankan pipeline untuk melihat log real-time."
                : "Menghubungkan ke server..."}
            </div>
          )}
        </div>

        {/* Scroll-to-bottom button */}
        {!autoScroll && liveEntries.length > 0 && (
          <button
            className="slog-scroll-bottom"
            onClick={() => {
              if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              }
              setAutoScroll(true);
            }}
          >
            Scroll ke bawah
          </button>
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════
// History Tab — REST-based log search
// ═══════════════════════════════════════════════════
function HistoryTab({ levelIcon }) {
  const [levelFilter, setLevelFilter] = useState("IMPORTANT");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);

  const offset = page * PAGE_SIZE;

  const logsQ = useSystemLogs({
    level: levelFilter || null,
    search: searchTerm || null,
    limit: PAGE_SIZE,
    offset,
  });

  const logs = logsQ.data?.logs ?? [];
  const total = logsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleSearchKeyDown = useCallback((e) => {
    if (e.key === "Enter") { setSearchTerm(searchInput); setPage(0); }
  }, [searchInput]);

  const handleSearchClick = useCallback(() => {
    setSearchTerm(searchInput); setPage(0);
  }, [searchInput]);

  const handleLevelChange = useCallback((e) => {
    setLevelFilter(e.target.value); setPage(0);
  }, []);

  const handleExport = useCallback(() => {
    if (!logs.length) return;
    const header = "Timestamp,Level,Source,Message\n";
    const rows = logs.map((l) =>
      `"${l.timestamp}","${l.level}","${l.source}","${l.message.replace(/"/g, '""')}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `system-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [logs]);

  return (
    <>
      {/* ── Filter Bar ── */}
      <div className="slog-topbar">
        <div className="slog-filters">
          <select className="slog-sel" value={levelFilter} onChange={handleLevelChange}>
            {LEVEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <input
              className="slog-search"
              type="text"
              placeholder="Cari di log... (Enter)"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
            <button className="slog-btn" onClick={handleSearchClick} style={{ marginLeft: 6, padding: "8px 10px" }}>
              <Search size={14} />
            </button>
          </div>
          {levelFilter === "IMPORTANT" && (
            <span className="slog-filter-hint"><Filter size={11} /> Hanya ERROR + WARNING</span>
          )}
        </div>
        <div className="slog-actions">
          <button className="slog-btn" onClick={() => logsQ.refetch()}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="slog-btn" onClick={handleExport} disabled={!logs.length}>
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* ── Log Table ── */}
      <div className="slog-panel">
        <div className="slog-panel-head">
          <span className="slog-panel-title"><ScrollText size={14} /> RIWAYAT LOG</span>
          <span className="slog-panel-info">
            {total} entri ditemukan
            {searchTerm && <> · pencarian: <strong>"{searchTerm}"</strong></>}
            {levelFilter && <> · filter: <strong>{levelFilter === "IMPORTANT" ? "Error + Warning" : levelFilter}</strong></>}
          </span>
        </div>

        <div className="slog-scroll">
          {logs.length > 0 ? (
            <table className="slog-tbl">
              <thead>
                <tr>
                  <th style={{ width: 170 }}>Timestamp</th>
                  <th style={{ width: 90 }}>Level</th>
                  <th style={{ width: 200 }}>Source</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((entry, i) => (
                  <tr key={`${entry.timestamp}-${i}`} className={`slog-row--${entry.level}`}>
                    <td className="slog-mono">{entry.timestamp}</td>
                    <td>
                      <span className={`slog-lvl slog-lvl--${entry.level}`}>
                        {levelIcon(entry.level)} {entry.level}
                      </span>
                    </td>
                    <td className="slog-source">{entry.source}</td>
                    <td className="slog-msg">{entry.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="slog-empty">
              {logsQ.isLoading ? (
                <><ScrollText size={32} /> Memuat log...</>
              ) : levelFilter === "IMPORTANT" ? (
                <><CheckCircle2 size={32} color="#10B981" /> Tidak ada error atau warning — sistem berjalan baik</>
              ) : (
                <><ScrollText size={32} /> Tidak ada log ditemukan</>
              )}
            </div>
          )}
        </div>

        {total > PAGE_SIZE && (
          <div className="slog-pagination">
            <button className="slog-pg-btn" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              <ChevronLeft size={14} /> Prev
            </button>
            <span className="slog-pg-info">Halaman {page + 1} dari {totalPages}</span>
            <button className="slog-pg-btn" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════
// Main Page — Tab switcher
// ═══════════════════════════════════════════════════
export default function PipelineLogPage() {
  const [activeTab, setActiveTab] = useState("live");
  const statsQ = useSystemLogStats();
  const stats = statsQ.data;

  const recentErrors = stats?.recent_errors ?? [];
  const recentWarnings = stats?.recent_warnings ?? [];
  const hasIssues = recentErrors.length > 0 || recentWarnings.length > 0;

  const levelIcon = useCallback((level) => {
    switch (level) {
      case "ERROR":   return <AlertCircle size={12} />;
      case "WARNING": return <AlertTriangle size={12} />;
      case "SUCCESS": return <CheckCircle2 size={12} />;
      case "DEBUG":   return <Bug size={12} />;
      default:        return <Info size={12} />;
    }
  }, []);

  const formatTimeAgo = useCallback((ts) => {
    if (!ts) return "—";
    try {
      const d = new Date(ts.replace(" ", "T"));
      const now = new Date();
      const diff = Math.floor((now - d) / 1000);
      if (diff < 60) return `${diff} detik lalu`;
      if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
      if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
      return `${Math.floor(diff / 86400)} hari lalu`;
    } catch { return ts; }
  }, []);

  return (
    <div className="slog">
      {/* ── Health Banner ── */}
      {stats && (
        <div className={`slog-health ${hasIssues ? "slog-health--warn" : "slog-health--ok"}`}>
          <div className="slog-health-left">
            <ShieldAlert size={16} />
            <span className="slog-health-title">
              {hasIssues ? "Ada Masalah yang Perlu Perhatian" : "Sistem Berjalan Normal"}
            </span>
          </div>
          <div className="slog-health-meta">
            {stats.uptime && (
              <span className="slog-health-chip"><Clock size={12} /> Uptime: {stats.uptime}</span>
            )}
            <span className="slog-health-chip">
              <RotateCcw size={12} /> {stats.total_restarts ?? 0}x restart
            </span>
            {stats.last_error_time && (
              <span className="slog-health-chip slog-health-chip--error">
                <AlertCircle size={12} /> Error terakhir: {formatTimeAgo(stats.last_error_time)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Summary Stats ── */}
      <div className="slog-stats">
        <div className="slog-stat">
          <span className="slog-stat-label">Error (24 jam)</span>
          <span className={`slog-stat-val ${(stats?.errors_24h ?? 0) > 0 ? "slog-stat-val--error" : "slog-stat-val--ok"}`}>
            {stats?.errors_24h ?? 0}
          </span>
        </div>
        <div className="slog-stat">
          <span className="slog-stat-label">Warning (24 jam)</span>
          <span className={`slog-stat-val ${(stats?.warnings_24h ?? 0) > 0 ? "slog-stat-val--warn" : "slog-stat-val--ok"}`}>
            {stats?.warnings_24h ?? 0}
          </span>
        </div>
        <div className="slog-stat">
          <span className="slog-stat-label">Total Error (all-time)</span>
          <span className="slog-stat-val slog-stat-val--error">{stats?.by_level?.ERROR ?? 0}</span>
        </div>
        <div className="slog-stat">
          <span className="slog-stat-label">
            <HardDrive size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
            Ukuran Log
          </span>
          <span className="slog-stat-val slog-stat-val--info">{stats?.file_size_mb ?? 0} MB</span>
        </div>
      </div>

      {/* ── Tab Switcher ── */}
      <div className="slog-tabs">
        <button
          className={`slog-tab ${activeTab === "live" ? "slog-tab--active" : ""}`}
          onClick={() => setActiveTab("live")}
        >
          <Radio size={14} /> Live
        </button>
        <button
          className={`slog-tab ${activeTab === "history" ? "slog-tab--active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          <History size={14} /> Riwayat
        </button>
      </div>

      {/* ── Tab Content ── */}
      {activeTab === "live" ? (
        <LiveTab
          levelIcon={levelIcon}
          formatTimeAgo={formatTimeAgo}
          stats={stats}
          hasIssues={hasIssues}
          recentErrors={recentErrors}
          recentWarnings={recentWarnings}
        />
      ) : (
        <HistoryTab levelIcon={levelIcon} />
      )}
    </div>
  );
}
