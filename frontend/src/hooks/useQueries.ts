import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://localhost:8000";

// ── Fetch snapshots with auto-refresh ────────────────────────────────────
async function fetchSnapshots(videoId: string): Promise<any[]> {
  if (!videoId) return [];
  const res = await fetch(`${API_BASE}/fod-snapshots/?video_id=${videoId}`);
  if (!res.ok) throw new Error(`Gagal fetch snapshot: ${res.status}`);
  return res.json();
}

export function useSnapshots(videoId: string | null, enabled = false) {
  return useQuery({
    queryKey: ["fod-snapshots", videoId],
    queryFn: () => fetchSnapshots(videoId!),
    enabled: !!videoId,
    refetchInterval: enabled ? 3000 : false,   // auto-poll saat pipeline running
    staleTime: 2000,
  });
}

// ── Validate snapshot mutation ───────────────────────────────────────────
interface ValidateParams {
  id: number;
  status: string;
  staffName?: string | null;
  notes?: string | null;
}

async function validateSnapshot({ id, status, staffName, notes }: ValidateParams) {
  const res = await fetch(`${API_BASE}/fod-snapshots/${id}/validate`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      validation_status: status,
      validated_by: staffName || undefined,
      validation_notes: notes || undefined,
    }),
  });
  if (!res.ok) throw new Error(`Validasi gagal: ${res.status}`);
  return res.json();
}

export function useValidateSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: validateSnapshot,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fod-snapshots"] });
    },
  });
}

// ── Fetch ALL snapshots (no videoId required) ───────────────────────────
async function fetchAllSnapshots(validationStatus?: string | null): Promise<any[]> {
  const qs = new URLSearchParams();
  if (validationStatus) qs.set("validation_status", validationStatus);
  const res = await fetch(`${API_BASE}/fod-snapshots/?${qs}`);
  if (!res.ok) throw new Error(`Gagal fetch all snapshots: ${res.status}`);
  return res.json();
}

export function useAllSnapshots(validationStatus?: string | null) {
  return useQuery({
    queryKey: ["fod-snapshots", "all", validationStatus ?? "all"],
    queryFn: () => fetchAllSnapshots(validationStatus),
    staleTime: 5000,
    refetchInterval: 10000,
  });
}

// ── Pipeline status ─────────────────────────────────────────────────────
export function usePipelineStatus() {
  return useQuery({
    queryKey: ["pipeline-status"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/pipeline/status`);
      return res.json();
    },
    refetchInterval: 5000,
  });
}

// ── Inspection logs ─────────────────────────────────────────────────────
interface InspectionLogEntry {
  id: number;
  type: string;
  timestamp: string | null;
  created_at: string | null;
  video_id: string | null;
  frame_number: number;
  label: string;
  confidence: number | null;
  severity: "HIGH" | "MEDIUM" | "LOW";
  bbox: Record<string, number>;
  image_path: string;
  validation_status: string;
  validated_by: string | null;
  validated_at: string | null;
  validation_notes: string | null;
}

interface InspectionLogResponse {
  logs: InspectionLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

export function useInspectionLogs(params: {
  videoId?: string | null;
  severity?: string | null;
  validationStatus?: string | null;
  label?: string | null;
  days?: number | null;
  limit?: number;
  offset?: number;
  enabled?: boolean;
}) {
  const { videoId, severity, validationStatus, label, days, limit = 200, offset = 0, enabled = true } = params;
  const qs = new URLSearchParams();
  if (videoId) qs.set("video_id", videoId);
  if (severity) qs.set("severity", severity);
  if (validationStatus) qs.set("validation_status", validationStatus);
  if (label) qs.set("label", label);
  if (days) qs.set("days", String(days));
  qs.set("limit", String(limit));
  qs.set("offset", String(offset));

  return useQuery<InspectionLogResponse>({
    queryKey: ["inspection-logs", videoId, severity, validationStatus, label, days, limit, offset],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/inspection-logs/?${qs}`);
      if (!res.ok) throw new Error(`Gagal fetch logs: ${res.status}`);
      return res.json();
    },
    enabled,
    staleTime: 3000,
    refetchInterval: 5000,
  });
}

