import React, { useState, useRef, useCallback } from "react";
import { useSnapshots, useValidateSnapshot } from "../hooks/useQueries";
import { useVirtualizer } from "@tanstack/react-virtual";
import "../styles/FODSnapshotGallery.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

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

/* ── Memoized Snapshot Card ──────────────────────────────────── */
const SnapshotCard = React.memo(function SnapshotCard({ snap, onSelect }) {
  const vStatus  = snap.validation_status ?? "pending";
  const sev      = getSeverity(snap.confidence);
  const sevColor = sev === "high" ? "#DC2626"
                 : sev === "medium" ? "#D97706"
                 : "#059669";
  const isPending = vStatus === "pending";
  const isConf    = vStatus === "confirmed";

  return (
    <div
      className={`fsg-card fsg-card--${vStatus}`}
      onClick={() => onSelect(snap)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onSelect(snap)}
    >
      <div className="fsg-card-img-wrap">
        <ImgWithFallback
          src={`${API_BASE}/snapshots/${snap.image_path}`}
          alt={`FOD #${snap.id}`}
        />
        <span className="fsg-frame-chip">F#{snap.frame_number}</span>
        <SeverityBadge confidence={snap.confidence} />
      </div>
      <div className="fsg-card-body">
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
        {isPending ? (
          <div className="fsg-card-actions" onClick={e => e.stopPropagation()}>
            <button className="fsg-btn-confirm" onClick={() => onSelect(snap)}
              title="Buka modal untuk konfirmasi FOD">✓ Konfirmasi</button>
            <button className="fsg-btn-reject" onClick={() => onSelect(snap)}
              title="Buka modal untuk tandai false positive">✗ False+</button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center",
            justifyContent: "space-between", gap: 6 }}>
            <VStatusChip status={vStatus} />
            {snap.validated_by && (
              <span style={{ fontSize: "9.5px", color: "#9CA3AF",
                overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap" }}>{snap.validated_by}</span>
            )}
          </div>
        )}
        {isConf && (
          <button className="fsg-btn-resolve" onClick={e => {
            e.stopPropagation(); onSelect(snap);
          }}>Tandai Resolved</button>
        )}
      </div>
    </div>
  );
});

/* ── Virtualized Grid ────────────────────────────────────────── */
const CARD_ROW_HEIGHT = 340; // approximate card height in px
const COLS_MIN_WIDTH = 190;  // matches CSS minmax(190px, 1fr)

