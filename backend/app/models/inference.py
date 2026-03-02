"""
inference.py — Pipeline deteksi FOD real-time

Mengimplementasikan alur yang identik dengan Kaggle notebook:
  1. Runway segmentation + runway core (eroded mask)
  2. Dual-scale PatchCore scoring (main 384 + micro 768)
  3. Micro-peak enhancement (Laplacian of Gaussian)
  4. Marking & line suppression (HSV + HoughLinesP)
  5. Map fusion (maximum + distance-weighted penalty)
  6. Dual-region detection:
       - Blue region (15th percentile) — objek kecil/dingin
       - Red  region (95th percentile) — objek besar/panas
  7. classify_region() — filter MARKING, IGNORE, FOD
  8. Non-Maximum Suppression
"""

import cv2
import numpy as np
import time
from scipy.ndimage import label, distance_transform_edt

from app.models.patchcore import PatchCoreModel
from app.models.segmentation import RunwaySegmentationModel
from app.schemas.detection import BoundingBox, DetectionResult
from app.config import settings
from app.core.logger import logger


# ═════════════════════════════════════════════════════════════════════════════
class InferencePipeline:

    def __init__(self):
        self.patchcore    = PatchCoreModel(settings.PATCHCORE_MODEL_PATH)
        self.segmentation = RunwaySegmentationModel(settings.SEGMENTATION_MODEL_PATH)
        self.threshold    = settings.ANOMALY_THRESHOLD
        self._frame_count = 0

    # ──────────────────────────────────────────────────────────────────────────
    def load_models(self):
        """Load semua model — dipanggil sekali saat startup FastAPI."""
        logger.info("Loading semua model ke memori...")
        self.segmentation.load()
        self.patchcore.load()
        logger.success("Semua model siap digunakan")

    # ──────────────────────────────────────────────────────────────────────────
    def process_frame(self, frame: np.ndarray) -> DetectionResult:
        """
        Main entry point: proses satu frame BGR, return hasil deteksi.

        Alur (identik dengan process_single_image() di Kaggle notebook):
          1. Resize frame ke ukuran standar
          2. Runway segmentation → mask + core
          3. Dual-scale PatchCore scoring (main + micro)
          4. Marking / line mask
          5. Map fusion + mask ke runway core
          6. Dual-region detection (blue + red)
          7. classify_region filtering + NMS
          8. Return DetectionResult
        """
        t0 = time.time()
        self._frame_count += 1

        # ── 1. Resize ──────────────────────────────────────────────────────
        frame_resized = cv2.resize(
            frame, (settings.FRAME_WIDTH, settings.FRAME_HEIGHT)
        )

        # ── 2. Segmentasi runway ───────────────────────────────────────────
        runway_mask     = self.segmentation.predict_mask(frame_resized)
        runway_core     = self.segmentation.get_runway_core(runway_mask)
        runway_area_pct = self.segmentation.get_runway_area_percentage(runway_mask)

        # ── 3. Dual-scale PatchCore scoring ───────────────────────────────
        amap_main      = self.patchcore.score_map_at_size(frame_resized, settings.IMG_PC_MAIN)
        amap_micro_raw = self.patchcore.score_map_at_size(frame_resized, settings.IMG_PC_MICRO)
        amap_micro     = PatchCoreModel.micro_peak_map(amap_micro_raw)

        # Resize ke ukuran frame
        h, w = frame_resized.shape[:2]
        amap_main  = cv2.resize(amap_main,  (w, h), interpolation=cv2.INTER_CUBIC)
        amap_micro = cv2.resize(amap_micro, (w, h), interpolation=cv2.INTER_CUBIC)

        # ── 4. Marking & line mask ─────────────────────────────────────────
        marking_mask    = _runway_marking_mask(frame_resized, runway_mask)
        line_mask       = _detect_marking_lines(marking_mask, (h, w))
        marking_dilated = cv2.dilate(
            marking_mask, np.ones((7, 7), np.uint8), iterations=1
        )

        # ── 5. Fuse + mask ke runway core ──────────────────────────────────
        amap = _fuse_maps(amap_main, amap_micro, marking_mask, line_mask)
        amap[runway_core == 0] = 0.0

        # Normalisasi ke [0, 1] berdasarkan nilai di runway core
        core_vals = amap[runway_core == 1]
        if core_vals.size > 0 and core_vals.max() > 0:
            amap = amap / core_vals.max()
            core_vals = amap[runway_core == 1]

        # ── 6–7. Dual-region detection ─────────────────────────────────────
        bboxes = []
        if core_vals.size > 0:
            gray_frame = cv2.cvtColor(frame_resized, cv2.COLOR_BGR2GRAY)
            bboxes = _detect_fod_regions(
                amap, frame_resized, gray_frame,
                runway_core, marking_dilated, line_mask
            )

        # Global anomaly score = max di runway core
        max_score = float(core_vals.max()) if core_vals.size > 0 else 0.0

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
            anomaly_score=round(min(max_score, 1.0), 4),
            bboxes=bboxes,
            runway_area_pct=round(runway_area_pct, 2)
        )