interface InspectionLogSummary {
  total: number;
  avg_confidence: number;
  avg_per_day: number;
  days: number;
  by_status: Record<string, number>;
  by_severity: Record<string, number>;
  by_label: { label: string; count: number }[];
  pipeline_status: string;
  video_id: string | null;
}

export function useInspectionLogSummary(params?: {
  videoId?: string | null;
  label?: string | null;
  days?: number | null;
  enabled?: boolean;
}) {
  const { videoId, label, days, enabled = true } = params || {};
  const qs = new URLSearchParams();
  if (videoId) qs.set("video_id", videoId);
  if (label) qs.set("label", label);
  if (days) qs.set("days", String(days));
  const qsStr = qs.toString() ? `?${qs}` : "";
  return useQuery<InspectionLogSummary>({
    queryKey: ["inspection-log-summary", videoId, label, days],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/inspection-logs/summary${qsStr}`);
      if (!res.ok) throw new Error(`Gagal fetch summary: ${res.status}`);
      return res.json();
    },
    enabled,
    staleTime: 3000,
    refetchInterval: 5000,
  });
}

export function useRealtimeEvents() {
  return useQuery({
    queryKey: ["realtime-events"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/inspection-logs/realtime`);
      if (!res.ok) throw new Error(`Gagal fetch realtime events: ${res.status}`);
      return res.json();
    },
    refetchInterval: 2000,
  });
}

// ── Detection Stats ─────────────────────────────────────────────────────
export function useDetectionStatsOverview(videoId?: string | null) {
  const qs = videoId ? `?video_id=${videoId}` : "";
  return useQuery({
    queryKey: ["detection-stats-overview", videoId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/detection-stats/overview${qs}`);
      if (!res.ok) throw new Error(`Gagal fetch overview: ${res.status}`);
      return res.json();
    },
    staleTime: 5000,
    refetchInterval: 10000,
  });
}

export function useDetectionStatsPerSession() {
  return useQuery({
    queryKey: ["detection-stats-per-session"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/detection-stats/per-session`);
      if (!res.ok) throw new Error(`Gagal fetch per-session: ${res.status}`);
      return res.json();
    },
    staleTime: 5000,
    refetchInterval: 10000,
  });
}

export function useConfidenceDistribution(videoId?: string | null) {
  const qs = videoId ? `?video_id=${videoId}` : "";
  return useQuery({
    queryKey: ["confidence-distribution", videoId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/detection-stats/confidence-distribution${qs}`);
      if (!res.ok) throw new Error(`Gagal fetch confidence dist: ${res.status}`);
      return res.json();
    },
    staleTime: 5000,
    refetchInterval: 10000,
  });
}

export function useDetectionTimeline(videoId?: string | null) {
  const qs = videoId ? `?video_id=${videoId}` : "";
  return useQuery({
    queryKey: ["detection-timeline", videoId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/detection-stats/timeline${qs}`);
      if (!res.ok) throw new Error(`Gagal fetch timeline: ${res.status}`);
      return res.json();
    },
    staleTime: 5000,
    refetchInterval: 10000,
  });
}

export function useSeverityBySession() {
  return useQuery({
    queryKey: ["severity-by-session"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/detection-stats/severity-by-session`);
      if (!res.ok) throw new Error(`Gagal fetch severity: ${res.status}`);
      return res.json();
    },
    staleTime: 5000,
    refetchInterval: 10000,
  });
}

export function useValidationBreakdown(videoId?: string | null) {
  const qs = videoId ? `?video_id=${videoId}` : "";
  return useQuery({
    queryKey: ["validation-breakdown", videoId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/detection-stats/validation-breakdown${qs}`);
      if (!res.ok) throw new Error(`Gagal fetch validation breakdown: ${res.status}`);
      return res.json();
    },
    staleTime: 5000,
    refetchInterval: 10000,
  });
}

export function useTopFrames(videoId?: string | null, limit = 10) {
  const qs = new URLSearchParams();
  if (videoId) qs.set("video_id", videoId);
  qs.set("limit", String(limit));
  return useQuery({
    queryKey: ["top-frames", videoId, limit],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/detection-stats/top-frames?${qs}`);
      if (!res.ok) throw new Error(`Gagal fetch top frames: ${res.status}`);
      return res.json();
    },
    staleTime: 5000,
    refetchInterval: 10000,
  });
}
