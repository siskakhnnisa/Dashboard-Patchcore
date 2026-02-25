import cv2
import numpy as np
import time
from app.models.patchcore import PatchCoreModel
from app.models.segmentation import RunwaySegmentationModel
from app.schemas.detection import BoundingBox, DetectionResult
from app.config import settings
from app.core.logger import logger


class InferencePipeline:

    # Threshold heatmap untuk generate bounding box
    HEATMAP_BBOX_THRESHOLD = 0.5   # pixel di heatmap dianggap FOD jika > ini

    def __init__(self):
        self.patchcore    = PatchCoreModel(settings.PATCHCORE_MODEL_PATH)
        self.segmentation = RunwaySegmentationModel(settings.SEGMENTATION_MODEL_PATH)
        self.threshold    = settings.ANOMALY_THRESHOLD
        self._frame_count = 0

    # ──────────────────────────────────────────────────────────────────────────
    def load_models(self):
        """Load semua model — dipanggil sekali saat startup FastAPI"""
        logger.info("Loading semua model ke memori...")
        self.segmentation.load()
        self.patchcore.load()
        logger.success("Semua model siap digunakan")

    # ──────────────────────────────────────────────────────────────────────────
    def process_frame(self, frame: np.ndarray) -> DetectionResult:
        """
        Main entry point: proses satu frame BGR, return hasil deteksi.

        Alur:
          1. Resize frame ke ukuran standar
          2. Segmentasi → runway mask
          3. PatchCore scoring → anomaly heatmap
          4. Threshold heatmap → bounding boxes
          5. Return DetectionResult
        """
        t0 = time.time()
        self._frame_count += 1

        # ── 1. Resize ──────────────────────────────────────────────────────
        frame_resized = cv2.resize(
            frame,
            (settings.FRAME_WIDTH, settings.FRAME_HEIGHT)
        )

        # ── 2. Segmentasi runway ───────────────────────────────────────────
        runway_mask = self.segmentation.predict_mask(frame_resized)
        runway_area_pct = self.segmentation.get_runway_area_percentage(runway_mask)

        # ── 3. PatchCore scoring ───────────────────────────────────────────
        anomaly_map, max_score = self.patchcore.score_frame(
            frame_resized, runway_mask
        )

        # ── 4. Generate bounding boxes dari heatmap ────────────────────────
        bboxes = []
        if max_score >= self.threshold:
            bboxes = self._heatmap_to_bboxes(
                anomaly_map,
                frame_resized.shape,
                max_score
            )

        elapsed = time.time() - t0
        logger.debug(
            f"Frame {self._frame_count:05d} | "
            f"{elapsed*1000:.1f}ms | "
            f"score={max_score:.3f} | "
            f"FOD={len(bboxes)} | "
            f"runway={runway_area_pct:.1f}%"
        )

        return DetectionResult(
            frame_id=self._frame_count,
            timestamp=time.time(),
            anomaly_detected=len(bboxes) > 0,
            anomaly_score=round(max_score, 4),
            bboxes=bboxes,
            runway_area_pct=round(runway_area_pct, 2)
        )

    # ──────────────────────────────────────────────────────────────────────────
    def _heatmap_to_bboxes(
        self,
        anomaly_map: np.ndarray,
        frame_shape: tuple,
        max_score: float
    ) -> list[BoundingBox]:
        """
        Convert anomaly heatmap menjadi bounding boxes di koordinat frame.

        Langkah:
          1. Threshold heatmap → binary mask
          2. Resize ke ukuran frame
          3. findContours → bounding rect
          4. Filter contour kecil (noise)
          5. Return list BoundingBox
        """
        frame_h, frame_w = frame_shape[:2]

        # Threshold heatmap
        binary = (anomaly_map >= self.HEATMAP_BBOX_THRESHOLD).astype(np.uint8)

        # Resize binary mask ke ukuran frame
        binary_resized = cv2.resize(
            binary, (frame_w, frame_h),
            interpolation=cv2.INTER_NEAREST
        )

        # Dilasi sedikit agar bbox tidak terlalu kecil
        kernel = np.ones((15, 15), np.uint8)
        binary_dilated = cv2.dilate(binary_resized, kernel, iterations=1)

        # Find contours
        contours, _ = cv2.findContours(
            binary_dilated,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )

        bboxes = []
        min_area = 20 * 20  # filter noise: abaikan contour < 20x20 pixel

        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            area = w * h

            if area < min_area:
                continue

            # Score bbox = rata-rata heatmap di area tersebut
            # (dikonversi ke koordinat feature map)
            fh, fw = anomaly_map.shape
            fx = int(x / frame_w * fw)
            fy = int(y / frame_h * fh)
            fw_ = max(1, int(w / frame_w * fw))
            fh_ = max(1, int(h / frame_h * fh))

            patch_scores = anomaly_map[fy:fy+fh_, fx:fx+fw_]
            bbox_score = float(patch_scores.max()) if patch_scores.size > 0 else max_score

            bboxes.append(BoundingBox(
                x=x, y=y,
                width=w, height=h,
                confidence=round(min(bbox_score, 1.0), 4),
                label="FOD"
            ))

        return bboxes