import React, { useState, useMemo, useCallback } from "react";
import { useAllSnapshots, useValidateSnapshot, useDeleteSnapshot } from "../hooks/useQueries";
import {
  Camera,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  X,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Download,
  Trash2,
} from "lucide-react";
import "../styles/FodSnapshotsPage.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

/* ── Helpers ───────────────────────────────────────────────────── */
function getSeverity(confidence) {
  if (confidence == null) return "low";
  if (confidence >= 0.70) return "high";
  if (confidence >= 0.40) return "medium";
  return "low";
}

function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function fmtTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("id-ID", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function fmtConf(val) {
  if (val == null) return "—";
  return (val * 100).toFixed(1) + "%";
}

function bboxSize(bbox) {
  if (!bbox) return "—";
  return `${bbox.width ?? bbox.w ?? 0} × ${bbox.height ?? bbox.h ?? 0} px`;
}

const STATUS_CONFIG = {
  pending:   { label: "Pending",        icon: Clock,        color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  confirmed: { label: "Confirmed FOD",  icon: CheckCircle2, color: "#059669", bg: "#ECFDF5", border: "#A7F3D0" },
  rejected:  { label: "False Positive", icon: XCircle,      color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
};

function getQuickValidationStaffName() {
  const stored = sessionStorage.getItem("fsp_staff_name")?.trim();
  return stored || "Operator";
}

/* ── Status Badge ──────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className="fsp-status-badge" style={{
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
    }}>
      <Icon size={12} />
      {cfg.label}
    </span>
  );
}

/* ── Severity Badge ────────────────────────────────────────────── */
function SeverityBadge({ confidence }) {
  const s = getSeverity(confidence);
  return <span className={`fsp-severity fsp-severity--${s}`}>{s}</span>;
}

/* ── Confidence Bar ────────────────────────────────────────────── */
function ConfBar({ confidence }) {
  const s = getSeverity(confidence);
  const pct = confidence != null ? Math.min(confidence * 100, 100) : 0;
  return (
    <div className="fsp-conf-track">
      <div className={`fsp-conf-fill fsp-conf-fill--${s}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ── Image with fallback ──────────────────────────────────────── */
function ImgWithFallback({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="fsp-card-noimg">
        <ImageIcon size={24} strokeWidth={1.5} />
        <span>No image</span>
      </div>
    );
  }
  return (
    <img className="fsp-card-img" src={src} alt={alt}
      loading="lazy" onError={() => setFailed(true)} />
  );
}

/* ── Delete Button ─────────────────────────────────────────────── */
// Full inline style — tidak bergantung pada CSS apapun.
// Tidak ada guard isAdmin — selalu tampil untuk semua user.
function DeleteButton({ showConfirm, onClick, disabled, size = "md" }) {
  const isSmall = size === "sm";
  return (
    <button
      title={showConfirm ? "Klik sekali lagi untuk konfirmasi hapus" : "Hapus snapshot"}
      onClick={onClick}
      disabled={disabled}
      style={{
        display:        "inline-flex",
        alignItems:     "center",
        justifyContent: "center",
        gap:            4,
        background:     showConfirm ? "#DC2626" : "#FEF2F2",
        color:          showConfirm ? "#ffffff" : "#DC2626",
        border:         `1px solid ${showConfirm ? "#DC2626" : "#FECACA"}`,
        borderRadius:   6,
        padding:        isSmall ? "4px 8px" : "6px 12px",
        fontSize:       isSmall ? 11 : 12,
        fontWeight:     600,
        cursor:         disabled ? "not-allowed" : "pointer",
        opacity:        disabled ? 0.55 : 1,
        transition:     "all 0.15s",
        whiteSpace:     "nowrap",
        flexShrink:     0,
        fontFamily:     "inherit",
      }}
      onMouseEnter={e => {
        if (disabled || showConfirm) return;
        e.currentTarget.style.background = "#DC2626";
        e.currentTarget.style.color = "#fff";
        e.currentTarget.style.borderColor = "#DC2626";
      }}
      onMouseLeave={e => {
        if (disabled || showConfirm) return;
        e.currentTarget.style.background = "#FEF2F2";
        e.currentTarget.style.color = "#DC2626";
        e.currentTarget.style.borderColor = "#FECACA";
      }}
    >
      {showConfirm ? (
        <span>Yakin hapus?</span>
      ) : (
        <>
          <Trash2 size={isSmall ? 12 : 13} />
          {!isSmall && <span>Hapus</span>}
        </>
      )}
    </button>
  );
}

/* ── Snapshot Card ─────────────────────────────────────────────── */
const SnapshotCard = React.memo(function SnapshotCard({ snap, onSelect, onDeleteDone, onQuickValidate, quickPendingId }) {
  const sev = getSeverity(snap.confidence);
  const sevColor = sev === "high" ? "#DC2626" : sev === "medium" ? "#D97706" : "#059669";
  const vStatus = snap.validation_status ?? "pending";
  const deleteMut = useDeleteSnapshot();
  const [showConfirm, setShowConfirm] = useState(false);
  const quickPending = quickPendingId === snap.id;

  function handleDelete(e) {
    e.stopPropagation();
    if (!showConfirm) {
      setShowConfirm(true);
      return;
    }
    deleteMut.mutate(snap.id, {
      onSuccess: () => {
        setShowConfirm(false);
        onDeleteDone?.();
      },
      onError: (err) => {
        alert(`Gagal menghapus: ${err.message}`);
        setShowConfirm(false);
      },
    });
  }

  function handleQuickValidate(status) {
    return (e) => {
      e.stopPropagation();
      onQuickValidate?.(snap, status);
    };
  }

  return (
    <div className={`fsp-card fsp-card--${vStatus}`}
      onClick={() => onSelect(snap)} role="button" tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onSelect(snap)}>
      <div className="fsp-card-img-wrap">
        <ImgWithFallback
          src={`${API_BASE}/snapshots/${snap.image_path}`}
          alt={`FOD #${snap.id}`}
        />
        <SeverityBadge confidence={snap.confidence} />
        <span className="fsp-frame-chip">F#{snap.frame_number}</span>
      </div>
      <div className="fsp-card-body">
        <div className="fsp-card-top-row">
          <span className="fsp-card-id">#{snap.id}</span>
          <StatusBadge status={vStatus} />
        </div>
        <div className="fsp-conf-row">
          <span className="fsp-conf-label">Confidence</span>
          <span className="fsp-conf-val" style={{ color: sevColor }}>
            {fmtConf(snap.confidence)}
          </span>
        </div>
        <ConfBar confidence={snap.confidence} />
        <div className="fsp-card-meta">
          <div className="fsp-meta-item">
            <span className="fsp-meta-label">Tanggal</span>
            <span className="fsp-meta-value">{fmtDate(snap.timestamp)}</span>
          </div>
          <div className="fsp-meta-item">
            <span className="fsp-meta-label">Waktu</span>
            <span className="fsp-meta-value">{fmtTime(snap.timestamp)}</span>
          </div>
          <div className="fsp-meta-item">
            <span className="fsp-meta-label">Label</span>
            <span className="fsp-meta-value">{snap.label ?? "FOD"}</span>
          </div>
          <div className="fsp-meta-item">
            <span className="fsp-meta-label">Video</span>
            <span className="fsp-meta-value fsp-meta-video" title={snap.video_id ?? "—"}>
              {snap.video_id ? snap.video_id.split(/[\\/]/).pop() : "—"}
            </span>
          </div>
        </div>

        {/* ── Aksi bawah card ── */}
        <div className="fsp-card-actions" onClick={e => e.stopPropagation()}>
          {vStatus === "pending" ? (
            <>
              <button className="fsp-btn fsp-btn--confirm" onClick={handleQuickValidate("confirmed")} disabled={quickPending}>
                <CheckCircle2 size={13} /> {quickPending ? "Menyimpan..." : "Konfirmasi"}
              </button>
              <button className="fsp-btn fsp-btn--reject" onClick={handleQuickValidate("rejected")} disabled={quickPending}>
                <XCircle size={13} /> {quickPending ? "Menyimpan..." : "False+"}
              </button>
            </>
          ) : (
            snap.validated_by && (
              <div className="fsp-card-validator">
                oleh {snap.validated_by}
              </div>
            )
          )}
          {/* Tombol Hapus — selalu tampil, tanpa guard apapun */}
          <DeleteButton
            showConfirm={showConfirm}
            onClick={handleDelete}
            disabled={deleteMut.isPending}
            size="sm"
          />
        </div>
      </div>
    </div>
  );
});

/* ── Snapshot List Row ─────────────────────────────────────────── */
const SnapshotListRow = React.memo(function SnapshotListRow({ snap, onSelect, onDeleteDone, onQuickValidate, quickPendingId }) {
  const sev = getSeverity(snap.confidence);
  const sevColor = sev === "high" ? "#DC2626" : sev === "medium" ? "#D97706" : "#059669";
  const vStatus = snap.validation_status ?? "pending";
  const deleteMut = useDeleteSnapshot();
  const [showConfirm, setShowConfirm] = useState(false);
  const quickPending = quickPendingId === snap.id;

  function handleDelete(e) {
    e.stopPropagation();
    if (!showConfirm) {
      setShowConfirm(true);
      return;
    }
    deleteMut.mutate(snap.id, {
      onSuccess: () => {
        setShowConfirm(false);
        onDeleteDone?.();
      },
      onError: (err) => {
        alert(`Gagal menghapus: ${err.message}`);
        setShowConfirm(false);
      },
    });
  }

  function handleQuickValidate(status) {
    return (e) => {
      e.stopPropagation();
      onQuickValidate?.(snap, status);
    };
  }

  return (
    <div className={`fsp-row fsp-row--${vStatus}`}
      onClick={() => onSelect(snap)} role="button" tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onSelect(snap)}>
      <div className="fsp-row-thumb">
        <ImgWithFallback
          src={`${API_BASE}/snapshots/${snap.image_path}`}
          alt={`FOD #${snap.id}`}
        />
      </div>
      <div className="fsp-row-id">#{snap.id}</div>
      <div className="fsp-row-cell fsp-row-cell--label">{snap.label ?? "FOD"}</div>
      <div className="fsp-row-cell fsp-row-cell--conf">
        <span style={{ color: sevColor, fontWeight: 600 }}>{fmtConf(snap.confidence)}</span>
        <SeverityBadge confidence={snap.confidence} />
      </div>
      <div className="fsp-row-cell fsp-row-cell--date">
        {fmtDate(snap.timestamp)}<br />
        <span className="fsp-row-time">{fmtTime(snap.timestamp)}</span>
      </div>
      <div className="fsp-row-cell fsp-row-cell--video" title={snap.video_id ?? "—"}>
        {snap.video_id ? snap.video_id.split(/[\\/]/).pop() : "—"}
      </div>
      <div className="fsp-row-cell fsp-row-cell--status">
        <StatusBadge status={vStatus} />
      </div>
      <div className="fsp-row-cell fsp-row-cell--actions" onClick={e => e.stopPropagation()}>
        {vStatus === "pending" ? (
          <>
            <button className="fsp-btn fsp-btn--confirm fsp-btn--sm" onClick={handleQuickValidate("confirmed")} disabled={quickPending}>
              <CheckCircle2 size={12} /> {quickPending ? "Menyimpan..." : "Konfirmasi"}
            </button>
            <button className="fsp-btn fsp-btn--reject fsp-btn--sm" onClick={handleQuickValidate("rejected")} disabled={quickPending}>
              <XCircle size={12} /> {quickPending ? "Menyimpan..." : "False+"}
            </button>
          </>
        ) : snap.validated_by ? (
          <span className="fsp-row-validator">oleh {snap.validated_by}</span>
        ) : null}
        {/* Tombol Hapus di list row — selalu tampil */}
        <DeleteButton
          showConfirm={showConfirm}
          onClick={handleDelete}
          disabled={deleteMut.isPending}
          size="sm"
        />
      </div>
    </div>
  );
});

/* ── Detail + Validation Modal ─────────────────────────────────── */
function SnapshotModal({ snap, onClose, onValidated }) {
  const sev = getSeverity(snap.confidence);
  const sevColor = sev === "high" ? "#DC2626" : sev === "medium" ? "#D97706" : "#059669";
  const validateMut = useValidateSnapshot();
  const deleteMut   = useDeleteSnapshot();
  const submitting  = validateMut.isPending;
  const vStatus     = snap.validation_status ?? "pending";

  const [staffName, setStaffName] = useState(
    () => sessionStorage.getItem("fsp_staff_name") ?? "Operator"
  );
  const [notes, setNotes] = useState("");
  const [showChangeStatus, setShowChangeStatus] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  function handleStaffChange(val) {
    setStaffName(val);
    sessionStorage.setItem("fsp_staff_name", val);
  }

  async function submit(status) {
    try {
      const updated = await validateMut.mutateAsync({
        id: snap.id,
        status,
        staffName: staffName || "Operator",
        notes: notes || null,
      });
      onValidated(updated);
      setShowChangeStatus(false);
    } catch (e) {
      alert(`Gagal menyimpan validasi: ${e.message}`);
    }
  }

  function handleDelete(e) {
    e.stopPropagation();
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }
    deleteMut.mutate(snap.id, {
      onSuccess: () => onClose(),
      onError: (err) => {
        alert(`Gagal menghapus: ${err.message}`);
        setShowDeleteConfirm(false);
      },
    });
  }

  const isValidated = ["confirmed", "rejected"].includes(vStatus);

  return (
    <div className="fsp-modal-overlay" onClick={onClose}>
      <div className="fsp-modal" onClick={e => e.stopPropagation()}>
        {/* Tombol tutup */}
        <button className="fsp-modal-close" onClick={onClose} aria-label="Tutup">
          <X size={18} />
        </button>

        <div className="fsp-modal-img-wrap">
          <img className="fsp-modal-img"
            src={`${API_BASE}/snapshots/${snap.image_path}`}
            alt={`FOD #${snap.id}`}
            onError={e => { e.target.style.display = "none"; }}
          />
          <SeverityBadge confidence={snap.confidence} />
        </div>

        <div className="fsp-modal-body">
          {/* Header: judul + status + tombol hapus */}
          <div className="fsp-modal-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
              <h3 className="fsp-modal-title">FOD #{snap.id}</h3>
              <StatusBadge status={vStatus} />
            </div>
            {/* ── TOMBOL HAPUS DI MODAL ──
                Selalu tampil, full inline style, tidak ada guard isAdmin.
                Diletakkan di header modal agar mudah ditemukan. */}
            <DeleteButton
              showConfirm={showDeleteConfirm}
              onClick={handleDelete}
              disabled={deleteMut.isPending}
              size="md"
            />
          </div>

          <div className="fsp-modal-conf-row">
            <span className="fsp-modal-conf-label">Confidence</span>
            <span className="fsp-modal-conf-val" style={{ color: sevColor }}>
              {fmtConf(snap.confidence)}
            </span>
          </div>
          <ConfBar confidence={snap.confidence} />

          <div className="fsp-modal-details">
            <DetailRow label="Tanggal" value={fmtDate(snap.timestamp)} />
            <DetailRow label="Waktu Deteksi" value={fmtTime(snap.timestamp)} />
            <DetailRow label="Frame" value={`#${snap.frame_number}`} />
            <DetailRow label="Label" value={snap.label ?? "FOD"} />
            <DetailRow label="Ukuran BBox" value={bboxSize(snap.bbox)} />
            <DetailRow label="Posisi (x,y)" value={snap.bbox ? `${snap.bbox.x}, ${snap.bbox.y}` : "—"} />
            <DetailRow label="Video" value={snap.video_id ? snap.video_id.split(/[\\/]/).pop() : "—"} />
            {snap.validated_by && <DetailRow label="Divalidasi oleh" value={snap.validated_by} />}
            {snap.validated_at && <DetailRow label="Waktu Validasi" value={`${fmtDate(snap.validated_at)} ${fmtTime(snap.validated_at)}`} />}
            {snap.validation_notes && <DetailRow label="Catatan" value={snap.validation_notes} />}
          </div>

          {/* Validation form */}
          {(vStatus === "pending" || showChangeStatus) && (
            <div className="fsp-modal-form">
              <div className="fsp-form-row">
                <label className="fsp-form-label">Nama Staff</label>
                <input className="fsp-form-input" value={staffName}
                  onChange={e => handleStaffChange(e.target.value)}
                  placeholder="Nama operator..." />
              </div>
              <div className="fsp-form-row">
                <label className="fsp-form-label">Catatan (opsional)</label>
                <input className="fsp-form-input" value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Catatan validasi..." />
              </div>
              <div className="fsp-modal-actions">
                <button className="fsp-btn fsp-btn--confirm" disabled={submitting}
                  onClick={() => submit("confirmed")}>
                  {submitting ? "Menyimpan..." : "✓ Konfirmasi FOD"}
                </button>
                <button className="fsp-btn fsp-btn--reject" disabled={submitting}
                  onClick={() => submit("rejected")}>
                  {submitting ? "Menyimpan..." : "✗ False Positive"}
                </button>
                {showChangeStatus && (
                  <button className="fsp-btn fsp-btn--cancel"
                    onClick={() => setShowChangeStatus(false)}>Batal</button>
                )}
              </div>
            </div>
          )}

          {isValidated && !showChangeStatus && (
            <div className="fsp-modal-validated-row">
              <button className="fsp-change-status-btn"
                onClick={() => setShowChangeStatus(true)}>
                Ubah Status
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="fsp-detail-row">
      <span className="fsp-detail-label">{label}</span>
      <span className="fsp-detail-value">{value}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */
const TABS = [
  { key: "all",       label: "Semua",          icon: Camera },
  { key: "pending",   label: "Pending",        icon: Clock },
  { key: "confirmed", label: "Confirmed",      icon: CheckCircle2 },
  { key: "rejected",  label: "False Positive", icon: XCircle },
];

export default function FodSnapshotsPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [sortBy, setSortBy] = useState("newest");
  const [viewMode, setViewMode] = useState("list");
  const [quickPendingId, setQuickPendingId] = useState(null);
  const validateMut = useValidateSnapshot();

  const { data: snapshots = [], isLoading, error } = useAllSnapshots(
    activeTab === "all" ? null : activeTab,
    { refetchInterval: false }
  );

  /* ── Search filter ── */
  const filteredSnaps = useMemo(() => {
    let items = [...snapshots];
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(s =>
        String(s.id).includes(q) ||
        (s.label ?? "").toLowerCase().includes(q) ||
        (s.video_id ?? "").toLowerCase().includes(q)
      );
    }
    if (sortBy === "newest") {
      items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (sortBy === "oldest") {
      items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else if (sortBy === "confidence") {
      items.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    }
    return items;
  }, [snapshots, search, sortBy]);

  /* ── Global counts ── */
  const { data: allSnaps = [] } = useAllSnapshots(null, { refetchInterval: false });
  const globalCounts = useMemo(() => ({
    all:       allSnaps.length,
    pending:   allSnaps.filter(s => (s.validation_status ?? "pending") === "pending").length,
    confirmed: allSnaps.filter(s => s.validation_status === "confirmed").length,
    rejected:  allSnaps.filter(s => s.validation_status === "rejected").length,
  }), [allSnaps]);

  const [downloading, setDownloading] = useState(null);

  async function handleDownloadZip(statusKey) {
    if (downloading) return;
    setDownloading(statusKey);
    try {
      const qs = new URLSearchParams();
      if (statusKey && statusKey !== "all") qs.set("validation_status", statusKey);
      const res = await fetch(`${API_BASE}/fod-snapshots/download-zip?${qs}`);
      if (!res.ok) {
        const msg = res.status === 404 ? "Tidak ada snapshot untuk diunduh." : `Download gagal: ${res.status}`;
        alert(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fod_snapshots_${statusKey || "all"}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Download gagal: ${e.message}`);
    } finally {
      setDownloading(null);
    }
  }

  function handleValidated(updated) {
    setSelected(prev => prev?.id === updated.id ? updated : prev);
  }

  const handleQuickValidate = useCallback(async (snap, status) => {
    if (!snap || quickPendingId != null) return;
    setQuickPendingId(snap.id);
    try {
      const updated = await validateMut.mutateAsync({
        id: snap.id,
        status,
        staffName: getQuickValidationStaffName(),
        notes: null,
      });
      handleValidated(updated);
    } catch (e) {
      alert(`Gagal menyimpan validasi: ${e.message}`);
    } finally {
      setQuickPendingId(null);
    }
  }, [quickPendingId, validateMut]);

  return (
    <div className="fsp">
      {/* ── Page Header ── */}
      <div className="fsp-header">
        <div className="fsp-header-left">
          <Camera size={20} className="fsp-header-icon" />
          <h1 className="fsp-page-title">FOD Snapshots</h1>
          <span className="fsp-count-badge">{globalCounts.all} total</span>
        </div>
        <div className="fsp-header-right">
          <div className="fsp-search-wrap">
            <Search size={14} className="fsp-search-icon" />
            <input className="fsp-search" value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari ID, label, video..." />
            {search && (
              <button className="fsp-search-clear" onClick={() => setSearch("")}>
                <X size={12} />
              </button>
            )}
          </div>
          <div className="fsp-sort-wrap">
            <select className="fsp-sort" value={sortBy}
              onChange={e => setSortBy(e.target.value)}>
              <option value="newest">Terbaru</option>
              <option value="oldest">Terlama</option>
              <option value="confidence">Confidence ↓</option>
            </select>
          </div>
          <div className="fsp-view-toggle">
            <button
              className={`fsp-view-btn ${viewMode === "grid" ? "fsp-view-btn--active" : ""}`}
              onClick={() => setViewMode("grid")}
              title="Tampilan Grid">
              <LayoutGrid size={15} />
            </button>
            <button
              className={`fsp-view-btn ${viewMode === "list" ? "fsp-view-btn--active" : ""}`}
              onClick={() => setViewMode("list")}
              title="Tampilan List">
              <List size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Summary Stats ── */}
      <div className="fsp-stats">
        {TABS.filter(t => t.key !== "all").map(t => {
          const cfg = STATUS_CONFIG[t.key];
          const Icon = t.icon;
          return (
            <div key={t.key} className="fsp-stat-card" style={{ borderColor: cfg.border }}>
              <div className="fsp-stat-icon" style={{ background: cfg.bg, color: cfg.color }}>
                <Icon size={16} />
              </div>
              <div className="fsp-stat-info">
                <span className="fsp-stat-count">{globalCounts[t.key]}</span>
                <span className="fsp-stat-label">{cfg.label}</span>
              </div>
              <button
                className="fsp-stat-dl"
                title={`Download ${cfg.label} sebagai ZIP`}
                disabled={downloading === t.key || globalCounts[t.key] === 0}
                onClick={() => handleDownloadZip(t.key)}>
                {downloading === t.key
                  ? <div className="fsp-spinner fsp-spinner--sm" />
                  : <Download size={14} />}
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Tabs ── */}
      <div className="fsp-tabs-row">
        <div className="fsp-tabs">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key}
                className={`fsp-tab ${activeTab === t.key ? "fsp-tab--active" : ""}`}
                onClick={() => setActiveTab(t.key)}>
                <Icon size={14} />
                {t.label}
                <span className="fsp-tab-count">{globalCounts[t.key]}</span>
              </button>
            );
          })}
        </div>
        <button
          className="fsp-dl-all-btn"
          disabled={downloading === activeTab || globalCounts[activeTab] === 0}
          onClick={() => handleDownloadZip(activeTab)}>
          {downloading === activeTab
            ? <><div className="fsp-spinner fsp-spinner--sm" /> Mengunduh...</>
            : <><Download size={14} /> Download {activeTab === "all" ? "Semua" : TABS.find(t => t.key === activeTab)?.label} (.zip)</>}
        </button>
      </div>

      {/* ── Content ── */}
      <div className="fsp-content">
        {isLoading && (
          <div className="fsp-loading">
            <div className="fsp-spinner" />
            <span>Memuat snapshot...</span>
          </div>
        )}
        {error && (
          <div className="fsp-error">
            <AlertTriangle size={18} />
            <span>Gagal memuat data: {error.message}</span>
          </div>
        )}
        {!isLoading && !error && filteredSnaps.length === 0 && (
          <div className="fsp-empty">
            <Camera size={32} strokeWidth={1.2} />
            <p className="fsp-empty-title">Tidak ada snapshot</p>
            <p className="fsp-empty-desc">
              {search ? "Tidak ditemukan snapshot yang cocok dengan pencarian." : "Belum ada deteksi FOD yang tercatat."}
            </p>
          </div>
        )}
        {!isLoading && !error && filteredSnaps.length > 0 && viewMode === "grid" && (
          <div className="fsp-grid">
            {filteredSnaps.map(snap => (
              <SnapshotCard
                key={snap.id}
                snap={snap}
                onSelect={setSelected}
                onDeleteDone={() => setSelected(null)}
                onQuickValidate={handleQuickValidate}
                quickPendingId={quickPendingId}
              />
            ))}
          </div>
        )}
        {!isLoading && !error && filteredSnaps.length > 0 && viewMode === "list" && (
          <div className="fsp-list">
            <div className="fsp-list-header">
              <div className="fsp-lh-thumb" />
              <div className="fsp-lh-id">ID</div>
              <div className="fsp-lh-cell">Label</div>
              <div className="fsp-lh-cell">Confidence</div>
              <div className="fsp-lh-cell">Tanggal</div>
              <div className="fsp-lh-cell">Video</div>
              <div className="fsp-lh-cell">Status</div>
              <div className="fsp-lh-cell">Aksi</div>
            </div>
            {filteredSnaps.map(snap => (
              <SnapshotListRow
                key={snap.id}
                snap={snap}
                onSelect={setSelected}
                onDeleteDone={() => setSelected(null)}
                onQuickValidate={handleQuickValidate}
                quickPendingId={quickPendingId}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      {selected && (
        <SnapshotModal snap={selected} onClose={() => setSelected(null)}
          onValidated={handleValidated} />
      )}
    </div>
  );
}