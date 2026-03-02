// src/components/monitoring/LiveMonitorPanel.jsx
import { useEffect, useRef } from "react";

export default function LiveMonitorPanel({
  frameBitmap, anomalyDetected, bboxes, fps, connected
}) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!frameBitmap || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = frameBitmap.width;
    canvas.height = frameBitmap.height;
    ctx.drawImage(frameBitmap, 0, 0);
    bboxes.forEach((bbox) => {
      const color = bbox.confidence >= 0.8 ? "#FF3333"
                  : bbox.confidence >= 0.6 ? "#FF8800" : "#FFCC00";
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(bbox.x, bbox.y, bbox.width, bbox.height);
      const label = `FOD ${(bbox.confidence * 100).toFixed(0)}%`;
      ctx.font = "bold 14px monospace";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = color;
      ctx.fillRect(bbox.x, bbox.y - 22, tw + 8, 22);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(label, bbox.x + 4, bbox.y - 5);
    });
  }, [frameBitmap, bboxes]);

  return (
    <div className="relative bg-black rounded-xl overflow-hidden">
      {/* Status bar identik dengan DashboardPage */}
      <div className="absolute top-2 left-2 z-10 flex gap-2 items-center">
        <span style={{
          fontSize: "12px",
          fontWeight: "bold",
          padding: "4px 10px",
          borderRadius: "999px",
          backgroundColor: connected ? "#E8F5E9" : "#FFEBEE",
          color: connected ? "#2E7D32" : "#C62828"
        }}>
          {connected ? `● LIVE  ${fps} FPS` : "○ Disconnected"}
        </span>
        {anomalyDetected && (
          <span style={{
            backgroundColor: "#C62828",
            color: "#fff",
            padding: "4px 10px",
            borderRadius: "999px",
            fontWeight: "bold",
            fontSize: "12px",
            animation: "pulse 1s infinite"
          }}>
            ⚠ FOD DETECTED
          </span>
        )}
      </div>
      {/* Canvas video */}
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ aspectRatio: "16/9" }}
      />
      {/* Placeholder jika belum ada frame */}
      {!frameBitmap && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          <p>Menunggu video stream...</p>
        </div>
      )}
    </div>
  );
}