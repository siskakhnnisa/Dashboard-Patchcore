// ── Delete snapshot mutation ───────────────────────────────────────────
async function deleteSnapshot(id: number) {
  const res = await fetch(`${API_BASE}/fod-snapshots/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Gagal hapus snapshot: ${res.status}`);
  return res.json();
}

function sortSnapshotsByCreatedAtDesc(items: any[]) {
  return [...items].sort((a, b) => {
    const left = new Date(a?.created_at ?? 0).getTime();
    const right = new Date(b?.created_at ?? 0).getTime();
    return right - left;
  });
}

function shouldIncludeSnapshotInQuery(queryKey: readonly unknown[], snapshot: any) {
  const scope = queryKey[1];
  if (scope === "all") {
    const statusFilter = queryKey[2];
    return !statusFilter || statusFilter === "all" || statusFilter === snapshot.validation_status;
  }
  if (typeof scope === "string") {
    return snapshot.video_id === scope;
  }
  return true;
}

function mergeSnapshotIntoList(oldData: any, queryKey: readonly unknown[], snapshot: any) {
  if (!Array.isArray(oldData)) return oldData;
  const index = oldData.findIndex((item) => item?.id === snapshot.id);
  const shouldInclude = shouldIncludeSnapshotInQuery(queryKey, snapshot);

  if (index === -1) {
    return shouldInclude ? sortSnapshotsByCreatedAtDesc([snapshot, ...oldData]) : oldData;
  }
  if (!shouldInclude) {
    return oldData.filter((item) => item?.id !== snapshot.id);
  }

  const next = [...oldData];
  next[index] = { ...next[index], ...snapshot };
  return sortSnapshotsByCreatedAtDesc(next);
}

function removeSnapshotFromList(oldData: any, snapshotId: number) {
  if (!Array.isArray(oldData)) return oldData;
  return oldData.filter((item) => item?.id !== snapshotId);
}

function syncSnapshotAcrossCaches(qc: ReturnType<typeof useQueryClient>, snapshot: any) {
  const queries = qc.getQueryCache().findAll({ queryKey: ["fod-snapshots"] });
  for (const query of queries) {
    qc.setQueryData(query.queryKey, (oldData: any) => mergeSnapshotIntoList(oldData, query.queryKey, snapshot));
  }
}

function removeSnapshotAcrossCaches(qc: ReturnType<typeof useQueryClient>, snapshotId: number) {
  const queries = qc.getQueryCache().findAll({ queryKey: ["fod-snapshots"] });
  for (const query of queries) {
    qc.setQueryData(query.queryKey, (oldData: any) => removeSnapshotFromList(oldData, snapshotId));
  }
}