# ═════════════════════════════════════════════════════════════════════════════
# Helper functions — port langsung dari Kaggle notebook
# ═════════════════════════════════════════════════════════════════════════════

def _runway_marking_mask(img: np.ndarray, runway_mask: np.ndarray) -> np.ndarray:
    """
    Deteksi pixel marka runway (putih & kuning) menggunakan HSV.
    Identik dengan runway_marking_mask() di Kaggle notebook.
    """
    hsv    = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h, s, v = cv2.split(hsv)

    white  = (v > 200) & (s < 40)
    yellow = (h > 15)  & (h < 40) & (s > 90) & (v > 150)

    mask  = (white | yellow).astype(np.uint8)
    k_h   = cv2.getStructuringElement(cv2.MORPH_RECT, (19,  3))
    k_v   = cv2.getStructuringElement(cv2.MORPH_RECT, ( 3, 19))
    mask  = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k_h)
    mask  = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k_v)
    mask[runway_mask == 0] = 0

    return mask


def _detect_marking_lines(
    marking_mask: np.ndarray,
    img_shape: tuple,
    min_line_length: int = 50,
    max_line_gap: int = 20,
    line_thickness: int = 15
) -> np.ndarray:
    """
    Deteksi garis marka menggunakan Hough Transform probabilistik.
    Identik dengan detect_marking_lines() di Kaggle notebook.
    """
    lines_mask = np.zeros(img_shape, dtype=np.uint8)
    edges      = cv2.Canny(marking_mask, 50, 150, apertureSize=3)
    lines      = cv2.HoughLinesP(
        edges, 1, np.pi / 180,
        threshold=30,
        minLineLength=min_line_length,
        maxLineGap=max_line_gap
    )
    if lines is not None:
        for line in lines:
            x1, y1, x2, y2 = line[0]
            cv2.line(lines_mask, (x1, y1), (x2, y2), 1, thickness=line_thickness)

    lines_mask = cv2.dilate(lines_mask, np.ones((5, 5), np.uint8), iterations=2)
    return lines_mask


def _fuse_maps(
    main: np.ndarray,
    micro: np.ndarray,
    marking_mask: np.ndarray,
    line_mask: np.ndarray
) -> np.ndarray:
    """
    Gabungkan dual-scale anomaly map dengan penalti jarak ke marka & garis.
    Identik dengan fuse_maps() di Kaggle notebook.
    """
    fused = np.maximum(main, micro * 2.2)

    dist_mark   = distance_transform_edt(1 - marking_mask)
    weight_mark = np.clip(dist_mark / 22.0, 0.25, 1.0)

    dist_line   = distance_transform_edt(1 - line_mask)
    weight_line = np.clip(dist_line / 30.0, 0.1, 1.0)

    fused = fused * weight_mark * weight_line
    return fused.astype(np.float32)


