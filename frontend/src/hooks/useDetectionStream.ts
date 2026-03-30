import { useDetectionStore } from "../stores/useDetectionStore";

// Re-export types for backward compatibility
export type { BBox, FODEvent, StreamPayload } from "../stores/useDetectionStore";

/**
 * Thin hook — just reads from the global Zustand store.
 * The WebSocket connection is managed at the layout level by <PersistentConnections />,
 * so navigating between pages never closes it.
 */
export function useDetectionStream() {
  const connected   = useDetectionStore((s) => s.connected);
  const lastPayload = useDetectionStore((s) => s.lastPayload);
  const fps         = useDetectionStore((s) => s.fps);
  const frameBitmap = useDetectionStore((s) => s.frameBitmap);

  return { connected, lastPayload, fps, frameBitmap };
}