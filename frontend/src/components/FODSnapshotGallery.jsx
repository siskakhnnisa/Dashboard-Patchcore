import React, { useState, useRef, useCallback } from "react";
import { useSnapshots, useValidateSnapshot, useDeleteSnapshot } from "../hooks/useQueries";
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

/* ── Confidence Bar ──────────────────────────────────────────── */
function ConfBar({ confidence, trackClass, fillClass }) {
  const pct = confidence != null ? Math.round(confidence * 100) : 0;
  const sev = getSeverity(confidence);
  const fillColor = sev === "high" ? "#DC2626" : sev === "medium" ? "#D97706" : "#059669";
  return (
    <div className={trackClass} style={{ background: "#E5E7EB", borderRadius: 4, height: 4, width: "100%", marginTop: 4 }}>
      <div
        className={fillClass}
        style={{ width: `${pct}%`, background: fillColor, height: "100%", borderRadius: 4, transition: "width 0.3s" }}
      />
    </div>
  );
}

/* ── Validation Status Chip ──────────────────────────────────── */
function VStatusChip({ status }) {
  const label = V_STATUS_LABEL[status] ?? status;
  const colors = {
    pending:   { bg: "#FEF3C7", color: "#D97706" },
    confirmed: { bg: "#D1FAE5", color: "#059669" },
    rejected:  { bg: "#FEE2E2", color: "#DC2626" },
    resolved:  { bg: "#DBEAFE", color: "#2563EB" },
  };
  const { bg, color } = colors[status] ?? { bg: "#F3F4F6", color: "#6B7280" };
  return (
    <span style={{
      fontSize: "10.5px", fontWeight: 600, padding: "2px 8px",
      borderRadius: 99, background: bg, color,
    }}>
      {label}
    </span>
  );
}