export function useDeleteSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteSnapshot,
    onMutate: async (snapshotId) => {
      await qc.cancelQueries({ queryKey: ["fod-snapshots"] });
      const queries = qc.getQueryCache().findAll({ queryKey: ["fod-snapshots"] });
      const previous = queries.map((query) => ({
        queryKey: query.queryKey,
        data: qc.getQueryData(query.queryKey),
      }));
      removeSnapshotAcrossCaches(qc, snapshotId);
      return { previous };
    },
    onError: (_error, _snapshotId, context) => {
      for (const entry of context?.previous ?? []) {
        qc.setQueryData(entry.queryKey, entry.data);
      }
    },
    onSuccess: (_data, snapshotId) => {
      removeSnapshotAcrossCaches(qc, snapshotId);
    },
  });
}
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
    onMutate: async (variables) => {
      await qc.cancelQueries({ queryKey: ["fod-snapshots"] });
      const queries = qc.getQueryCache().findAll({ queryKey: ["fod-snapshots"] });
      const previous = queries.map((query) => ({
        queryKey: query.queryKey,
        data: qc.getQueryData(query.queryKey),
      }));

      const current = queries
        .map((query) => qc.getQueryData<any>(query.queryKey))
        .find((data) => Array.isArray(data) && data.some((item) => item?.id === variables.id))
        ?.find((item: any) => item?.id === variables.id);

      if (current) {
        syncSnapshotAcrossCaches(qc, {
          ...current,
          validation_status: variables.status,
          validated_by: variables.staffName || current.validated_by || "Operator",
          validated_at: new Date().toISOString(),
          validation_notes: variables.notes ?? current.validation_notes ?? null,
        });
      }

      return { previous };
    },
    onError: (_error, _variables, context) => {
      for (const entry of context?.previous ?? []) {
        qc.setQueryData(entry.queryKey, entry.data);
      }
    },
    onSuccess: (updated) => {
      syncSnapshotAcrossCaches(qc, updated);
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

export function useAllSnapshots(
  validationStatus?: string | null,
  options?: { refetchInterval?: number | false }
) {
  return useQuery({
    queryKey: ["fod-snapshots", "all", validationStatus ?? "all"],
    queryFn: () => fetchAllSnapshots(validationStatus),
    staleTime: 5000,
    refetchInterval: options?.refetchInterval ?? 10000,
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

// ── System Logs ─────────────────────────────────────────────────────────
interface SystemLogEntry {
  timestamp: string;
  level: string;
  source: string;
  message: string;
}

interface SystemLogResponse {
  logs: SystemLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

interface SystemLogStats {
  total_entries: number;
  by_level: Record<string, number>;
  file_size_bytes: number;
  file_size_mb: number;
  errors_24h: number;
  warnings_24h: number;
  recent_errors: SystemLogEntry[];
  recent_warnings: SystemLogEntry[];
  last_error_time: string | null;
  last_startup_time: string | null;
  total_restarts: number;
  uptime: string | null;
}

export function useSystemLogs(params: {
  level?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}) {
  const { level, search, limit = 200, offset = 0 } = params;
  const qs = new URLSearchParams();
  if (level) qs.set("level", level);
  if (search) qs.set("search", search);
  qs.set("limit", String(limit));
  qs.set("offset", String(offset));

  return useQuery<SystemLogResponse>({
    queryKey: ["system-logs", level, search, limit, offset],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/system-logs/?${qs}`);
      if (!res.ok) throw new Error(`Gagal fetch system logs: ${res.status}`);
      return res.json();
    },
    staleTime: 5000,
    refetchInterval: 10000,
  });
}

export function useSystemLogStats() {
  return useQuery<SystemLogStats>({
    queryKey: ["system-log-stats"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/system-logs/stats`);
      if (!res.ok) throw new Error(`Gagal fetch log stats: ${res.status}`);
      return res.json();
    },
    staleTime: 10000,
    refetchInterval: 30000,
  });
}

interface ActivityHistoryEntry {
  id: number;
  activity_type: "upload" | "stream";
  title: string;
  status: string;
  video_id: string | null;
  filename: string | null;
  stream_name: string | null;
  stream_url: string | null;
  resolution: string | null;
  file_extension: string | null;
  mime_type: string | null;
  codec_name: string | null;
  stored_path: string | null;
  width_px: number | null;
  height_px: number | null;
  fps: number | null;
  total_frames: number | null;
  duration_seconds: number | null;
  size_mb: number | null;
  detected_fod_count: number | null;
  error_message: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ActivityHistoryResponse {
  items: ActivityHistoryEntry[];
  total: number;
  limit: number;
  offset: number;
}

interface ActivityHistorySummary {
  total_uploads: number;
  total_stream_sessions: number;
  uploads_last_7d: number;
  streams_last_7d: number;
  active_streams: number;
  completed_streams: number;
  failed_streams: number;
  last_upload_at: string | null;
  last_stream_at: string | null;
}

export function useActivityHistorySummary() {
  return useQuery<ActivityHistorySummary>({
    queryKey: ["activity-history-summary"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/activity-history/summary`);
      if (!res.ok) throw new Error(`Gagal fetch activity history summary: ${res.status}`);
      return res.json();
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });
}

export function useActivityHistoryEntries(params: {
  activityType?: string | null;
  status?: string | null;
  search?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  limit?: number;
  offset?: number;
}) {
  const { activityType, status, search, dateFrom, dateTo, limit = 20, offset = 0 } = params;
  const qs = new URLSearchParams();
  if (activityType) qs.set("activity_type", activityType);
  if (status) qs.set("status", status);
  if (search) qs.set("search", search);
  if (dateFrom) qs.set("date_from", dateFrom);
  if (dateTo) qs.set("date_to", dateTo);
  qs.set("limit", String(limit));
  qs.set("offset", String(offset));

  return useQuery<ActivityHistoryResponse>({
    queryKey: ["activity-history-entries", activityType, status, search, dateFrom, dateTo, limit, offset],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/activity-history/entries?${qs}`);
      if (!res.ok) throw new Error(`Gagal fetch activity history entries: ${res.status}`);
      return res.json();
    },
    staleTime: 30000,
  });
}
