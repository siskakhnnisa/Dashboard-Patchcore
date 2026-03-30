import { useStreamStore } from "../stores/useStreamStore";

export type { StreamPayload } from "../stores/useStreamStore";

/**
 * Thin hook — just reads from the global Zustand store.
 * The WebSocket connection is managed at the layout level by <PersistentConnections />,
 * so navigating between pages never closes it.
 *
 * The `enabled` param is kept for API compatibility but is now ignored
 * (connection lifecycle is global).
 */
export function useStreamDetection(_enabled = true) {
  const connected   = useStreamStore((s) => s.connected);
  const lastPayload = useStreamStore((s) => s.lastPayload);
  const fps         = useStreamStore((s) => s.fps);
  const frameBitmap = useStreamStore((s) => s.frameBitmap);

  return { connected, lastPayload, fps, frameBitmap };
}