def _detect_fod_regions(
    amap: np.ndarray,
    img: np.ndarray,
    gray: np.ndarray,
    runway_core: np.ndarray,
    marking_dilated: np.ndarray,
    line_mask: np.ndarray
) -> list[BoundingBox]:
    """
    Deteksi FOD dari anomaly map menggunakan dual-region strategy:
      - Blue region  : pixel dengan anomali di bawah 15th percentile (objek kecil/dingin)
      - Red  region  : pixel dengan anomali di atas  95th percentile (objek besar/panas)

    Identik dengan logika deteksi di process_single_image() Kaggle notebook.
    """
    core_vals = amap[runway_core == 1]
    orig_h    = img.shape[0]
    raw_boxes = []   # list of (x, y, w, h) int sebelum NMS

    # ── Blue region (low anomaly — 15th percentile) ──────────────────────
    thr_blue  = float(np.percentile(core_vals, 15))
    blue_mask = ((amap <= thr_blue) & (runway_core == 1)).astype(np.uint8)
    labeled_b, num_b = label(blue_mask)

    for i in range(1, num_b + 1):
        region = (labeled_b == i).astype(np.uint8)
        ys, xs = np.where(region)
        if len(xs) < 20:
            continue
        if len(xs) > settings.MAX_BLUE_AREA:
            continue

        x1, x2, y1, y2 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
        pred, *_ = _classify_region(
            region, (x1, y1, x2, y2), img,
            marking_dilated, gray, orig_h,
            source='blue', line_mask=line_mask
        )
        if pred == "FOD":
            raw_boxes.append((x1, y1, x2 - x1 + 1, y2 - y1 + 1))

    # ── Red region (high anomaly — 95th percentile) ──────────────────────
    thr_red  = float(np.percentile(core_vals, 95))
    red_mask = ((amap >= thr_red) & (runway_core == 1)).astype(np.uint8)
    labeled_r, num_r = label(red_mask)

    for i in range(1, num_r + 1):
        region = (labeled_r == i).astype(np.uint8)
        ys, xs = np.where(region)
        if len(xs) < 20:
            continue
        if len(xs) < settings.MIN_RED_AREA:
            continue

        x1, x2, y1, y2 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())

        # Solidity (menggunakan contour convex hull)
        contours, _ = cv2.findContours(
            region, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        if not contours:
            continue
        cnt       = max(contours, key=cv2.contourArea)
        hull_area = cv2.contourArea(cv2.convexHull(cnt))
        solidity  = len(xs) / hull_area if hull_area > 0 else 0.0

        pred, overlap, aspect, compact, contrast, hsv_avg, dist_score, eccentricity, _, _ = \
            _classify_region(
                region, (x1, y1, x2, y2), img,
                marking_dilated, gray, orig_h,
                source='red', line_mask=line_mask
            )

        # Extra filtering khusus red region (identik notebook)
        if pred == "FOD":
            mean_amap        = float(amap[region == 1].mean())
            is_white_strict  = (hsv_avg[2] > 190 and hsv_avg[1] < 50)
            is_yellow_strict = (15 < hsv_avg[0] < 45 and hsv_avg[1] > 80 and hsv_avg[2] > 160)
            is_elongated     = (aspect > 3.5) and (compact < 0.3) and (eccentricity > 0.9)

            if (mean_amap < thr_red * 0.95 or
                    compact      < 0.35 or
                    aspect       > 3.5  or
                    dist_score   < 0.45 or
                    overlap      > 0.1  or
                    solidity     < 0.7  or
                    is_white_strict     or
                    is_yellow_strict    or
                    is_elongated):
                pred = "IGNORE"

        if pred == "FOD":
            raw_boxes.append((x1, y1, x2 - x1 + 1, y2 - y1 + 1))

    # ── NMS ──────────────────────────────────────────────────────────────
    kept = _non_max_suppression(raw_boxes, iou_threshold=0.5)

    return [
        BoundingBox(
            x=int(x), y=int(y), width=int(w), height=int(h),
            confidence=round(
                min(float(amap[y: y + h, x: x + w].mean()), 1.0), 4
            ),
            label="FOD"
        )
        for x, y, w, h in kept
    ]


def _classify_region(
    region_mask: np.ndarray,
    bbox: tuple,
    img: np.ndarray,
    marking_mask: np.ndarray,
    gray: np.ndarray,
    img_h: int,
    source: str,
    line_mask=None
):
    """
    Klasifikasi region sebagai FOD, MARKING, atau IGNORE.

    Returns:
        (label, overlap_ratio, aspect_ratio, compactness, contrast,
         (mean_h, mean_s, mean_v), distance_score, eccentricity,
         orientation, min_dist_to_line)

    Identik dengan classify_region() di Kaggle notebook.
    """
    x1, y1, x2, y2 = bbox
    region_area = int(region_mask.sum())

    if region_area == 0:
        return "IGNORE", 0, 0, 0, 0, (0, 0, 0), 0, 0, 0, 0

    w, h           = x2 - x1 + 1, y2 - y1 + 1
    aspect_ratio   = max(w, h) / max(min(w, h), 1)
    compactness    = region_area / (w * h) if w * h > 0 else 0

    overlap        = int((region_mask & marking_mask).sum())
    overlap_ratio  = overlap / region_area

    hsv            = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    pixels         = region_mask > 0
    mean_h = float(hsv[:, :, 0][pixels].mean()) if pixels.any() else 0.0
    mean_s = float(hsv[:, :, 1][pixels].mean()) if pixels.any() else 0.0
    mean_v = float(hsv[:, :, 2][pixels].mean()) if pixels.any() else 0.0

    is_white  = (mean_v > 200) and (mean_s < 40)
    is_yellow = (15 < mean_h < 40) and (mean_s > 90) and (mean_v > 150)

    gray_vals = gray[pixels]
    contrast  = float(gray_vals.std()) if len(gray_vals) > 0 else 0.0

    cy             = (y1 + y2) // 2
    distance_score = cy / img_h

    eccentricity, orientation = _region_elongation(region_mask)

    min_dist_to_line = float('inf')
    if line_mask is not None:
        dist_map         = distance_transform_edt(1 - line_mask)
        min_dist_to_line = float(dist_map[pixels].min()) if pixels.any() else float('inf')

    is_elongated = (aspect_ratio > 3.5) and (compactness < 0.3) and (eccentricity > 0.9)
    is_near_line = min_dist_to_line < 15

    # ── Aturan klasifikasi ────────────────────────────────────────────────
    if overlap_ratio > 0.2 or ((is_white or is_yellow) and (aspect_ratio > 2.5 or region_area > 300)):
        pred = "MARKING"
    elif is_elongated and is_near_line:
        pred = "IGNORE"
    elif contrast < 8 or region_area < 30:
        pred = "IGNORE"
    else:
        if source == 'blue':
            pred = "FOD" if (
                compactness    > 0.35 and
                aspect_ratio   < 3.5  and
                distance_score > 0.55
            ) else "IGNORE"
        else:
            pred = "FOD" if (
                compactness    > 0.25 and
                aspect_ratio   < 5.0  and
                distance_score > 0.4
            ) else "IGNORE"

    return (
        pred, overlap_ratio, aspect_ratio, compactness,
        contrast, (mean_h, mean_s, mean_v),
        distance_score, eccentricity, orientation, min_dist_to_line
    )


def _region_elongation(mask: np.ndarray) -> tuple[float, float]:
    """
    Hitung eccentricity dan orientation dari binary mask region.
    Identik dengan region_elongation_features() di Kaggle notebook.
    """
    moments = cv2.moments(mask.astype(np.uint8))
    if moments['mu20'] + moments['mu02'] == 0:
        return 0.0, 0.0

    if moments['mu20'] > moments['mu02']:
        ecc = float(np.sqrt(1 - (moments['mu02'] / (moments['mu20'] + 1e-6))))
    else:
        ecc = float(np.sqrt(1 - (moments['mu20'] / (moments['mu02'] + 1e-6))))

    ori = float(
        0.5 * np.arctan2(2 * moments['mu11'], moments['mu20'] - moments['mu02'])
    )
    return ecc, ori


def _non_max_suppression(boxes: list, iou_threshold: float = 0.5) -> list:
    """
    Non-Maximum Suppression berbasis area.
    Identik dengan non_max_suppression() di Kaggle notebook.
    """
    if not boxes:
        return []

    arr    = np.array(boxes, dtype=np.float32)
    x1, y1 = arr[:, 0], arr[:, 1]
    x2     = x1 + arr[:, 2]
    y2     = y1 + arr[:, 3]
    areas  = (x2 - x1 + 1) * (y2 - y1 + 1)
    order  = np.argsort(areas)[::-1]

    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(i)

        ix1 = np.maximum(x1[i], x1[order[1:]])
        iy1 = np.maximum(y1[i], y1[order[1:]])
        ix2 = np.minimum(x2[i], x2[order[1:]])
        iy2 = np.minimum(y2[i], y2[order[1:]])

        iw    = np.maximum(0.0, ix2 - ix1 + 1)
        ih    = np.maximum(0.0, iy2 - iy1 + 1)
        inter = iw * ih
        iou   = inter / (areas[i] + areas[order[1:]] - inter)

        order = order[np.where(iou <= iou_threshold)[0] + 1]

    return [tuple(arr[i].astype(int)) for i in keep]
