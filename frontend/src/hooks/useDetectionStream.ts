import { useEffect, useRef, useState, useCallback } from "react";

// ── Types sesuai payload dari backend ─────────────────────────────────────
export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  label: string;
}

export interface FODEvent {
  event_id: string;
  timestamp: number;
  time_str: string;
  frame_id: number;
  fod_count: number;
  max_score: number;
  severity: "LOW" | "MEDIUM" | "HIGH";
  bboxes: BBox[];
}

export interface StreamPayload {
  type: "frame" | "status" | "error" | "connected";
  frame_b64?: string;
  frame_id?: number;
  timestamp?: number;
  fps?: number;

  // DetectionInfoPanel
  anomaly_detected?: boolean;
  anomaly_score?: number;
  bboxes?: BBox[];

  // DetectionStatistic
  score_history?: number[];

  // FODeventsTimeline
  recent_events?: FODEvent[];
  total_fod_count?: number;

  // PipelineControlPanel
  pipeline_status?: string;
  video_progress_pct?: number;
  current_frame?: number;
  total_frames?: number;
  elapsed_seconds?: number;
  runway_area_pct?: number;
  video_id?: string;

  // Status/Error
  status?: string;
  message?: string;
}

// ── Hook utama ────────────────────────────────────────────────────────────
const WS_URL = "ws://localhost:8000/ws/stream";

export function useDetectionStream() {
  const wsRef = useRef<WebSocket | null>(null);
  const [frameBitmap, setFrameBitmap] = useState<ImageBitmap | null>(null);
  // Buffer untuk frame binary, hanya simpan 1 frame terbaru
  const frameQueueRef = useRef<ArrayBuffer | null>(null);
  const decodingRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);

  const [connected, setConnected] = useState(false);
  const [lastPayload, setLastPayload] = useState<StreamPayload | null>(null);
  const [fps, setFps] = useState(0);

  // FPS tracking
  const frameCountRef = useRef(0);
  const lastFpsRef = useRef(Date.now());

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(WS_URL);
    let lastPayload: StreamPayload | null = null;
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
      setConnected(true);
      console.log("[WS] Terhubung ke backend");
    };
    ws.onclose = () => {
      setConnected(false);
      console.log("[WS] Disconnected, mencoba reconnect...");
      reconnectTimerRef.current = setTimeout(connect, 3000);
    };
    ws.onerror = (err) => {
      console.error("[WS] Error:", err);
    };
    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        // JSON metadata
        lastPayload = JSON.parse(event.data);
        setLastPayload(lastPayload);
        if (lastPayload && lastPayload.type === "frame") {
          frameCountRef.current++;
          const now = Date.now();
          if (now - lastFpsRef.current >= 1000) {
            setFps(frameCountRef.current);
            frameCountRef.current = 0;
            lastFpsRef.current = now;
          }
        }
      } else if (event.data instanceof ArrayBuffer && lastPayload && lastPayload.type === "frame") {
        // Frame masuk ke buffer, drop frame lama jika belum selesai decode
        frameQueueRef.current = event.data;
        decodeNextFrame();
      }
    };

    // Fungsi untuk decode frame terbaru di buffer
    async function decodeNextFrame() {
      if (decodingRef.current) return;
      if (!frameQueueRef.current) return;
      decodingRef.current = true;
      const data = frameQueueRef.current;
      frameQueueRef.current = null;
      try {
        const blob = new Blob([data], { type: "image/jpeg" });
        const bitmap = await createImageBitmap(blob);
        setFrameBitmap(bitmap);
      } catch (e) {
        setFrameBitmap(null);
      } finally {
        decodingRef.current = false;
        // Jika ada frame baru masuk saat decode, proses frame terbaru
        if (frameQueueRef.current) decodeNextFrame();
      }
    }
    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected, lastPayload, fps, frameBitmap };
}