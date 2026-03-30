import { create } from "zustand";
import type { BBox, FODEvent } from "./useDetectionStore";

export interface StreamPayload {
  type: "frame" | "status" | "error" | "connected" | "warning";
  frame_id?: number;
  timestamp?: number;
  fps?: number;
  anomaly_detected?: boolean;
  anomaly_score?: number;
  bboxes?: BBox[];
  score_history?: number[];
  recent_events?: FODEvent[];
  total_fod_count?: number;
  pipeline_status?: string;
  stream_name?: string;
  stream_url?: string;
  stream_fps?: number;
  stream_resolution?: string;
  stream_uptime?: number;
  stream_reconnects?: number;
  total_frames_processed?: number;
  elapsed_seconds?: number;
  runway_area_pct?: number;
  status?: string;
  message?: string;
}

interface StreamState {
  connected: boolean;
  lastPayload: StreamPayload | null;
  fps: number;
  frameBitmap: ImageBitmap | null;

  setConnected: (v: boolean) => void;
  setLastPayload: (p: StreamPayload) => void;
  setFps: (v: number) => void;
  setFrameBitmap: (b: ImageBitmap | null) => void;
  reset: () => void;

  // WS lifecycle (global, survives navigation)
  connect: () => void;
  disconnect: () => void;
}

// ── Module-level WS state ────────────────────────────────────────────────
const WS_URL = (import.meta as any).env?.VITE_WS_BASE
  ? `${(import.meta as any).env.VITE_WS_BASE}/api/stream/ws`
  : "ws://localhost:8000/api/stream/ws";

let _ws: WebSocket | null = null;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _frameCount = 0;
let _lastFpsTime = Date.now();
let _decoding = false;
let _frameQueue: ArrayBuffer | null = null;

export const useStreamStore = create<StreamState>((set, get) => ({
  connected: false,
  lastPayload: null,
  fps: 0,
  frameBitmap: null,

  setConnected: (v) => set({ connected: v }),
  setLastPayload: (p) => set({ lastPayload: p }),
  setFps: (v) => set({ fps: v }),
  setFrameBitmap: (b) => set({ frameBitmap: b }),
  reset: () => set({ connected: false, lastPayload: null, fps: 0, frameBitmap: null }),

  connect: () => {
    if (_ws?.readyState === WebSocket.OPEN || _ws?.readyState === WebSocket.CONNECTING) return;

    const ws = new WebSocket(WS_URL);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      set({ connected: true });
      console.log("[StreamWS] Connected");
    };

    ws.onclose = () => {
      set({ connected: false });
      _ws = null;
      console.log("[StreamWS] Disconnected, reconnecting in 3s...");
      _reconnectTimer = setTimeout(() => get().connect(), 3000);
    };

    ws.onerror = (err) => console.error("[StreamWS] Error:", err);

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        try {
          const parsed: StreamPayload = JSON.parse(event.data);
          set({ lastPayload: parsed });

          if (parsed.type === "frame") {
            _frameCount++;
            const now = Date.now();
            if (now - _lastFpsTime >= 1000) {
              set({ fps: _frameCount });
              _frameCount = 0;
              _lastFpsTime = now;
            }
          }
        } catch { /* ignore */ }
      } else if (event.data instanceof ArrayBuffer) {
        _frameQueue = event.data;
        decodeNextFrame(set);
      }
    };

    _ws = ws;
  },

  disconnect: () => {
    if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
    _ws?.close();
    _ws = null;
  },
}));

async function decodeNextFrame(set: (s: Partial<StreamState>) => void) {
  if (_decoding) return;
  if (!_frameQueue) return;
  _decoding = true;
  const data = _frameQueue;
  _frameQueue = null;
  try {
    const blob = new Blob([data], { type: "image/jpeg" });
    const bitmap = await createImageBitmap(blob);
    set({ frameBitmap: bitmap });
  } catch {
    set({ frameBitmap: null });
  } finally {
    _decoding = false;
    if (_frameQueue) decodeNextFrame(set);
  }
}
