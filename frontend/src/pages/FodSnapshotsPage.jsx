import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  useAllSnapshots, useValidateSnapshot, useDeleteSnapshot,
  useBulkValidateSnapshots, useBulkDeleteSnapshots,
} from "../hooks/useQueries";
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
  Square,
  CheckSquare,
  MinusSquare,
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
const SnapshotCard = React.memo(function SnapshotCard({ snap, onSelect, isSelected, onToggleSelect }) {
  const sev = getSeverity(snap.confidence);
  const sevColor = sev === "high" ? "#DC2626" : sev === "medium" ? "#D97706" : "#059669";
  const vStatus = snap.validation_status ?? "pending";

  return (
    <div className={`fsp-card fsp-card--${vStatus}${isSelected ? " fsp-card--selected" : ""}`}
      onClick={() => onSelect(snap)} role="button" tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onSelect(snap)}>
      <div className="fsp-card-img-wrap">
        <button
          className={`fsp-card-check${isSelected ? " fsp-card-check--on" : ""}`}
          onClick={e => { e.stopPropagation(); onToggleSelect?.(snap.id); }}
          aria-label={isSelected ? "Batalkan pilih" : "Pilih"}
          tabIndex={-1}
        >
          {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
        </button>
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

        {snap.validated_by && (
          <div className="fsp-card-validator">
            oleh {snap.validated_by}
          </div>
        )}
      </div>
    </div>
  );
});

