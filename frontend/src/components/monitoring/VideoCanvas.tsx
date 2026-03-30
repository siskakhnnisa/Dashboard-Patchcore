import React, { useEffect, useRef } from "react";

interface BBox {
  x: number; y: number; w: number; h: number; score: number;
}

interface Props {
  frameB64: string | null;
  bboxes: BBox[];
  anomalyDetected: boolean;
}

export const VideoCanvas = React.memo(function VideoCanvas({ frameB64, bboxes, anomalyDetected }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef(new Image());

  useEffect(() => {
    if (!frameB64 || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    const img = imgRef.current;

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      // Draw bounding boxes
      bboxes.forEach((bbox) => {
        const color = bbox.score > 0.8 ? "#FF3333" : "#FF8800";
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(bbox.x, bbox.y, bbox.w, bbox.h);

        // Label background
        ctx.fillStyle = color;
        ctx.fillRect(bbox.x, bbox.y - 24, 100, 22);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 14px monospace";
        ctx.fillText(`FOD ${(bbox.score * 100).toFixed(0)}%`, bbox.x + 4, bbox.y - 6);
      });

      // Status badge
      ctx.fillStyle = anomalyDetected ? "rgba(255,0,0,0.8)" : "rgba(0,200,0,0.8)";
      ctx.fillRect(10, 10, 200, 40);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 18px monospace";
      ctx.fillText(anomalyDetected ? "⚠ FOD DETECTED" : "✓ RUNWAY CLEAR", 20, 36);
    };

    img.src = `data:image/jpeg;base64,${frameB64}`;
  }, [frameB64, bboxes, anomalyDetected]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-xl border border-gray-700 bg-black"
    />
  );
});
