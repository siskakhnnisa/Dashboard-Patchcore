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

  // Status/Error
  status?: string;
  message?: string;
}

// ── Hook utama ────────────────────────────────────────────────────────────
const WS_URL = "ws://localhost:8000/ws/stream";

export function useDetectionStream() {
  const wsRef = useRef<WebSocket | null>(null);
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
      const payload: StreamPayload = JSON.parse(event.data);
      setLastPayload(payload);

      // Update FPS
      if (payload.type === "frame") {
        frameCountRef.current++;
        const now = Date.now();
        if (now - lastFpsRef.current >= 1000) {
          setFps(frameCountRef.current);
          frameCountRef.current = 0;
          lastFpsRef.current = now;
        }
      }
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimerRef.current === null ? undefined : reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected, lastPayload, fps };
}