/* ── Snapshot List Row ─────────────────────────────────────────── */
const SnapshotListRow = React.memo(function SnapshotListRow({ snap, onSelect, isSelected, onToggleSelect }) {
  const sev = getSeverity(snap.confidence);
  const sevColor = sev === "high" ? "#DC2626" : sev === "medium" ? "#D97706" : "#059669";
  const vStatus = snap.validation_status ?? "pending";

  return (
    <div className={`fsp-row fsp-row--${vStatus}${isSelected ? " fsp-row--selected" : ""}`}
      onClick={() => onSelect(snap)} role="button" tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onSelect(snap)}>
      <div className="fsp-row-check" onClick={e => e.stopPropagation()}>
        <button
          className={`fsp-check-btn${isSelected ? " fsp-check-btn--on" : ""}`}
          onClick={() => onToggleSelect?.(snap.id)}
          tabIndex={-1}
          aria-label={isSelected ? "Batalkan pilih" : "Pilih"}
        >
          {isSelected ? <CheckSquare size={15} /> : <Square size={15} />}
        </button>
      </div>
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
        {snap.validated_by && (
          <span className="fsp-row-validator">oleh {snap.validated_by}</span>
        )}
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
/* ── Bulk Action Bar ───────────────────────────────────────────────── */
function BulkActionBar({
  selectedCount, pageCount, allPageSelected,
  onSelectPage, onClearAll,
  onConfirm, onReject, onDelete,
  isPending, pendingAction,
}) {
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [staffInput, setStaffInput] = useState(
    () => sessionStorage.getItem("fsp_staff_name") ?? "Operator"
  );

  function handleStaffChange(val) {
    setStaffInput(val);
    sessionStorage.setItem("fsp_staff_name", val);
  }

  function handleDeleteClick() {
    if (!deleteConfirm) { setDeleteConfirm(true); return; }
    setDeleteConfirm(false);
    onDelete();
  }

  useEffect(() => {
    if (!isPending) setDeleteConfirm(false);
  }, [isPending]);

  return (
    <div className="fsp-bulk-bar">
      <div className="fsp-bulk-bar-left">
        <span className="fsp-bulk-count">
          <CheckSquare size={14} />
          {selectedCount} item dipilih
        </span>
        <div className="fsp-bulk-links">
          {!allPageSelected && (
            <button className="fsp-bulk-link" onClick={onSelectPage}>
              Pilih semua {pageCount} di halaman ini
            </button>
          )}
          <button className="fsp-bulk-link fsp-bulk-link--clear" onClick={onClearAll}>
            <X size={11} /> Batalkan
          </button>
        </div>
      </div>

      <div className="fsp-bulk-bar-mid">
        <label className="fsp-bulk-staff-label">Staff:</label>
        <input
          className="fsp-bulk-staff-input"
          value={staffInput}
          onChange={e => handleStaffChange(e.target.value)}
          placeholder="Nama operator..."
          disabled={isPending}
        />
      </div>

      <div className="fsp-bulk-bar-right">
        {isPending ? (
          <div className="fsp-bulk-pending">
            <div className="fsp-spinner fsp-spinner--sm" />
            <span>{pendingAction === "delete" ? "Menghapus..." : "Memvalidasi..."}</span>
          </div>
        ) : (
          <>
            <button
              className="fsp-bulk-btn fsp-bulk-btn--confirm"
              onClick={() => onConfirm(staffInput)}
            >
              <CheckCircle2 size={13} /> Konfirmasi FOD
            </button>
            <button
              className="fsp-bulk-btn fsp-bulk-btn--reject"
              onClick={() => onReject(staffInput)}
            >
              <XCircle size={13} /> False Positive
            </button>
            <button
              className={`fsp-bulk-btn ${deleteConfirm ? "fsp-bulk-btn--delete-confirm" : "fsp-bulk-btn--delete"}`}
              onClick={handleDeleteClick}
              title={deleteConfirm ? "Klik lagi untuk konfirmasi hapus" : "Hapus semua yang dipilih"}
            >
              <Trash2 size={13} />
              {deleteConfirm ? `Hapus ${selectedCount}? Konfirmasi` : `Hapus (${selectedCount})`}
            </button>
          </>
        )}
      </div>
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
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkPendingAction, setBulkPendingAction] = useState(null);
  const bulkValidateMut = useBulkValidateSnapshots();
  const bulkDeleteMut = useBulkDeleteSnapshots();

  const PAGE_SIZE = 50;

  // Single query — fetch all snapshots, filter client-side to avoid duplicate requests
  const { data: allSnaps = [], isLoading, error } = useAllSnapshots(null, { refetchInterval: false });

  /* ── Search + tab filter ── */
  const filteredSnaps = useMemo(() => {
    let items = activeTab === "all"
      ? [...allSnaps]
      : allSnaps.filter(s => (s.validation_status ?? "pending") === activeTab);
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
  }, [allSnaps, activeTab, search, sortBy]);

  // Reset ke halaman pertama jika filter/tab/search berubah
  const prevFilterKey = useRef(null);
  const filterKey = `${activeTab}|${search}|${sortBy}`;
  if (prevFilterKey.current !== filterKey) {
    prevFilterKey.current = filterKey;
    if (page !== 0) setPage(0);
  }

  const totalPages = Math.ceil(filteredSnaps.length / PAGE_SIZE);
  const pagedSnaps = filteredSnaps.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const allPageSelected = pagedSnaps.length > 0 && pagedSnaps.every(s => selectedIds.has(s.id));
  const somePageSelected = pagedSnaps.some(s => selectedIds.has(s.id));

  /* ── Global counts (derived from same dataset — no second fetch) ── */
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

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectPage = useCallback(() => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      pagedSnaps.forEach(s => next.add(s.id));
      return next;
    });
  }, [pagedSnaps]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleBulkValidate = useCallback(async (status, staffName) => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setBulkPending(true);
    setBulkPendingAction(status === "confirmed" ? "confirm" : "reject");
    try {
      await bulkValidateMut.mutateAsync({ ids, status, staffName });
      clearSelection();
    } catch (e) {
      alert(`Gagal validasi massal: ${e.message}`);
    } finally {
      setBulkPending(false);
      setBulkPendingAction(null);
    }
  }, [selectedIds, bulkValidateMut, clearSelection]);

  const handleBulkDelete = useCallback(async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setBulkPending(true);
    setBulkPendingAction("delete");
    try {
      await bulkDeleteMut.mutateAsync(ids);
      clearSelection();
      setSelected(null);
    } catch (e) {
      alert(`Gagal hapus massal: ${e.message}`);
    } finally {
      setBulkPending(false);
      setBulkPendingAction(null);
    }
  }, [selectedIds, bulkDeleteMut, clearSelection]);

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
            {pagedSnaps.map(snap => (
              <SnapshotCard
                key={snap.id}
                snap={snap}
                onSelect={setSelected}
                isSelected={selectedIds.has(snap.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        )}
        {!isLoading && !error && filteredSnaps.length > 0 && viewMode === "list" && (
          <div className="fsp-list">
            <div className="fsp-list-header">
              <div className="fsp-lh-check">
                <button
                  className={`fsp-check-btn${allPageSelected ? " fsp-check-btn--on" : somePageSelected ? " fsp-check-btn--partial" : ""}`}
                  onClick={allPageSelected ? clearSelection : selectPage}
                  title={allPageSelected ? "Batalkan pilih semua di halaman ini" : "Pilih semua di halaman ini"}
                  tabIndex={-1}
                >
                  {allPageSelected
                    ? <CheckSquare size={15} />
                    : somePageSelected
                      ? <MinusSquare size={15} />
                      : <Square size={15} />}
                </button>
              </div>
              <div className="fsp-lh-thumb" />
              <div className="fsp-lh-id">ID</div>
              <div className="fsp-lh-cell">Label</div>
              <div className="fsp-lh-cell">Confidence</div>
              <div className="fsp-lh-cell">Tanggal</div>
              <div className="fsp-lh-cell">Video</div>
              <div className="fsp-lh-cell">Status</div>
            </div>
            {pagedSnaps.map(snap => (
              <SnapshotListRow
                key={snap.id}
                snap={snap}
                onSelect={setSelected}
                isSelected={selectedIds.has(snap.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        )}

        {/* ── Pagination ── */}
        {!isLoading && !error && totalPages > 1 && (
          <div className="fsp-pagination">
            <button
              className="fsp-page-btn"
              disabled={page === 0}
              onClick={() => setPage(p => Math.max(0, p - 1))}>
              ← Sebelumnya
            </button>
            <span className="fsp-page-info">
              Halaman {page + 1} / {totalPages}
              <span className="fsp-page-count"> ({filteredSnaps.length} total)</span>
            </span>
            <button
              className="fsp-page-btn"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}>
              Berikutnya →
            </button>
          </div>
        )}

      </div>{/* end fsp-content */}

      {/* ── Bulk Action Bar (floating fixed) ── */}
      {selectedIds.size > 0 && (
        <BulkActionBar
          selectedCount={selectedIds.size}
          pageCount={pagedSnaps.length}
          allPageSelected={allPageSelected}
          onSelectPage={selectPage}
          onClearAll={clearSelection}
          onConfirm={(staff) => handleBulkValidate("confirmed", staff)}
          onReject={(staff) => handleBulkValidate("rejected", staff)}
          onDelete={handleBulkDelete}
          isPending={bulkPending}
          pendingAction={bulkPendingAction}
        />
      )}

      {/* ── Modal ── */}
      {selected && (
        <SnapshotModal snap={selected} onClose={() => setSelected(null)}
          onValidated={handleValidated} />
      )}
    </div>
  );
}