import { create } from "zustand";

// ── Types ────────────────────────────────────────────────────────────────
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
  anomaly_detected?: boolean;
  anomaly_score?: number;
  bboxes?: BBox[];
  score_history?: number[];
  recent_events?: FODEvent[];
  total_fod_count?: number;
  pipeline_status?: string;
  video_progress_pct?: number;
  current_frame?: number;
  total_frames?: number;
  elapsed_seconds?: number;
  runway_area_pct?: number;
  video_id?: string;
  drone_telemetry?: any[];
  status?: string;
  message?: string;
}

interface DetectionState {
  connected: boolean;
  lastPayload: StreamPayload | null;
  fps: number;
  frameBitmap: ImageBitmap | null;
  persistedVideoId: string | null;

  // Actions
  setConnected: (v: boolean) => void;
  setLastPayload: (p: StreamPayload) => void;
  setFps: (v: number) => void;
  setFrameBitmap: (b: ImageBitmap | null) => void;
  setPersistedVideoId: (id: string | null) => void;

  // WS lifecycle (global, survives navigation)
  connect: () => void;
  disconnect: () => void;
}

// ── Module-level WS state (not in Zustand to avoid re-renders) ───────────
const WS_URL = "ws://localhost:8000/ws/stream";
let _ws: WebSocket | null = null;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _frameCount = 0;
let _lastFpsTime = Date.now();
let _decoding = false;
let _frameQueue: ArrayBuffer | null = null;

export const useDetectionStore = create<DetectionState>((set, get) => ({
  connected: false,
  lastPayload: null,
  fps: 0,
  frameBitmap: null,
  persistedVideoId: null,

  setConnected: (v) => set({ connected: v }),
  setLastPayload: (p) => {
    set({ lastPayload: p });
    if (p.pipeline_status === "running" && p.video_id) {
      set({ persistedVideoId: p.video_id });
    } else if (p.pipeline_status === "idle" || p.pipeline_status === "finished" || p.pipeline_status === "stopped") {
      set({ persistedVideoId: null });
    }
  },
  setFps: (v) => set({ fps: v }),
  setFrameBitmap: (b) => set({ frameBitmap: b }),
  setPersistedVideoId: (id) => set({ persistedVideoId: id }),

  connect: () => {
    if (_ws?.readyState === WebSocket.OPEN || _ws?.readyState === WebSocket.CONNECTING) return;

    const ws = new WebSocket(WS_URL);
    ws.binaryType = "arraybuffer";
    let lastParsed: StreamPayload | null = null;

    ws.onopen = () => {
      set({ connected: true });
      console.log("[DetectionWS] Connected");
    };

    ws.onclose = () => {
      set({ connected: false });
      _ws = null;
      console.log("[DetectionWS] Disconnected, reconnecting in 3s...");
      _reconnectTimer = setTimeout(() => get().connect(), 3000);
    };

    ws.onerror = (err) => console.error("[DetectionWS] Error:", err);

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        try {
          lastParsed = JSON.parse(event.data);
        } catch { return; }
        if (!lastParsed) return;

        get().setLastPayload(lastParsed);

        if (lastParsed.type === "frame") {
          _frameCount++;
          const now = Date.now();
          if (now - _lastFpsTime >= 1000) {
            set({ fps: _frameCount });
            _frameCount = 0;
            _lastFpsTime = now;
          }
        }
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

async function decodeNextFrame(set: (s: Partial<DetectionState>) => void) {
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