/* ── Severity Badge ──────────────────────────────────────────── */
function SeverityBadge({ confidence }) {
  const sev = getSeverity(confidence);
  const sevColor = sev === "high" ? "#DC2626" : sev === "medium" ? "#D97706" : "#059669";
  const label = sev === "high" ? "High" : sev === "medium" ? "Med" : "Low";
  return (
    <span style={{
      position: "absolute", bottom: 6, left: 6, zIndex: 2,
      fontSize: "10px", fontWeight: 700, padding: "2px 6px",
      borderRadius: 99, background: sevColor, color: "#fff",
      letterSpacing: "0.03em",
    }}>
      {label}
    </span>
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

/* ── Delete Button ───────────────────────────────────────────── */
// Full inline style — tidak bergantung pada class CSS apapun.
// Tidak ada guard isAdmin — tombol selalu tampil untuk semua user.
function DeleteButton({ showConfirm, onClick, disabled }) {
  return (
    <button
      title={showConfirm ? "Klik sekali lagi untuk konfirmasi hapus" : "Hapus snapshot"}
      onClick={onClick}
      disabled={disabled}
      style={{
        background:     showConfirm ? "#dc2626" : "#ffffff",
        color:          showConfirm ? "#ffffff" : "#dc2626",
        border:         "1px solid #dc2626",
        borderRadius:   4,
        padding:        "4px 8px",
        fontSize:       13,
        cursor:         disabled ? "not-allowed" : "pointer",
        transition:     "all 0.15s",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        gap:            4,
        flexShrink:     0,
        opacity:        disabled ? 0.6 : 1,
        // Pastikan tombol selalu terlihat, tidak dipotong overflow parent
        position:       "relative",
        zIndex:         5,
      }}
    >
      {showConfirm ? (
        <span style={{ fontWeight: 600, whiteSpace: "nowrap", fontSize: 11 }}>Yakin?</span>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
          <line x1="10" y1="11" x2="10" y2="17"/>
          <line x1="14" y1="11" x2="14" y2="17"/>
        </svg>
      )}
    </button>
  );
}

/* ── Memoized Snapshot Card ──────────────────────────────────── */
// Tidak ada isAdmin — tombol delete selalu tampil untuk semua user.
// Delete diangkat ke modal untuk menghindari masalah overflow:hidden pada card.
const SnapshotCard = React.memo(function SnapshotCard({ snap, onSelect }) {
  const vStatus   = snap.validation_status ?? "pending";
  const sev       = getSeverity(snap.confidence);
  const sevColor  = sev === "high" ? "#DC2626"
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
      {/* ── Thumbnail ── */}
      <div className="fsg-card-img-wrap">
        <ImgWithFallback
          src={`${API_BASE}/snapshots/${snap.image_path}`}
          alt={`FOD #${snap.id}`}
        />
        <span className="fsg-frame-chip">F#{snap.frame_number}</span>
        <SeverityBadge confidence={snap.confidence} />
      </div>

      {/* ── Body ── */}
      <div className="fsg-card-body">

        {/* Confidence row */}
        <div className="fsg-conf-row">
          <div className="fsg-conf-top">
            <span className="fsg-conf-label">Confidence</span>
            <span className="fsg-conf-val" style={{ color: sevColor }}>
              {fmtConf(snap.confidence)}
            </span>
          </div>
          <ConfBar
            confidence={snap.confidence}
            trackClass="fsg-conf-track"
            fillClass="fsg-conf-fill"
          />
        </div>

        <div className="fsg-card-divider" />

        {/* Timestamp */}
        <div className="fsg-meta">
          <div className="fsg-meta-item">
            <span className="fsg-meta-label">Waktu</span>
            <span className="fsg-meta-value">{fmtTime(snap.timestamp)}</span>
          </div>
        </div>

        <div className="fsg-card-divider" />

        {/* Action row — klik buka modal; tombol hapus ada di dalam modal */}
        <div
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}
          onClick={e => e.stopPropagation()}
        >
          {isPending ? (
            <div className="fsg-card-actions">
              <button
                className="fsg-btn-confirm"
                onClick={() => onSelect(snap)}
                title="Buka modal untuk konfirmasi FOD"
              >
                ✓ Konfirmasi
              </button>
              <button
                className="fsg-btn-reject"
                onClick={() => onSelect(snap)}
                title="Buka modal untuk tandai false positive"
              >
                ✗ False+
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
              <VStatusChip status={vStatus} />
              {snap.validated_by && (
                <span style={{
                  fontSize: "9.5px", color: "#9CA3AF",
                  overflow: "hidden", textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {snap.validated_by}
                </span>
              )}
            </div>
          )}

          {/*
            Tombol hapus di card DIHAPUS dari sini dan dipindah ke modal.
            Alasan: .fsg-card memiliki overflow:hidden yang memotong elemen
            dengan positioning, dan virtualizer menyebabkan state showConfirm
            reset saat re-render. Tombol hapus tetap tersedia di dalam modal.
          */}
          <button
            style={{
              background: "none",
              border: "1px solid #E5E7EB",
              borderRadius: 4,
              padding: "3px 7px",
              fontSize: 11,
              color: "#9CA3AF",
              cursor: "pointer",
              flexShrink: 0,
            }}
            onClick={() => onSelect(snap)}
            title="Buka detail untuk hapus"
          >
            ···
          </button>
        </div>

        {/* Resolve button — hanya untuk snapshot confirmed */}
        {isConf && (
          <button
            className="fsg-btn-resolve"
            style={{ marginTop: 6 }}
            onClick={e => { e.stopPropagation(); onSelect(snap); }}
          >
            Tandai Resolved
          </button>
        )}

      </div>
    </div>
  );
});

/* ── Virtualized Grid ────────────────────────────────────────── */
const CARD_ROW_HEIGHT = 340;
const COLS_MIN_WIDTH  = 190;

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
    <div ref={measuredRef} className="fsg-grid-area">
      <div style={{ height: rowVirtualizer.getTotalSize(), width: "100%", position: "relative" }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const startIdx = virtualRow.index * cols;
          const rowSnaps = visibleSnaps.slice(startIdx, startIdx + cols);
          return (
            <div
              key={virtualRow.key}
              style={{
                position: "absolute", top: 0, left: 0, width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="fsg-grid">
                {rowSnaps.map(snap => (
                  <SnapshotCard
                    key={snap.id}
                    snap={snap}
                    onSelect={setSelected}
                  />
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
   ─────────────────────────────────────────────────────────────
   PERBAIKAN UTAMA:
   1. Modal sekarang dibungkus dengan overlay (.fsg-modal-overlay)
      dan container (.fsg-modal) agar muncul sebagai dialog yang
      benar dengan fixed positioning di atas konten lainnya.
   2. Tombol hapus (DeleteButton) selalu tampil — tidak ada guard
      isAdmin.
   3. staffName diterima sebagai prop dan digunakan di submit().
   ═══════════════════════════════════════════════════════════════ */
function SnapshotModal({ snap, onClose, onValidated, staffName }) {
  const validateMutation = useValidateSnapshot();
  const deleteMutation   = useDeleteSnapshot();
  const submitting  = validateMutation.isPending;
  const [validated, setValidated] = useState(
    ['confirmed', 'rejected', 'resolved'].includes(snap.validation_status)
  );
  const [showChange,  setShowChange]  = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Tutup modal saat klik overlay (bukan konten modal)
  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleDelete(e) {
    e.stopPropagation();
    if (!showConfirm) {
      setShowConfirm(true);
      return;
    }
    deleteMutation.mutate(snap.id, {
      onSuccess: () => {
        setShowConfirm(false);
        onClose();
      },
    });
  }

  async function submit(status) {
    try {
      const updated = await validateMutation.mutateAsync({
        id: snap.id,
        status,
        staffName: staffName || 'Operator',
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
    /* ── Overlay: klik di luar modal untuk tutup ── */
    <div
      className="fsg-modal-overlay"
      onClick={handleOverlayClick}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 20, 30, 0.72)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 24,
      }}
    >
      {/* ── Modal container ── */}
      <div
        className="fsg-modal"
        onClick={e => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 14,
          overflow: "hidden",
          maxWidth: 520,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 24px 64px rgba(0,0,0,0.22)",
        }}
      >
        {/* Tombol tutup (X) di sudut kiri atas gambar */}
        <div style={{ position: "relative" }}>
          <button
            onClick={onClose}
            aria-label="Tutup"
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              zIndex: 10,
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.45)",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              backdropFilter: "blur(4px)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>

          {/* Gambar snapshot */}
          <div className="fsg-modal-img-wrap">
            <img
              className="fsg-modal-img"
              src={`${API_BASE}/snapshots/${snap.image_path}`}
              alt={`FOD #${snap.id}`}
              onError={e => { e.target.style.display = "none"; }}
            />
          </div>
        </div>

        {/* ── Isi modal ── */}
        <div className="fsg-modal-body">

          {/* Header: judul + tombol hapus */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <h4 className="fsg-modal-title">
              FOD Snapshot #{snap.id} — Frame {snap.frame_number}
            </h4>

            {/*
              TOMBOL HAPUS — selalu tampil, tidak ada guard isAdmin.
              Diletakkan di dalam modal (bukan card) agar:
              - Tidak dipotong overflow:hidden
              - State showConfirm tidak di-reset oleh virtualizer
            */}
            <DeleteButton
              showConfirm={showConfirm}
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            />
          </div>

          {/* Detail rows */}
          {[
            ["Waktu Deteksi", fmtTime(snap.timestamp)],
            ["Tanggal",       fmtDate(snap.timestamp)],
            ["Label",         snap.label ?? "FOD"],
            ["Frame #",       snap.frame_number],
            ["Ukuran BBox",   bboxSize(snap.bbox)],
            ["Posisi (x, y)", snap.bbox ? `${snap.bbox.x}, ${snap.bbox.y}` : "—"],
            ...(snap.video_id ? [["Video", snap.video_id.split(/[\\/]/).pop()]] : []),
            ...(snap.validated_by ? [["Divalidasi oleh", snap.validated_by]] : []),
            ...(snap.validation_notes ? [["Catatan", snap.validation_notes]] : []),
          ].map(([label, value]) => (
            <div key={label} className="fsg-modal-detail-item">
              <span className="fsg-modal-detail-label">{label}</span>
              <span className="fsg-modal-detail-value">{value}</span>
            </div>
          ))}

          {/* Validation actions */}
          {validated && !showChange ? (
            <div style={{ marginTop: 18, marginBottom: 2, textAlign: "center" }}>
              {(() => {
                const map = {
                  confirmed: { text: "Terkonfirmasi", color: "#059669" },
                  resolved:  { text: "Resolved",      color: "#2563EB" },
                  rejected:  { text: "False Positive", color: "#DC2626" },
                };
                const { text, color } = map[snap.validation_status]
                  ?? { text: snap.validation_status, color: "#374151" };
                return (
                  <span style={{ fontSize: 13, color, fontWeight: 600 }}>
                    Status: {text}
                  </span>
                );
              })()}
              {snap.validation_status === "confirmed" && (
                <div style={{ marginTop: 10 }}>
                  <button
                    className="fsg-btn-resolve"
                    style={{ width: "auto", padding: "6px 16px", fontSize: 12, marginBottom: 4 }}
                    disabled={submitting}
                    onClick={() => submit("resolved")}
                  >
                    {submitting
                      ? <><span className="fsg-spinner" /> Menyimpan...</>
                      : "Tandai Resolved"
                    }
                  </button>
                </div>
              )}
              <br />
              <button
                style={{
                  marginTop: 8, fontSize: 12, color: "#2563eb", background: "none",
                  border: "none", cursor: "pointer", textDecoration: "underline",
                }}
                onClick={() => setShowChange(true)}
              >
                Ubah Status
              </button>
            </div>
          ) : (
            <div className="fsg-card-actions" style={{ marginTop: 18, marginBottom: 2 }}>
              <button
                className="fsg-btn-confirm"
                disabled={submitting}
                onClick={() => submit("confirmed")}
              >
                {submitting
                  ? <><span className="fsg-spinner" /> Menyimpan...</>
                  : "✓ Konfirmasi FOD"
                }
              </button>
              <button
                className="fsg-btn-reject"
                disabled={submitting}
                onClick={() => submit("rejected")}
              >
                {submitting
                  ? <><span className="fsg-spinner" /> Menyimpan...</>
                  : "✗ False Positive"
                }
              </button>
              {showChange && (
                <button
                  style={{
                    marginLeft: 8, fontSize: 12, color: "#6b7280", background: "none",
                    border: "none", cursor: "pointer",
                  }}
                  onClick={() => setShowChange(false)}
                >
                  Batal
                </button>
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
  { key: "all",       label: "Semua"          },
  { key: "pending",   label: "Pending"        },
  { key: "confirmed", label: "Confirmed"      },
  { key: "rejected",  label: "False Positive" },
  { key: "resolved",  label: "Resolved"       },
];

/*
 * FODSnapshotGallery
 *
 * Props:
 *   enabled   {boolean}       – apakah pipeline sedang berjalan (live badge)
 *   videoId   {string|null}   – jika diisi, galeri HANYA menampilkan snapshot
 *                               dari video tersebut (mode LiveMonitorPage).
 *                               Jika null, galeri menampilkan semua snapshot
 *                               (mode halaman FOD Snapshot penuh).
 *
 * Tidak ada prop isAdmin — tidak diperlukan selama belum ada auth.
 */
export default function FODSnapshotGallery({ enabled, videoId }) {
  /*
   * useSnapshots(videoId, enabled):
   *   - Jika videoId diisi → backend memfilter by video_id
   *   - Jika videoId null  → backend mengembalikan semua snapshot
   * Filtering sudah terjadi di sisi query/backend, bukan client-side.
   */
  const { data: snapshots = [], isLoading: loading, error: queryError } =
    useSnapshots(videoId, enabled);
  const error = queryError?.message ?? null;
  const [selected,  setSelected]  = useState(null);
  const [activeTab, setActiveTab] = useState("all");
  const gridParentRef = useRef(null);

  const [staffName, setStaffName] = useState(
    () => sessionStorage.getItem("fsg_staff_name") ?? ""
  );

  function handleStaffName(val) {
    setStaffName(val);
    sessionStorage.setItem("fsg_staff_name", val);
  }

  function handleValidated(updated) {
    setSelected(prev => prev?.id === updated.id ? updated : prev);
  }

  /* ── Derived stats ── */
  const total   = snapshots.length;
  const maxConf = total ? Math.max(...snapshots.map(s => s.confidence ?? 0)) : null;
  const avgConf = total
    ? snapshots.reduce((a, s) => a + (s.confidence ?? 0), 0) / total
    : null;

  const counts = {
    all:       total,
    pending:   snapshots.filter(s => (s.validation_status ?? "pending") === "pending").length,
    confirmed: snapshots.filter(s => s.validation_status === "confirmed").length,
    rejected:  snapshots.filter(s => s.validation_status === "rejected").length,
    resolved:  snapshots.filter(s => s.validation_status === "resolved").length,
  };

  const visibleSnaps = activeTab === "all"
    ? snapshots
    : snapshots.filter(s =>
        activeTab === "pending"
          ? (s.validation_status ?? "pending") === "pending"
          : s.validation_status === activeTab
      );

  /*
   * ── Empty state ──
   *
   * Dua kondisi berbeda:
   *
   * A) videoId ada tapi snapshot kosong → pipeline aktif tapi belum ada
   *    deteksi untuk video ini. Tampilkan pesan "menunggu deteksi".
   *
   * B) videoId tidak ada → galeri belum tahu harus menampilkan video mana
   *    (pipeline belum pernah dijalankan). Tampilkan pesan "belum ada sesi".
   *
   * Kondisi ini TIDAK pernah jatuh ke render utama dengan snapshots kosong,
   * sehingga tidak ada risiko menampilkan snapshot dari video lain.
   */
  if (!loading && !error && snapshots.length === 0) {
    const isWaitingForDetection = Boolean(videoId);
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
          {isWaitingForDetection ? (
            <>
              <p className="fsg-empty-title">Menunggu Deteksi FOD</p>
              <p className="fsg-empty-sub">
                Pipeline aktif — snapshot akan muncul di sini secara otomatis
                saat objek asing terdeteksi pada video ini.
              </p>
            </>
          ) : (
            <>
              <p className="fsg-empty-title">Belum Ada Sesi Aktif</p>
              <p className="fsg-empty-sub">
                Galeri snapshot FOD akan muncul setelah pipeline deteksi berjalan
                dan objek asing terdeteksi pada runway.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ── Loading state ── */
  if (loading && !snapshots.length) {
    return <div className="fsg-widget"><SkeletonCards count={4} /></div>;
  }

  /* ── Error state ── */
  if (error) {
    return (
      <div className="fsg-widget">
        <div className="fsg-error">
          <p style={{ color: "#DC2626", fontSize: 13 }}>
            Gagal memuat data: {error}
          </p>
        </div>
      </div>
    );
  }

  /* ── Main render ── */
  return (
    <>
      <div className="fsg-widget">
        {/* ── Header ── */}
        <div className="fsg-header">
          <div className="fsg-header-left">
            <span className="fsg-title">FOD Snapshots</span>
            <span className="fsg-count-badge">{total} objek</span>
            {/* Label nama video — hanya tampil jika galeri difilter per video */}
            {videoId && (
              <span
                title={videoId}
                style={{
                  fontSize: "10.5px",
                  fontWeight: 500,
                  color: "#6B7280",
                  background: "#F1F5F9",
                  border: "1px solid #E2E8F0",
                  borderRadius: 999,
                  padding: "2px 8px",
                  maxWidth: 200,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontFamily: "monospace",
                }}
              >
                {videoId.split(/[\\/]/).pop()}
              </span>
            )}
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
            background: "#F9FAFB", border: "1px solid #E5E7EB",
            borderRadius: 8, padding: "3px 8px",
          }}>
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
              style={{
                border: "none", background: "transparent", outline: "none",
                fontSize: "11.5px", color: "#374151", width: 130,
                fontFamily: "inherit",
              }}
            />
          </div>

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

        {/* ── Virtualized Grid ── */}
        <VirtualizedGrid
          visibleSnaps={visibleSnaps}
          parentRef={gridParentRef}
          setSelected={setSelected}
        />
      </div>

      {/* ── Detail + Validation + Delete modal ── */}
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