function VirtualizedGrid({ visibleSnaps, parentRef, setSelected }) {
  const [cols, setCols] = useState(2);
  const measuredRef = useCallback((el) => {
    parentRef.current = el;
    if (el) {
      const w = el.clientWidth;
      setCols(Math.max(1, Math.floor(w / COLS_MIN_WIDTH)));
    }
  }, [parentRef]);

  const rowCount = Math.ceil(visibleSnaps.length / cols);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CARD_ROW_HEIGHT,
    overscan: 2,
  });

  if (visibleSnaps.length === 0) {
    return (
      <div className="fsg-grid-area">
        <div className="fsg-empty" style={{ padding: "28px 20px" }}>
          <p className="fsg-empty-title" style={{ fontSize: 12 }}>
            Tidak ada snapshot di tab ini
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={measuredRef}
      className="fsg-grid-area"
    >
      <div style={{
        height: rowVirtualizer.getTotalSize(),
        width: "100%",
        position: "relative",
      }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const startIdx = virtualRow.index * cols;
          const rowSnaps = visibleSnaps.slice(startIdx, startIdx + cols);
          return (
            <div
              key={virtualRow.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="fsg-grid">
                {rowSnaps.map(snap => (
                  <SnapshotCard key={snap.id} snap={snap} onSelect={setSelected} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DETAIL + VALIDATION MODAL
   ═══════════════════════════════════════════════════════════════ */


function SnapshotModal({ snap, onClose, onValidated }) {
  const sev      = getSeverity(snap.confidence);
  const sevColor = sev === "high" ? "#DC2626" : sev === "medium" ? "#D97706" : "#059669";
  const validateMutation = useValidateSnapshot();
  const submitting = validateMutation.isPending;
  const [validated, setValidated] = useState([
    'confirmed', 'rejected', 'resolved'
  ].includes(snap.validation_status));
  const [showChange, setShowChange] = useState(false);

  async function submit(status) {
    try {
      const updated = await validateMutation.mutateAsync({
        id: snap.id,
        status,
        staffName: 'Operator',
        notes: null,
      });
      onValidated(updated);
      setValidated(true);
      setShowChange(false);
    } catch (e) {
      alert(`Gagal menyimpan validasi: ${e.message}`);
    }
  }

  return (
    <div className="fsg-modal-overlay" onClick={onClose}>
      <div className="fsg-modal" style={{maxWidth: 380}} onClick={e => e.stopPropagation()}>
        <div className="fsg-modal-img-wrap">
          <img className="fsg-modal-img"
            src={`${API_BASE}/snapshots/${snap.image_path}`}
            alt={`FOD #${snap.id}`}
            onError={e => { e.target.style.display = "none"; }}
          />
          <SeverityBadge confidence={snap.confidence} />
          <button className="fsg-modal-close" onClick={onClose} aria-label="Tutup" style={{background:'rgba(0,0,0,0.45)',border:'none',boxShadow:'none',padding:0,borderRadius:'6px',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5L5 15" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className="fsg-modal-body">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <h4 className="fsg-modal-title">
              FOD Snapshot #{snap.id} — Frame {snap.frame_number}
            </h4>
          </div>
          <div className="fsg-modal-conf-row">
            <div className="fsg-modal-conf-top">
              <span className="fsg-modal-conf-label">Confidence Score</span>
              <span className="fsg-modal-conf-val" style={{ color: sevColor }}>
                {fmtConf(snap.confidence)}
              </span>
            </div>
            <ConfBar confidence={snap.confidence} trackClass="fsg-modal-conf-track" fillClass="fsg-conf-fill" />
          </div>
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

          {validated ? (
            <div style={{marginTop:18, marginBottom:2, textAlign:'center'}}>
              {(() => {
                let statusText = '';
                let statusColor = '#059669';
                if (snap.validation_status === 'confirmed') {
                  statusText = 'Terkonfirmasi';
                  statusColor = '#059669'; // hijau
                } else if (snap.validation_status === 'resolved') {
                  statusText = 'Resolved';
                  statusColor = '#2563eb'; // biru
                } else if (snap.validation_status === 'rejected') {
                  statusText = 'False Positive';
                  statusColor = '#DC2626'; // merah
                } else {
                  statusText = snap.validation_status;
                  statusColor = '#374151';
                }
                return (
                  <span style={{fontSize:13, color:statusColor, fontWeight:600}}>
                    Status: {statusText}
                  </span>
                );
              })()}
              {snap.validation_status === 'confirmed' && (
                <div style={{marginTop:10}}>
                  <button
                    className="fsg-btn-resolve"
                    style={{width:'auto',padding:'6px 16px',fontSize:12,marginBottom:4}}
                    disabled={submitting}
                    onClick={() => submit('resolved')}
                  >
                    {submitting ? <><span className="fsg-spinner" /> Menyimpan...</> : <>Tandai Resolved</>}
                  </button>
                </div>
              )}
              <br/>
              <button style={{marginTop:8, fontSize:12, color:'#2563eb', background:'none', border:'none', cursor:'pointer', textDecoration:'underline'}}
                onClick={()=>setShowChange(true)}>
                Ubah Status
              </button>
            </div>
          ) : (
            <div className="fsg-card-actions" style={{marginTop:18, marginBottom:2}}>
              <button
                className="fsg-btn-confirm"
                disabled={submitting || validated}
                onClick={() => submit("confirmed")}
              >
                {submitting ? <><span className="fsg-spinner" /> Menyimpan...</> : <>✓ Konfirmasi FOD</>}
              </button>
              <button
                className="fsg-btn-reject"
                disabled={submitting || validated}
                onClick={() => submit("rejected")}
              >
                {submitting ? <><span className="fsg-spinner" /> Menyimpan...</> : <>✗ False Positive</>}
              </button>
            </div>
          )}

          {/* Ubah status jika sudah validasi dan klik "Ubah Status" */}
          {showChange && (
            <div className="fsg-card-actions" style={{marginTop:8, marginBottom:2}}>
              <button
                className="fsg-btn-confirm"
                disabled={submitting}
                onClick={() => submit("confirmed")}
              >
                {submitting ? <><span className="fsg-spinner" /> Menyimpan...</> : <>✓ Konfirmasi FOD</>}
              </button>
              <button
                className="fsg-btn-reject"
                disabled={submitting}
                onClick={() => submit("rejected")}
              >
                {submitting ? <><span className="fsg-spinner" /> Menyimpan...</> : <>✗ False Positive</>}
              </button>
              <button style={{marginLeft:8, fontSize:12, color:'#6b7280', background:'none', border:'none', cursor:'pointer'}}
                onClick={()=>setShowChange(false)}>
                Batal
              </button>
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
  const { data: snapshots = [], isLoading: loading, error: queryError } = useSnapshots(videoId, enabled);
  const error = queryError?.message ?? null;
  const [selected,  setSelected]    = useState(null);
  const [activeTab, setActiveTab]   = useState("all");
  const gridParentRef = useRef(null);
  // Nama staff yang diingat selama sesi (sessionStorage)
  const [staffName, setStaffName]   = useState(
    () => sessionStorage.getItem("fsg_staff_name") ?? ""
  );

  /* ── Persist staffName ke sessionStorage ── */
  function handleStaffName(val) {
    setStaffName(val);
    sessionStorage.setItem("fsg_staff_name", val);
  }

  /* ── Update single snapshot setelah validasi ── */
  function handleValidated(updated) {
    // TanStack Query auto-invalidates via useValidateSnapshot's onSuccess,
    // but we also sync the selected modal immediately for responsiveness
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

        {/* ── Virtualized Grid area ── */}
        <VirtualizedGrid
          visibleSnaps={visibleSnaps}
          parentRef={gridParentRef}
          setSelected={setSelected}
        />

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
