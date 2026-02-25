const BASE_URL = "http://localhost:8000";

export const api = {
  // Upload video
  async uploadVideo(file: File): Promise<{
    video_id: string;
    filename: string;
    duration_seconds: number;
    total_frames: number;
    fps: number;
    resolution: string;
  }> {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${BASE_URL}/api/video/upload`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Upload gagal");
    }
    return res.json();
  },

  // Start pipeline
  async startPipeline(videoId: string, threshold = 0.5): Promise<void> {
    const res = await fetch(`${BASE_URL}/api/pipeline/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        video_id: videoId,
        anomaly_threshold: threshold,
      }),
    });
    if (!res.ok) throw new Error("Gagal start pipeline");
  },

  // Stop pipeline
  async stopPipeline(): Promise<void> {
    await fetch(`${BASE_URL}/api/pipeline/stop`, { method: "POST" });
  },

  // Update threshold real-time
  async updateThreshold(threshold: number): Promise<void> {
    await fetch(`${BASE_URL}/api/pipeline/threshold?threshold=${threshold}`, {
      method: "POST",
    });
  },

  // Get status
  async getStatus() {
    const res = await fetch(`${BASE_URL}/api/pipeline/status`);
    return res.json();
  },
};