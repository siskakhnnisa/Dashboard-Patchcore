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
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
}

function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("id-ID", {
    day: "2-digit", month: "short", year: "numeric"
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

/* ── Severity Badge ──────────────────────────────────────────── */
function SeverityBadge({ confidence }) {
  const s = getSeverity(confidence);
  const label = s.charAt(0).toUpperCase() + s.slice(1);
  return (
    <span className={`fsg-severity fsg-severity--${s}`}>{label}</span>
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
    <img
      className="fsg-card-img"
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
    />
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

/* ── Detail Modal ────────────────────────────────────────────── */
function SnapshotModal({ snap, onClose }) {
  if (!snap) return null;
  const sev = getSeverity(snap.confidence);
  const sevColor = sev === "high" ? "#DC2626" : sev === "medium" ? "#D97706" : "#059669";

  return (
    <div className="fsg-modal-overlay" onClick={onClose}>
      <div className="fsg-modal" onClick={e => e.stopPropagation()}>

        {/* Image */}
        <div className="fsg-modal-img-wrap">
          <img
            className="fsg-modal-img"
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

        {/* Body */}
        <div className="fsg-modal-body">
          <h4 className="fsg-modal-title">
            FOD Snapshot #{snap.id} — Frame {snap.frame_number}
          </h4>

          {/* Confidence bar */}
          <div className="fsg-modal-conf-row">
            <div className="fsg-modal-conf-top">
              <span className="fsg-modal-conf-label">Confidence Score</span>
              <span className="fsg-modal-conf-val" style={{ color: sevColor }}>
                {fmtConf(snap.confidence)}
              </span>
            </div>
            <ConfBar
              confidence={snap.confidence}
              trackClass="fsg-modal-conf-track"
              fillClass="fsg-conf-fill"
            />
          </div>

          {/* Detail grid */}
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
        </div>

      </div>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────── */
export default function FODSnapshotGallery({ enabled, videoId }) {
  const [snapshots, setSnapshots] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [selected,  setSelected]  = useState(null);
  const intervalRef = useRef(null);

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

  /* ── Derived stats ── */
  const total   = snapshots.length;
  const maxConf = total ? Math.max(...snapshots.map(s => s.confidence ?? 0)) : null;
  const avgConf = total
    ? snapshots.reduce((a, s) => a + (s.confidence ?? 0), 0) / total
    : null;
  const latest = total ? snapshots[0] : null;

  /* ── State: idle (belum ada sesi) ── */
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

  /* ── State: skeleton loading awal ── */
  if (loading && !snapshots.length) {
    return (
      <div className="fsg-widget">
        <SkeletonCards count={4} />
      </div>
    );
  }

  /* ── State: error ── */
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

  /* ── State: pipeline aktif tapi belum ada deteksi ── */
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
          {enabled ? (
            <span className="fsg-live-badge">
              <span className="fsg-live-dot" />
              Live
            </span>
          ) : (
            <span className="fsg-count-badge" style={{ color: "#6B7280" }}>
              Sesi Selesai
            </span>
          )}
        </div>

        {/* ── Summary strip ── */}
        <div className="fsg-summary">
          <div className="fsg-summary-item">
            <span className="fsg-summary-val">{total}</span>
            <span className="fsg-summary-lbl">Total Snapshot</span>
          </div>
          <div className="fsg-summary-div" />
          <div className="fsg-summary-item">
            <span
              className="fsg-summary-val"
              style={{
                color: maxConf != null
                  ? (maxConf >= 0.70 ? "#DC2626" : maxConf >= 0.40 ? "#D97706" : "#059669")
                  : "#374151"
              }}
            >
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
            <span className="fsg-summary-val">{fmtTime(latest?.timestamp)}</span>
            <span className="fsg-summary-lbl">Deteksi Terakhir</span>
          </div>
        </div>

        {/* ── Grid area ── */}
        <div className="fsg-grid-area">
          <div className="fsg-grid">
            {snapshots.map(snap => {
              const sev      = getSeverity(snap.confidence);
              const sevColor = sev === "high" ? "#DC2626"
                             : sev === "medium" ? "#D97706"
                             : "#059669";
              return (
                <div
                  key={snap.id}
                  className="fsg-card"
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

                    {/* Confidence bar */}
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
                        <span className="fsg-meta-label">Posisi (x,y)</span>
                        <span className="fsg-meta-value">
                          {snap.bbox ? `${snap.bbox.x}, ${snap.bbox.y}` : "—"}
                        </span>
                      </div>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* ── Detail modal ── */}
      {selected && (
        <SnapshotModal snap={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
