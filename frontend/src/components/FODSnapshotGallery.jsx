import React, { useEffect, useRef, useState } from "react";
import "../styles/FODSnapshotGallery.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";
const POLL_INTERVAL_MS = 3000;

/* ── Helpers ─────────────────────────────────────────────────── */
function getSeverity(confidence) {
  if (confidence == null) return "low";
  if (confidence >= 0.70) return "high";
  if (confidence >= 0.40) return "medium";
  return "low";
}

function fmtTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("id-ID", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
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

const V_STATUS_LABEL = {
  pending:   "Pending",
  confirmed: "Confirmed",
  rejected:  "False Positive",
  resolved:  "Resolved",
};

/* ── Severity Badge ──────────────────────────────────────────── */
function SeverityBadge({ confidence }) {
  const s     = getSeverity(confidence);
  const label = s.charAt(0).toUpperCase() + s.slice(1);
  return <span className={`fsg-severity fsg-severity--${s}`}>{label}</span>;
}

/* ── Validation Status Chip ──────────────────────────────────── */
function VStatusChip({ status }) {
  const s = status ?? "pending";
  return (
    <span className={`fsg-vstatus fsg-vstatus--${s}`}>
      {V_STATUS_LABEL[s] ?? s}
    </span>
  );
}

/* ── Confidence Bar ──────────────────────────────────────────── */
function ConfBar({ confidence, trackClass, fillClass }) {
  const s   = getSeverity(confidence);
  const pct = confidence != null ? Math.min(confidence * 100, 100) : 0;
  return (
    <div className={trackClass}>
      <div className={`${fillClass} ${fillClass}--${s}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ── Image with fallback ─────────────────────────────────────── */
function ImgWithFallback({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="fsg-card-noimg">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.4">
          <rect x="3" y="3" width="18" height="18" rx="3"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <path d="M21 15l-5-5L5 21"/>
        </svg>
        <span>No image</span>
      </div>
    );
  }
  return (
    <img className="fsg-card-img" src={src} alt={alt}
      onError={() => setFailed(true)} />
  );
}

/* ── Skeleton Loading ────────────────────────────────────────── */
function SkeletonCards({ count = 4 }) {
  return (
    <div className="fsg-skeleton-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="fsg-skeleton-card">
          <div className="fsg-skeleton-img" />
          <div className="fsg-skeleton-body">
            <div className="fsg-skeleton-line fsg-skeleton-line--full" />
            <div className="fsg-skeleton-line fsg-skeleton-line--med" />
            <div className="fsg-skeleton-line fsg-skeleton-line--short" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DETAIL + VALIDATION MODAL
   ═══════════════════════════════════════════════════════════════ */
function SnapshotModal({ snap, staffName, onClose, onValidated }) {
  const sev      = getSeverity(snap.confidence);
  const sevColor = sev === "high" ? "#DC2626" : sev === "medium" ? "#D97706" : "#059669";
  const isPending   = (snap.validation_status ?? "pending") === "pending";
  const isConfirmed = snap.validation_status === "confirmed";

  // Form state
  const [formName,   setFormName]   = useState(staffName);
  const [formNotes,  setFormNotes]  = useState(snap.validation_notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [revalidate, setRevalidate] = useState(false);  // buka form ulang untuk data yg sudah validated

  const showForm = isPending || revalidate;

  async function submit(status) {
    // For "resolved" action, fall back to the person who originally confirmed it
    const resolvedBy = formName.trim() || snap.validated_by || "";
    if (!resolvedBy) {
      document.getElementById("fsg-modal-name-input")?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/fod-snapshots/${snap.id}/validate`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          validation_status: status,
          validated_by:      resolvedBy,
          validation_notes:  formNotes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = await res.json();
      onValidated(updated);
      if (revalidate) setRevalidate(false);
    } catch (e) {
      alert(`Gagal menyimpan validasi: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fsg-modal-overlay" onClick={onClose}>
      <div className="fsg-modal" onClick={e => e.stopPropagation()}>

        {/* ── Image ── */}
        <div className="fsg-modal-img-wrap">
          <img className="fsg-modal-img"
            src={`${API_BASE}/snapshots/${snap.image_path}`}
            alt={`FOD #${snap.id}`}
            onError={e => { e.target.style.display = "none"; }}
          />
          <SeverityBadge confidence={snap.confidence} />
          <button className="fsg-modal-close" onClick={onClose} aria-label="Tutup">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* ── Body ── */}
        <div className="fsg-modal-body">

          {/* Title + status */}
          <div style={{ display: "flex", alignItems: "center",
            justifyContent: "space-between", gap: 8 }}>
            <h4 className="fsg-modal-title">
              FOD Snapshot #{snap.id} — Frame {snap.frame_number}
            </h4>
            <VStatusChip status={snap.validation_status} />
          </div>

          {/* Conf bar */}
          <div className="fsg-modal-conf-row">
            <div className="fsg-modal-conf-top">
              <span className="fsg-modal-conf-label">Confidence Score</span>
              <span className="fsg-modal-conf-val" style={{ color: sevColor }}>
                {fmtConf(snap.confidence)}
              </span>
            </div>
            <ConfBar confidence={snap.confidence}
              trackClass="fsg-modal-conf-track" fillClass="fsg-conf-fill" />
          </div>

          {/* Detection detail grid */}
          <div className="fsg-modal-details">
            <div className="fsg-modal-detail-item">
              <span className="fsg-modal-detail-label">Tanggal</span>
              <span className="fsg-modal-detail-value">{fmtDate(snap.timestamp)}</span>
            </div>
            <div className="fsg-modal-detail-item">
              <span className="fsg-modal-detail-label">Waktu Deteksi</span>
              <span className="fsg-modal-detail-value">{fmtTime(snap.timestamp)}</span>
            </div>
            <div className="fsg-modal-detail-item">
              <span className="fsg-modal-detail-label">Label</span>
              <span className="fsg-modal-detail-value">{snap.label ?? "FOD"}</span>
            </div>
            <div className="fsg-modal-detail-item">
              <span className="fsg-modal-detail-label">Frame #</span>
              <span className="fsg-modal-detail-value">{snap.frame_number}</span>
            </div>
            <div className="fsg-modal-detail-item">
              <span className="fsg-modal-detail-label">Ukuran BBox</span>
              <span className="fsg-modal-detail-value">{bboxSize(snap.bbox)}</span>
            </div>
            <div className="fsg-modal-detail-item">
              <span className="fsg-modal-detail-label">Posisi (x, y)</span>
              <span className="fsg-modal-detail-value">
                {snap.bbox ? `${snap.bbox.x}, ${snap.bbox.y}` : "—"}
              </span>
            </div>
          </div>

          <div className="fsg-modal-divider" />

          {/* ── SUDAH DIVALIDASI — tampilkan info + opsi re-validate ── */}
          {!showForm && (
            <>
              <div className="fsg-validated-info">
                <p className="fsg-modal-validate-title" style={{ marginBottom: 4 }}>
                  Hasil Validasi
                </p>
                <div className="fsg-validated-info-row">
                  <span className="fsg-validated-info-label">Status</span>
                  <VStatusChip status={snap.validation_status} />
                </div>
                <div className="fsg-validated-info-row">
                  <span className="fsg-validated-info-label">Divalidasi oleh</span>
                  <span className="fsg-validated-info-value">
                    {snap.validated_by ?? "—"}
                  </span>
                </div>
                <div className="fsg-validated-info-row">
                  <span className="fsg-validated-info-label">Waktu</span>
                  <span className="fsg-validated-info-value">
                    {snap.validated_at
                      ? `${fmtDate(snap.validated_at)}, ${fmtTime(snap.validated_at)}`
                      : "—"}
                  </span>
                </div>
                {snap.validation_notes && (
                  <div className="fsg-validated-info-row">
                    <span className="fsg-validated-info-label">Catatan</span>
                    <span className="fsg-validated-info-value">{snap.validation_notes}</span>
                  </div>
                )}
              </div>

              {/* Resolve button untuk confirmed */}
              {isConfirmed && (
                <button
                  className="fsg-modal-btn-resolve"
                  disabled={submitting}
                  onClick={() => submit("resolved")}
                >
                  {submitting
                    ? <><span className="fsg-spinner" /> Menyimpan...</>
                    : "Tandai Resolved — FOD Sudah Diangkat"}
                </button>
              )}

              <p className="fsg-modal-revalidate-hint">
                Status keliru?{" "}
                <button onClick={() => { setRevalidate(true); setFormNotes(snap.validation_notes ?? ""); }}>
                  Ubah validasi
                </button>
              </p>
            </>
          )}

          {/* ── FORM VALIDASI (pending atau re-validate) ── */}
          {showForm && (
            <div className="fsg-modal-validate">
              <p className="fsg-modal-validate-title">
                {revalidate ? "Ubah Validasi" : "Validasi Deteksi Ini"}
              </p>

              <div className="fsg-modal-field">
                <label htmlFor="fsg-modal-name-input">Nama Staff *</label>
                <input
                  id="fsg-modal-name-input"
                  type="text"
                  placeholder="Masukkan nama Anda"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  autoFocus={!formName}
                />
              </div>

              <div className="fsg-modal-field">
                <label>Catatan (opsional)</label>
                <textarea
                  rows={2}
                  placeholder="Keterangan tambahan tentang deteksi ini..."
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                />
              </div>

              <div className="fsg-modal-validate-actions">
                <button
                  className="fsg-modal-btn-confirm"
                  disabled={submitting || !formName.trim()}
                  onClick={() => submit("confirmed")}
                >
                  {submitting
                    ? <><span className="fsg-spinner" /> Menyimpan...</>
                    : <>✓ Konfirmasi FOD</>}
                </button>
                <button
                  className="fsg-modal-btn-reject"
                  disabled={submitting || !formName.trim()}
                  onClick={() => submit("rejected")}
                >
                  {submitting
                    ? <><span className="fsg-spinner" /> Menyimpan...</>
                    : <>✗ False Positive</>}
                </button>
              </div>

              {revalidate && (
                <p className="fsg-modal-revalidate-hint">
                  <button onClick={() => setRevalidate(false)}>Batalkan</button>
                </p>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
const TABS = [
  { key: "all",       label: "Semua"        },
  { key: "pending",   label: "Pending"      },
  { key: "confirmed", label: "Confirmed"    },
  { key: "rejected",  label: "False Positive" },
  { key: "resolved",  label: "Resolved"     },
];

export default function FODSnapshotGallery({ enabled, videoId }) {
  const [snapshots, setSnapshots]   = useState([]);
  const [loading,   setLoading]     = useState(false);
  const [error,     setError]       = useState(null);
  const [selected,  setSelected]    = useState(null);
  const [activeTab, setActiveTab]   = useState("all");
  // Nama staff yang diingat selama sesi (sessionStorage)
  const [staffName, setStaffName]   = useState(
    () => sessionStorage.getItem("fsg_staff_name") ?? ""
  );
  const intervalRef = useRef(null);

  /* ── Persist staffName ke sessionStorage ── */
  function handleStaffName(val) {
    setStaffName(val);
    sessionStorage.setItem("fsg_staff_name", val);
  }

  /* ── Fetch snapshots ── */
  async function fetchSnapshots(vid) {
    try {
      const res = await fetch(`${API_BASE}/fod-snapshots/?video_id=${vid}`);
      if (!res.ok) {
        let msg = `Gagal fetch snapshot: ${res.status}`;
        try { msg += "\n" + await res.text(); } catch {}
        throw new Error(msg);
      }
      setSnapshots(await res.json());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (!videoId) {
      setSnapshots([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    fetchSnapshots(videoId);
    if (enabled) {
      intervalRef.current = setInterval(() => fetchSnapshots(videoId), POLL_INTERVAL_MS);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, videoId]);

  /* ── Update single snapshot setelah validasi ── */
  function handleValidated(updated) {
    setSnapshots(prev => prev.map(s => s.id === updated.id ? updated : s));
    // Sync selected jika modal masih terbuka
    setSelected(prev => prev?.id === updated.id ? updated : prev);
  }

  /* ── Derived stats ── */
  const total   = snapshots.length;
  const maxConf = total ? Math.max(...snapshots.map(s => s.confidence ?? 0)) : null;
  const avgConf = total
    ? snapshots.reduce((a, s) => a + (s.confidence ?? 0), 0) / total
    : null;

  /* ── Tab counts ── */
  const counts = {
    all:       total,
    pending:   snapshots.filter(s => (s.validation_status ?? "pending") === "pending").length,
    confirmed: snapshots.filter(s => s.validation_status === "confirmed").length,
    rejected:  snapshots.filter(s => s.validation_status === "rejected").length,
    resolved:  snapshots.filter(s => s.validation_status === "resolved").length,
  };

  /* ── Filtered list untuk grid ── */
  const visibleSnaps = activeTab === "all"
    ? snapshots
    : snapshots.filter(s =>
        activeTab === "pending"
          ? (s.validation_status ?? "pending") === "pending"
          : s.validation_status === activeTab
      );

  /* ── Render states ── */
  if (!videoId && !snapshots.length) {
    return (
      <div className="fsg-widget">
        <div className="fsg-empty">
          <div className="fsg-empty-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.6">
              <rect x="3" y="3" width="18" height="18" rx="3"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="M21 15l-5-5L5 21"/>
            </svg>
          </div>
          <p className="fsg-empty-title">Belum Ada Sesi Aktif</p>
          <p className="fsg-empty-sub">
            Galeri snapshot FOD akan muncul setelah pipeline deteksi berjalan
            dan objek asing terdeteksi pada runway.
          </p>
        </div>
      </div>
    );
  }

  if (loading && !snapshots.length) {
    return <div className="fsg-widget"><SkeletonCards count={4} /></div>;
  }

  if (error) {
    return (
      <div className="fsg-widget">
        <div className="fsg-error">
          <span className="fsg-error-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v4M12 16h.01"/>
            </svg>
          </span>
          {error}
        </div>
      </div>
    );
  }

  if (!snapshots.length) {
    return (
      <div className="fsg-widget">
        <div className="fsg-empty">
          <div className="fsg-empty-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.6">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
          </div>
          <p className="fsg-empty-title">Menunggu Deteksi FOD</p>
          <p className="fsg-empty-sub">
            Pipeline aktif. Snapshot tersimpan otomatis saat objek asing
            terdeteksi pada runway.
          </p>
        </div>
      </div>
    );
  }

  /* ── Full gallery ── */
  return (
    <>
      <div className="fsg-widget">

        {/* ── Header ── */}
        <div className="fsg-header">
          <div className="fsg-header-left">
            <span className="fsg-title">FOD Snapshots</span>
            <span className="fsg-count-badge">{total} objek</span>
          </div>
          {enabled
            ? <span className="fsg-live-badge"><span className="fsg-live-dot" />Live</span>
            : <span className="fsg-count-badge" style={{ color: "#6B7280" }}>Sesi Selesai</span>
          }
        </div>

        {/* ── Summary strip ── */}
        <div className="fsg-summary">
          <div className="fsg-summary-item">
            <span className="fsg-summary-val">{total}</span>
            <span className="fsg-summary-lbl">Total Snapshot</span>
          </div>
          <div className="fsg-summary-div" />
          <div className="fsg-summary-item">
            <span className="fsg-summary-val"
              style={{ color: maxConf != null
                ? (maxConf >= 0.70 ? "#DC2626" : maxConf >= 0.40 ? "#D97706" : "#059669")
                : "#374151"
              }}>
              {fmtConf(maxConf)}
            </span>
            <span className="fsg-summary-lbl">Conf. Tertinggi</span>
          </div>
          <div className="fsg-summary-div" />
          <div className="fsg-summary-item">
            <span className="fsg-summary-val">{fmtConf(avgConf)}</span>
            <span className="fsg-summary-lbl">Rata-rata Conf.</span>
          </div>
          <div className="fsg-summary-div" />
          <div className="fsg-summary-item">
            <span className="fsg-summary-val">{counts.confirmed}</span>
            <span className="fsg-summary-lbl">Terkonfirmasi</span>
          </div>
          <div className="fsg-summary-div" />
          <div className="fsg-summary-item">
            <span className="fsg-summary-val">{counts.pending}</span>
            <span className="fsg-summary-lbl">Belum Direview</span>
          </div>
        </div>

        {/* ── Staff name + filter tabs row ── */}
        <div style={{ display: "flex", alignItems: "center",
          gap: 10, flexWrap: "wrap" }}>

          {/* Staff name badge/input */}
          <div style={{ display: "flex", alignItems: "center", gap: 6,
            flexShrink: 0, background: "#F9FAFB", border: "1px solid #E5E7EB",
            borderRadius: 8, padding: "3px 8px" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="#9CA3AF" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <input
              type="text"
              placeholder="Nama staff reviewer"
              value={staffName}
              onChange={e => handleStaffName(e.target.value)}
              style={{ border: "none", background: "transparent", outline: "none",
                fontSize: "11.5px", color: "#374151", width: 130,
                fontFamily: "inherit" }}
            />
          </div>

          {/* Filter tabs */}
          <div className="fsg-tabs" style={{ flex: 1, minWidth: 0 }}>
            {TABS.map(tab => (
              <button
                key={tab.key}
                data-tab={tab.key}
                className={`fsg-tab${activeTab === tab.key ? " active" : ""}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
                <span className="fsg-tab-count">{counts[tab.key]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Grid area ── */}
        <div className="fsg-grid-area">
          {visibleSnaps.length === 0
            ? (
              <div className="fsg-empty" style={{ padding: "28px 20px" }}>
                <p className="fsg-empty-title" style={{ fontSize: 12 }}>
                  Tidak ada snapshot di tab ini
                </p>
              </div>
            )
            : (
              <div className="fsg-grid">
                {visibleSnaps.map(snap => {
                  const vStatus  = snap.validation_status ?? "pending";
                  const sev      = getSeverity(snap.confidence);
                  const sevColor = sev === "high" ? "#DC2626"
                                 : sev === "medium" ? "#D97706"
                                 : "#059669";
                  const isPending = vStatus === "pending";
                  const isConf    = vStatus === "confirmed";

                  return (
                    <div
                      key={snap.id}
                      className={`fsg-card fsg-card--${vStatus}`}
                      onClick={() => setSelected(snap)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => e.key === "Enter" && setSelected(snap)}
                    >
                      {/* Image */}
                      <div className="fsg-card-img-wrap">
                        <ImgWithFallback
                          src={`${API_BASE}/snapshots/${snap.image_path}`}
                          alt={`FOD #${snap.id}`}
                        />
                        <span className="fsg-frame-chip">F#{snap.frame_number}</span>
                        <SeverityBadge confidence={snap.confidence} />
                      </div>

                      {/* Body */}
                      <div className="fsg-card-body">

                        {/* Confidence */}
                        <div className="fsg-conf-row">
                          <div className="fsg-conf-top">
                            <span className="fsg-conf-label">Confidence</span>
                            <span className="fsg-conf-val" style={{ color: sevColor }}>
                              {fmtConf(snap.confidence)}
                            </span>
                          </div>
                          <ConfBar confidence={snap.confidence}
                            trackClass="fsg-conf-track" fillClass="fsg-conf-fill" />
                        </div>

                        <div className="fsg-card-divider" />

                        {/* Metadata */}
                        <div className="fsg-meta">
                          <div className="fsg-meta-item">
                            <span className="fsg-meta-label">Waktu</span>
                            <span className="fsg-meta-value">{fmtTime(snap.timestamp)}</span>
                          </div>
                          <div className="fsg-meta-item">
                            <span className="fsg-meta-label">Label</span>
                            <span className="fsg-meta-value">{snap.label ?? "FOD"}</span>
                          </div>
                          <div className="fsg-meta-item">
                            <span className="fsg-meta-label">Ukuran</span>
                            <span className="fsg-meta-value">{bboxSize(snap.bbox)}</span>
                          </div>
                          <div className="fsg-meta-item">
                            <span className="fsg-meta-label">Posisi</span>
                            <span className="fsg-meta-value">
                              {snap.bbox ? `${snap.bbox.x},${snap.bbox.y}` : "—"}
                            </span>
                          </div>
                        </div>

                        <div className="fsg-card-divider" />

                        {/* Validation status chip + quick actions */}
                        {isPending ? (
                          <div className="fsg-card-actions"
                            onClick={e => e.stopPropagation()}>
                            <button
                              className="fsg-btn-confirm"
                              onClick={() => setSelected(snap)}
                              title="Buka modal untuk konfirmasi FOD"
                            >
                              ✓ Konfirmasi
                            </button>
                            <button
                              className="fsg-btn-reject"
                              onClick={() => setSelected(snap)}
                              title="Buka modal untuk tandai false positive"
                            >
                              ✗ False+
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center",
                            justifyContent: "space-between", gap: 6 }}>
                            <VStatusChip status={vStatus} />
                            {snap.validated_by && (
                              <span style={{ fontSize: "9.5px", color: "#9CA3AF",
                                overflow: "hidden", textOverflow: "ellipsis",
                                whiteSpace: "nowrap" }}>
                                {snap.validated_by}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Resolve quick-button untuk confirmed card */}
                        {isConf && (
                          <button
                            className="fsg-btn-resolve"
                            onClick={e => {
                              e.stopPropagation();
                              setSelected(snap);
                            }}
                          >
                            Tandai Resolved
                          </button>
                        )}

                      </div>
                    </div>
                  );
                })}
              </div>
            )
          }
        </div>

      </div>

      {/* ── Detail + Validation modal ── */}
      {selected && (
        <SnapshotModal
          snap={selected}
          staffName={staffName}
          onClose={() => setSelected(null)}
          onValidated={handleValidated}
        />
      )}
    </>
  );
}
