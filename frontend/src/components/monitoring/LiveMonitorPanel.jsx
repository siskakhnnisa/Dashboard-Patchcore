// src/components/monitoring/LiveMonitorPanel.jsx
import { useEffect, useRef } from "react";

export default function LiveMonitorPanel({
  frameB64, anomalyDetected, bboxes, fps, connected
}) {
  const canvasRef = useRef(null);
  const imgRef = useRef(new Image());

  useEffect(() => {
    if (!frameB64 || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const img = imgRef.current;

    img.onload = () => {
      // Set canvas ukuran sesuai frame
      if (canvas.width !== img.width) canvas.width = img.width;
      if (canvas.height !== img.height) canvas.height = img.height;

      // Gambar frame
      ctx.drawImage(img, 0, 0);

      // Gambar bounding boxes
      bboxes.forEach((bbox) => {
        const color = bbox.confidence >= 0.8 ? "#FF3333"
                    : bbox.confidence >= 0.6 ? "#FF8800" : "#FFCC00";

        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(bbox.x, bbox.y, bbox.width, bbox.height);

        // Label
        const label = `FOD ${(bbox.confidence * 100).toFixed(0)}%`;
        ctx.font = "bold 14px monospace";
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = color;
        ctx.fillRect(bbox.x, bbox.y - 22, tw + 8, 22);
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(label, bbox.x + 4, bbox.y - 5);
      });
    };

    img.src = `data:image/jpeg;base64,${frameB64}`;
  }, [frameB64, bboxes]);

  return (
    <div className="relative bg-black rounded-xl overflow-hidden">
      {/* Status bar */}
      <div className="absolute top-2 left-2 z-10 flex gap-2">
        <span className={`px-2 py-1 rounded text-xs font-bold ${
          connected ? "bg-green-600" : "bg-red-600"
        } text-white`}>
          {connected ? "● LIVE" : "○ DISCONNECTED"}
        </span>
        <span className="bg-black/60 text-white px-2 py-1 rounded text-xs">
          {fps} FPS
        </span>
        {anomalyDetected && (
          <span className="bg-red-600 text-white px-2 py-1 rounded text-xs font-bold animate-pulse">
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
      {!frameB64 && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          <p>Menunggu video stream...</p>
        </div>
      )}
    </div>
  );
}