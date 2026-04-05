import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Map as MapIcon,
  Route,
  Navigation,
  Target,
  Layers,
  Camera,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useAllSnapshots } from "../hooks/useQueries";
import "../styles/FodMappingPage.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";
const FRAME_WIDTH = 1280;
const FRAME_HEIGHT = 720;
const CLUSTER_DISTANCE = 0.055;

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

function fmtPct(v) {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function dominantStatus(items) {
  const score = { confirmed: 4, pending: 3, resolved: 2, rejected: 1 };
  return items
    .map((item) => item.validation_status ?? "pending")
    .sort((a, b) => (score[b] ?? 0) - (score[a] ?? 0))[0] ?? "pending";
}

function getSnapshotPoint(snapshot) {
  const bbox = snapshot?.bbox ?? {};
  const width = Number(bbox.width ?? bbox.w ?? 0);
  const height = Number(bbox.height ?? bbox.h ?? 0);
  const x = Number(bbox.x ?? 0) + width / 2;
  const y = Number(bbox.y ?? 0) + height / 2;
  return {
    xNorm: Math.min(Math.max(x / FRAME_WIDTH, 0), 1),
    yNorm: Math.min(Math.max(y / FRAME_HEIGHT, 0), 1),
  };
}

function runwayCoordsFromNorm(xNorm, yNorm) {
  const y = 6 + yNorm * 88;
  const runwayWidth = 34 + yNorm * 24;
  const x = 50 + (xNorm - 0.5) * runwayWidth;
  return { x, y };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function buildSessions(snapshots) {
  const grouped = new Map();

  snapshots.forEach((snapshot) => {
    if (!snapshot.video_id) return;
    const existing = grouped.get(snapshot.video_id) ?? {
      videoId: snapshot.video_id,
      count: 0,
      latestAt: snapshot.created_at ?? snapshot.timestamp,
      confirmed: 0,
      pending: 0,
      rejected: 0,
      resolved: 0,
    };

    existing.count += 1;
    const ts = snapshot.created_at ?? snapshot.timestamp;
    if (ts && (!existing.latestAt || new Date(ts) > new Date(existing.latestAt))) {
      existing.latestAt = ts;
    }

    const status = snapshot.validation_status ?? "pending";
    if (status in existing) existing[status] += 1;
    grouped.set(snapshot.video_id, existing);
  });

  return Array.from(grouped.values())
    .sort((a, b) => new Date(b.latestAt) - new Date(a.latestAt))
    .map((session) => ({
      ...session,
      shortId: session.videoId.length > 20 ? `${session.videoId.slice(0, 20)}...` : session.videoId,
    }));
}

function buildClusters(sessionSnapshots) {
  const clusters = [];

  const orderedSnapshots = [...sessionSnapshots].sort((a, b) => {
    const aTs = new Date(a.created_at ?? a.timestamp ?? 0).getTime();
    const bTs = new Date(b.created_at ?? b.timestamp ?? 0).getTime();
    if (aTs !== bTs) return aTs - bTs;
    return Number(a.id ?? 0) - Number(b.id ?? 0);
  });

  orderedSnapshots.forEach((snapshot) => {
    const confidence = Number(snapshot.confidence ?? 0.5);
    const point = getSnapshotPoint(snapshot);
    const mapPoint = runwayCoordsFromNorm(point.xNorm, point.yNorm);

    let bestCluster = null;
    let bestDistance = Infinity;

    clusters.forEach((cluster) => {
      const d = Math.hypot(cluster.xNorm - point.xNorm, cluster.yNorm - point.yNorm);
      if (d < CLUSTER_DISTANCE && d < bestDistance) {
        bestCluster = cluster;
        bestDistance = d;
      }
    });

    if (!bestCluster) {
      clusters.push({
        items: [snapshot],
        weight: confidence,
        xNorm: point.xNorm,
        yNorm: point.yNorm,
        mapX: mapPoint.x,
        mapY: mapPoint.y,
        representative: snapshot,
        maxConfidence: confidence,
      });
      return;
    }

    const nextWeight = bestCluster.weight + confidence;
    bestCluster.items.push(snapshot);
    bestCluster.xNorm = (bestCluster.xNorm * bestCluster.weight + point.xNorm * confidence) / nextWeight;
    bestCluster.yNorm = (bestCluster.yNorm * bestCluster.weight + point.yNorm * confidence) / nextWeight;
    bestCluster.weight = nextWeight;

    const nextMap = runwayCoordsFromNorm(bestCluster.xNorm, bestCluster.yNorm);
    bestCluster.mapX = nextMap.x;
    bestCluster.mapY = nextMap.y;

    if (confidence >= bestCluster.maxConfidence) {
      bestCluster.maxConfidence = confidence;
      bestCluster.representative = snapshot;
    }
  });

  return clusters
    .map((cluster) => {
      const status = dominantStatus(cluster.items);
      const avgConfidence = cluster.items.reduce((sum, item) => sum + Number(item.confidence ?? 0), 0) / cluster.items.length;
      const routeEligible = status !== "rejected";
      const lateralOffset = (cluster.xNorm - 0.5) * 100;
      const longitudinal = cluster.yNorm * 100;
      const anchorId = Math.min(...cluster.items.map((item) => Number(item.id ?? 0)).filter((id) => Number.isFinite(id) && id > 0));

      return {
        id: Number.isFinite(anchorId) ? `cluster-${anchorId}` : `cluster-${cluster.xNorm.toFixed(4)}-${cluster.yNorm.toFixed(4)}`,
        status,
        routeEligible,
        mapX: cluster.mapX,
        mapY: cluster.mapY,
        xNorm: cluster.xNorm,
        yNorm: cluster.yNorm,
        avgConfidence,
        maxConfidence: cluster.maxConfidence,
        detections: cluster.items.length,
        firstSeen: cluster.items[0]?.created_at ?? cluster.items[0]?.timestamp,
        lastSeen: cluster.items[cluster.items.length - 1]?.created_at ?? cluster.items[cluster.items.length - 1]?.timestamp,
        longitudinal,
        lateralOffset,
        representative: cluster.representative,
        snapshots: cluster.items,
      };
    })
    .sort((a, b) => (a.mapY - b.mapY) || (a.mapX - b.mapX))
    .map((cluster, index) => ({
      ...cluster,
      label: `FOD-${String(index + 1).padStart(2, "0")}`,
    }));
}

function buildGreedyRoute(points, start) {
  const remaining = [...points];
  const route = [];
  let current = start;
  let totalDistance = 0;

  while (remaining.length) {
    let bestIndex = 0;
    let bestDistance = Infinity;

    remaining.forEach((point, index) => {
      const d = distance(current, point);
      if (d < bestDistance) {
        bestDistance = d;
        bestIndex = index;
      }
    });

    const next = remaining.splice(bestIndex, 1)[0];
    totalDistance += bestDistance;
    route.push(next);
    current = next;
  }

  return { route, totalDistance };
}

function buildBestRoute(points, confirmedOnly) {
  const routePoints = points.filter((point) => {
    if (!point.routeEligible) return false;
    if (!confirmedOnly) return true;
    return point.status === "confirmed";
  });
  if (!routePoints.length) {
    return { startLabel: "—", totalDistance: 0, orderedPoints: [] };
  }

  const fromNorth = buildGreedyRoute(routePoints, { x: 50, y: 2 });
  const fromSouth = buildGreedyRoute(routePoints, { x: 50, y: 98 });

  const picked = fromNorth.totalDistance <= fromSouth.totalDistance
    ? { startLabel: "Threshold Utara", ...fromNorth }
    : { startLabel: "Threshold Selatan", ...fromSouth };

  return {
    startLabel: picked.startLabel,
    totalDistance: picked.totalDistance,
    orderedPoints: picked.route.map((point, index) => ({ ...point, order: index + 1 })),
  };
}

function statusMeta(status) {
  if (status === "confirmed") return { label: "Confirmed", color: "#059669", bg: "#ECFDF5" };
  if (status === "rejected") return { label: "Rejected", color: "#DC2626", bg: "#FEF2F2" };
  if (status === "resolved") return { label: "Resolved", color: "#2563EB", bg: "#EFF6FF" };
  return { label: "Pending", color: "#D97706", bg: "#FFFBEB" };
}

function StatCard({ icon: Icon, label, value, sub, tint }) {
  return (
    <div className="fodmap-stat-card">
      <div className="fodmap-stat-icon" style={{ background: tint.bg, color: tint.color }}>
        <Icon size={18} />
      </div>
      <div>
        <div className="fodmap-stat-label">{label}</div>
        <div className="fodmap-stat-value">{value}</div>
        {sub ? <div className="fodmap-stat-sub">{sub}</div> : null}
      </div>
    </div>
  );
}

export default function FodMappingPage() {
  const [searchParams] = useSearchParams();
  const requestedVideoId = searchParams.get("videoId");
  const { data: snapshots = [], isLoading } = useAllSnapshots(null, { refetchInterval: false });
  const sessions = useMemo(() => buildSessions(snapshots), [snapshots]);

  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [selectedPointId, setSelectedPointId] = useState(null);
  const [confirmedOnlyRoute, setConfirmedOnlyRoute] = useState(true);

  useEffect(() => {
    if (!sessions.length) return;
    const hasRequested = requestedVideoId && sessions.some((session) => session.videoId === requestedVideoId);

    if (hasRequested && requestedVideoId !== selectedVideoId) {
      setSelectedVideoId(requestedVideoId);
      return;
    }

    if (!selectedVideoId || !sessions.some((session) => session.videoId === selectedVideoId)) {
      setSelectedVideoId(hasRequested ? requestedVideoId : sessions[0].videoId);
    }
  }, [requestedVideoId, selectedVideoId, sessions]);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.videoId === selectedVideoId) ?? null,
    [sessions, selectedVideoId]
  );

  const sessionSnapshots = useMemo(
    () => snapshots.filter((snapshot) => snapshot.video_id === selectedVideoId),
    [snapshots, selectedVideoId]
  );

  const mappedPoints = useMemo(() => buildClusters(sessionSnapshots), [sessionSnapshots]);
  const routePlan = useMemo(
    () => buildBestRoute(mappedPoints, confirmedOnlyRoute),
    [mappedPoints, confirmedOnlyRoute]
  );

  useEffect(() => {
    if (!selectedSession) return;
    if (selectedSession.confirmed === 0 && confirmedOnlyRoute) {
      setConfirmedOnlyRoute(false);
    }
  }, [selectedSession, confirmedOnlyRoute]);

  useEffect(() => {
    if (!routePlan.orderedPoints.length) {
      setSelectedPointId(null);
      return;
    }
    if (!selectedPointId || !routePlan.orderedPoints.some((point) => point.id === selectedPointId)) {
      setSelectedPointId(routePlan.orderedPoints[0].id);
    }
  }, [routePlan, selectedPointId]);

  const selectedPoint = useMemo(
    () => routePlan.orderedPoints.find((point) => point.id === selectedPointId) ?? mappedPoints.find((point) => point.id === selectedPointId) ?? null,
    [routePlan, mappedPoints, selectedPointId]
  );

  const routeIds = new Set(routePlan.orderedPoints.map((point) => point.id));
  const rejectedCount = mappedPoints.filter((point) => point.status === "rejected").length;
  const confirmedCount = mappedPoints.filter((point) => point.status === "confirmed").length;

  return (
    <div className="fodmap-page">
      <div className="fodmap-hero">
        <div>
          <div className="fodmap-kicker">Experimental Mapping</div>
          <h1 className="fodmap-title">Pemetaan Lokasi FOD di Runway</h1>
          <p className="fodmap-subtitle">
            Fitur percobaan ini memetakan titik FOD dari snapshot hasil deteksi setelah monitoring selesai,
            lalu menyusun rekomendasi urutan pengambilan tercepat berdasarkan data yang tersedia saat ini.
          </p>
        </div>
        <div className="fodmap-hero-badge">
          <MapIcon size={18} />
          <span>Mode: hasil deduplikasi bbox per sesi</span>
        </div>
      </div>

      <div className="fodmap-toolbar">
        <div className="fodmap-toolbar-group">
          <label className="fodmap-label">Pilih Sesi Live Feed</label>
          <select
            className="fodmap-select"
            value={selectedVideoId}
            onChange={(event) => setSelectedVideoId(event.target.value)}
          >
            {sessions.length ? sessions.map((session) => (
              <option key={session.videoId} value={session.videoId}>
                {session.shortId} · {session.count} snapshot
              </option>
            )) : (
              <option value="">Belum ada sesi</option>
            )}
          </select>
        </div>

        <div className="fodmap-session-meta">
          <label className="fodmap-check-chip">
            <input
              type="checkbox"
              checked={confirmedOnlyRoute}
              onChange={(event) => setConfirmedOnlyRoute(event.target.checked)}
              disabled={confirmedCount === 0}
            />
            <span>Rute hanya titik confirmed</span>
          </label>
          <span className="fodmap-chip">Update terakhir: {selectedSession ? fmtDateTime(selectedSession.latestAt) : "—"}</span>
          <span className="fodmap-chip">Frame referensi: {FRAME_WIDTH} × {FRAME_HEIGHT}</span>
        </div>
      </div>

      <div className="fodmap-stats-grid">
        <StatCard icon={Camera} label="Snapshot Mentah" value={selectedSession?.count ?? 0} sub="seluruh deteksi sesi" tint={{ bg: "#EFF6FF", color: "#2563EB" }} />
        <StatCard icon={Target} label="Titik Hasil Mapping" value={mappedPoints.length} sub="setelah deduplikasi lokasi" tint={{ bg: "#F5F3FF", color: "#7C3AED" }} />
        <StatCard icon={Route} label="Target Rute Aktif" value={routePlan.orderedPoints.length} sub={confirmedOnlyRoute ? "hanya titik confirmed" : rejectedCount ? `${rejectedCount} titik false positive dikeluarkan` : "tanpa false positive"} tint={{ bg: "#ECFDF5", color: "#059669" }} />
        <StatCard icon={Navigation} label="Mulai Pengambilan" value={routePlan.startLabel} sub={routePlan.totalDistance ? `jarak heuristik ${routePlan.totalDistance.toFixed(1)} unit` : "tidak ada rute"} tint={{ bg: "#FFFBEB", color: "#D97706" }} />
      </div>

      {!isLoading && !sessions.length ? (
        <div className="fodmap-empty-state">
          <Layers size={22} />
          <div>
            <strong>Belum ada data snapshot untuk dipetakan.</strong>
            <p>Jalankan Live Feed sampai ada deteksi FOD, lalu buka halaman ini setelah monitoring selesai.</p>
          </div>
        </div>
      ) : (
        <div className="fodmap-layout">
          <div className="fodmap-card fodmap-map-card">
            <div className="fodmap-card-head">
              <div>
                <h2>Runway Mapping</h2>
                <p>Titik diturunkan dari pusat bbox dan di-cluster agar objek yang sama tidak berulang.</p>
              </div>
              <div className="fodmap-inline-note">Runway divisualkan vertikal sesuai asumsi input video saat ini.</div>
            </div>

            <div className="fodmap-map-wrap">
              <div className="fodmap-runway-surface">
                <div className="fodmap-runway-edge fodmap-runway-edge--left" />
                <div className="fodmap-runway-edge fodmap-runway-edge--right" />
                <div className="fodmap-runway-centerline" />
                <div className="fodmap-threshold fodmap-threshold--north">Threshold Utara</div>
                <div className="fodmap-threshold fodmap-threshold--south">Threshold Selatan</div>

                {mappedPoints.map((point) => {
                  const meta = statusMeta(point.status);
                  const routePoint = routePlan.orderedPoints.find((item) => item.id === point.id);
                  return (
                    <button
                      key={point.id}
                      className={`fodmap-point ${selectedPointId === point.id ? "is-selected" : ""} ${routeIds.has(point.id) ? "is-route" : "is-muted"}`}
                      style={{ left: `${point.mapX}%`, top: `${point.mapY}%`, borderColor: meta.color, background: meta.bg, color: meta.color }}
                      title={`${point.label} · ${meta.label}`}
                      onClick={() => setSelectedPointId(point.id)}
                    >
                      <span>{routePoint?.order ?? "•"}</span>
                    </button>
                  );
                })}

                <svg className="fodmap-route-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  {routePlan.orderedPoints.map((point, index) => {
                    const previous = index === 0
                      ? { mapX: 50, mapY: routePlan.startLabel === "Threshold Selatan" ? 98 : 2 }
                      : routePlan.orderedPoints[index - 1];
                    return (
                      <line
                        key={`route-${point.id}`}
                        x1={previous.mapX}
                        y1={previous.mapY}
                        x2={point.mapX}
                        y2={point.mapY}
                        stroke="#0F766E"
                        strokeWidth="1.6"
                        strokeDasharray="2.6 1.6"
                      />
                    );
                  })}
                </svg>
              </div>
            </div>
          </div>

          <div className="fodmap-side-column">
            <div className="fodmap-card">
              <div className="fodmap-card-head compact">
                <div>
                  <h2>Rekomendasi Rute</h2>
                  <p>Urutan pengambilan dihitung dengan heuristik nearest-neighbor dari threshold terdekat{confirmedOnlyRoute ? " dan hanya memakai titik confirmed" : ""}.</p>
                </div>
              </div>

              <div className="fodmap-route-list">
                {routePlan.orderedPoints.length ? routePlan.orderedPoints.map((point) => {
                  const meta = statusMeta(point.status);
                  return (
                    <button
                      key={point.id}
                      className={`fodmap-route-item ${selectedPointId === point.id ? "is-selected" : ""}`}
                      onClick={() => setSelectedPointId(point.id)}
                    >
                      <div className="fodmap-route-order">{point.order}</div>
                      <div className="fodmap-route-body">
                        <div className="fodmap-route-top">
                          <strong>{point.label}</strong>
                          <span style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
                        </div>
                        <div className="fodmap-route-meta">
                          Posisi longitudinal {point.longitudinal.toFixed(1)}% · offset lateral {point.lateralOffset >= 0 ? "+" : ""}{point.lateralOffset.toFixed(1)}%
                        </div>
                      </div>
                    </button>
                  );
                }) : (
                  <div className="fodmap-empty-inline">Belum ada titik valid untuk dibuatkan rute.</div>
                )}
              </div>
            </div>

            <div className="fodmap-card">
              <div className="fodmap-card-head compact">
                <div>
                  <h2>Detail Titik</h2>
                  <p>Snapshot dengan confidence tertinggi dari cluster terpilih.</p>
                </div>
              </div>

              {selectedPoint ? (
                <div className="fodmap-detail">
                  <div className="fodmap-detail-preview">
                    <img src={`${API_BASE}/snapshots/${selectedPoint.representative.image_path}`} alt={selectedPoint.label} />
                  </div>
                  <div className="fodmap-detail-grid">
                    <div>
                      <span>Label</span>
                      <strong>{selectedPoint.label}</strong>
                    </div>
                    <div>
                      <span>Status</span>
                      <strong>{statusMeta(selectedPoint.status).label}</strong>
                    </div>
                    <div>
                      <span>Confidence Rata-rata</span>
                      <strong>{fmtPct(selectedPoint.avgConfidence)}</strong>
                    </div>
                    <div>
                      <span>Deteksi Tergabung</span>
                      <strong>{selectedPoint.detections} frame</strong>
                    </div>
                    <div>
                      <span>Posisi Runway</span>
                      <strong>{selectedPoint.longitudinal.toFixed(1)}%</strong>
                    </div>
                    <div>
                      <span>Offset Lateral</span>
                      <strong>{selectedPoint.lateralOffset.toFixed(1)}%</strong>
                    </div>
                    <div>
                      <span>Pertama Terdeteksi</span>
                      <strong>{fmtDateTime(selectedPoint.firstSeen)}</strong>
                    </div>
                    <div>
                      <span>Terakhir Terdeteksi</span>
                      <strong>{fmtDateTime(selectedPoint.lastSeen)}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="fodmap-empty-inline">Pilih salah satu titik pada runway atau daftar rute.</div>
              )}
            </div>

            <div className="fodmap-card fodmap-disclaimer">
              <div className="fodmap-disclaimer-title">
                <AlertTriangle size={16} />
                Catatan Akurasi
              </div>
              <p>
                Mapping saat ini memakai pusat bbox pada frame ter-normalisasi {FRAME_WIDTH}×{FRAME_HEIGHT} dan belum memakai kalibrasi perspektif runway.
                Jadi hasil ini cocok untuk percobaan operasional awal, belum untuk koordinat lapangan yang presisi absolut.
              </p>
            </div>
          </div>
        </div>
      )}

      {selectedSession ? (
        <div className="fodmap-footer-note">
          <CheckCircle2 size={15} />
          <span>
            Sesi aktif: <strong>{selectedSession.videoId}</strong> · confirmed {selectedSession.confirmed} · pending {selectedSession.pending} · rejected {selectedSession.rejected} · resolved {selectedSession.resolved}
          </span>
        </div>
      ) : null}
    </div>
  );
}