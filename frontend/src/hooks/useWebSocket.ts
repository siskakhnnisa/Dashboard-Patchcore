import { useEffect, useRef, useState, useCallback } from "react";

interface DetectionPayload {
  frame: string;
  anomaly_detected: boolean;
  max_score: number;
  bboxes: Array<{ x: number; y: number; w: number; h: number; score: number }>;
  timestamp: number;
}

export function useDetectionStream(wsUrl: string, active: boolean) {
  const wsRef = useRef<WebSocket | null>(null);
  const [payload, setPayload] = useState<DetectionPayload | null>(null);
  const [connected, setConnected] = useState(false);
  const [fps, setFps] = useState(0);
  const frameCountRef = useRef(0);
  const lastFpsUpdate = useRef(Date.now());

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      // Auto-reconnect
      if (active) setTimeout(connect, 2000);
    };
    ws.onmessage = (event) => {
      const data: DetectionPayload = JSON.parse(event.data);
      setPayload(data);

      // FPS counter
      frameCountRef.current++;
      const now = Date.now();
      if (now - lastFpsUpdate.current >= 1000) {
        setFps(frameCountRef.current);
        frameCountRef.current = 0;
        lastFpsUpdate.current = now;
      }
    };
    wsRef.current = ws;
  }, [wsUrl, active]);

  useEffect(() => {
    if (active) connect();
    return () => {
      wsRef.current?.close();
    };
  }, [active, connect]);

  return { payload, connected, fps };
}