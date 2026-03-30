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

from app.ml.patchcore import PatchCoreModel
from app.ml.segmentation import RunwaySegmentationModel
from app.schemas.detection import BoundingBox, DetectionResult
from app.config import settings

try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None

from app.core.logger import logger


# ═════════════════════════════════════════════════════════════════════════════
class InferencePipeline:

    def __init__(self):
        self.patchcore    = PatchCoreModel(settings.PATCHCORE_MODEL_PATH)
        self.segmentation = RunwaySegmentationModel(settings.SEGMENTATION_MODEL_PATH)
        self.threshold    = settings.ANOMALY_THRESHOLD
        self._frame_count = 0
        self.yolo_model = None
        if YOLO is not None and settings.YOLO_MODEL_PATH:
            try:
                self.yolo_model = YOLO(settings.YOLO_MODEL_PATH)
            except Exception as e:
                logger.warning(f"Gagal load YOLO model: {e}")

    # ──────────────────────────────────────────────────────────────────────────
    def load_models(self):
        """Load semua model — dipanggil sekali saat startup FastAPI."""
        logger.info("Loading semua model ke memori...")
        self.segmentation.load()
        self.patchcore.load()
        if YOLO is not None and settings.YOLO_MODEL_PATH:
            try:
                self.yolo_model = YOLO(settings.YOLO_MODEL_PATH)
                logger.info(f"YOLO model loaded from {settings.YOLO_MODEL_PATH}")
            except Exception as e:
                logger.warning(f"Gagal load YOLO model: {e}")
        logger.success("Semua model siap digunakan")

    # ──────────────────────────────────────────────────────────────────────────
    def process_frame(self, frame: np.ndarray) -> DetectionResult:
        """
        Pipeline video identik dengan pipeline image (PatchCore + YOLO verification).
        """
        t0 = time.time()
        self._frame_count += 1

        # Resize frame ke ukuran standar (identik image pipeline)
        frame_resized = cv2.resize(frame, (settings.FRAME_WIDTH, settings.FRAME_HEIGHT))
        orig_h, orig_w = frame_resized.shape[:2]

        # STEP 1: Segmentasi runway
        runway_mask = self.segmentation.predict_mask(frame_resized)
        runway_core = self.segmentation.get_runway_core(runway_mask)
        runway_area_pct = self.segmentation.get_runway_area_percentage(runway_mask)

        # STEP 2: Anomaly map PatchCore
        #   score_map_at_size mengembalikan amap yang sudah di-resize ke ukuran frame
        #   (identik dengan patchcore_map di reference)
        amap_main      = self.patchcore.score_map_at_size(frame_resized, settings.IMG_PC_MAIN)
        amap_micro_raw = self.patchcore.score_map_at_size(frame_resized, settings.IMG_PC_MICRO)
        amap_micro     = PatchCoreModel.micro_peak_map(amap_micro_raw)

        # STEP 3: Marking mask & fusi
        h, w = frame_resized.shape[:2]
        marking_mask         = _runway_marking_mask(frame_resized, runway_mask)
        line_mask            = _detect_marking_lines(marking_mask, (h, w))
        marking_mask_dilated = cv2.dilate(marking_mask, np.ones((7, 7), np.uint8), iterations=1)

        amap = _fuse_maps(amap_main, amap_micro, marking_mask, line_mask)
        amap[runway_core == 0] = 0

        core_vals = amap[runway_core == 1]
        gray_img  = cv2.cvtColor(frame_resized, cv2.COLOR_BGR2GRAY)
        fod_boxes = []

        # STEP 4: Deteksi region kandidat FOD (PatchCore)
        if core_vals.size > 0:
            # BLUE REGION (anomali rendah)
            threshold_blue = float(np.percentile(core_vals, 15))
            blue_mask      = (amap <= threshold_blue).astype(np.uint8)
            blue_mask[runway_core == 0] = 0
            labeled_blue, num_blue = label(blue_mask)
            for i in range(1, num_blue + 1):
                region_mask = (labeled_blue == i).astype(np.uint8)
                ys, xs = np.where(region_mask)
                if len(xs) < 20:
                    continue
                x1, x2 = xs.min(), xs.max()
                y1, y2 = ys.min(), ys.max()
                area    = len(xs)
                if area > getattr(settings, 'MAX_BLUE_AREA', 2000):
                    continue
                pred_label, *_ = _classify_region(
                    region_mask, (x1, y1, x2, y2), frame_resized, marking_mask_dilated,
                    gray_img, orig_h, source='blue', line_mask=line_mask
                )
                if pred_label == "FOD":
                    fod_boxes.append((x1, y1, x2 - x1 + 1, y2 - y1 + 1))

            # RED REGION (anomali tinggi)
            threshold_red = float(np.percentile(core_vals, 95))
            red_mask      = (amap >= threshold_red).astype(np.uint8)
            red_mask[runway_core == 0] = 0
            labeled_red, num_red = label(red_mask)
            for i in range(1, num_red + 1):
                region_mask = (labeled_red == i).astype(np.uint8)
                ys, xs = np.where(region_mask)
                if len(xs) < 20:
                    continue
                x1, x2 = xs.min(), xs.max()
                y1, y2 = ys.min(), ys.max()
                area    = len(xs)
                if area < getattr(settings, 'MIN_RED_AREA', 2000):
                    continue
                # Hitung solidity
                contours, _ = cv2.findContours(
                    region_mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
                )
                if not contours:
                    continue
                cnt       = max(contours, key=cv2.contourArea)
                hull      = cv2.convexHull(cnt)
                hull_area = cv2.contourArea(hull)
                solidity  = area / hull_area if hull_area > 0 else 0
                pred_label, overlap, aspect, compact, contrast, hsv_avg, dist_score, \
                    eccentricity, orientation, line_dist = _classify_region(
                        region_mask, (x1, y1, x2, y2), frame_resized, marking_mask_dilated,
                        gray_img, orig_h, source='red', line_mask=line_mask
                    )
                if pred_label == "FOD":
                    mean_amap        = float(amap[region_mask == 1].mean())
                    is_white_strict  = (hsv_avg[2] > 190 and hsv_avg[1] < 50)
                    is_yellow_strict = (15 < hsv_avg[0] < 45 and hsv_avg[1] > 80 and hsv_avg[2] > 160)
                    is_elongated     = (aspect > 3.5) and (compact < 0.3) and (eccentricity > 0.9)
                    if (mean_amap < threshold_red * 0.95 or compact < 0.35 or aspect > 3.5 or
                            dist_score < 0.45 or overlap > 0.1 or solidity < 0.7 or
                            is_white_strict or is_yellow_strict or is_elongated):
                        pred_label = "IGNORE"
                if pred_label == "FOD":
                    fod_boxes.append((x1, y1, x2 - x1 + 1, y2 - y1 + 1))

        # NMS
        fod_boxes = _non_max_suppression(fod_boxes, iou_threshold=0.5)

        # STEP 5: Verifikasi YOLO (jika model YOLO tersedia)
        verified = []
        if hasattr(self, 'yolo_model') and self.yolo_model is not None:
            for (x, y, w, h) in fod_boxes:
                crop, (x1c, y1c, x2c, y2c), margin_used = crop_with_margin(frame_resized, x, y, w, h)
                if crop.size == 0 or crop.shape[0] < 5 or crop.shape[1] < 5:
                    continue
                conf_thr = settings.YOLO_CONF_THRESHOLD
                results    = self.yolo_model.predict(source=crop, conf=conf_thr, verbose=False)
                detections = results[0].boxes if hasattr(results[0], 'boxes') else []
                fod_confirmed = False
                best_conf     = 0.0
                best_yolo_box = None
                if detections is not None and len(detections) > 0:
                    for det in detections:
                        cls_id = int(det.cls[0])
                        conf   = float(det.conf[0])
                        if cls_id == 0 and conf >= conf_thr:
                            if conf > best_conf:
                                best_conf = conf
                                bx1, by1, bx2, by2 = det.xyxy[0].tolist()
                                best_yolo_box = (int(bx1), int(by1), int(bx2), int(by2))
                            fod_confirmed = True
                if fod_confirmed and best_yolo_box is not None:
                    bx1, by1, bx2, by2 = best_yolo_box
                    abs_x1 = x1c + bx1
                    abs_y1 = y1c + by1
                    abs_x2 = x1c + bx2
                    abs_y2 = y1c + by2
                    verified.append(BoundingBox(
                        x=int(abs_x1), y=int(abs_y1), width=int(abs_x2-abs_x1), height=int(abs_y2-abs_y1),
                        confidence=round(best_conf, 4), label="FOD"
                    ))
            bboxes = verified
        else:
            bboxes = [
                BoundingBox(x=int(x), y=int(y), width=int(w), height=int(h), confidence=1.0, label="FOD")
                for (x, y, w, h) in fod_boxes
            ]

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


def compute_adaptive_margin(w, h, fixed=60, ratio=0.8, max_margin=250):
    dynamic = ratio * max(w, h)
    margin  = int(min(max(fixed, dynamic), max_margin))
    return margin

def crop_with_margin(img, x, y, w, h):
    img_h, img_w = img.shape[:2]
    margin = compute_adaptive_margin(w, h)
    x1c = max(0, x - margin)
    y1c = max(0, y - margin)
    x2c = min(img_w, x + w + margin)
    y2c = min(img_h, y + h + margin)
    crop = img[y1c:y2c, x1c:x2c].copy()
    return crop, (x1c, y1c, x2c, y2c), margin


# ═════════════════════════════════════════════════════════════════════════════
# Helper functions — port langsung dari Kaggle notebook
# ═════════════════════════════════════════════════════════════════════════════

def _runway_marking_mask(img: np.ndarray, runway_mask: np.ndarray) -> np.ndarray:
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
    fused = np.maximum(main, micro * 2.2)

    dist_mark   = distance_transform_edt(1 - marking_mask)
    weight_mark = np.clip(dist_mark / 22.0, 0.25, 1.0)

    dist_line   = distance_transform_edt(1 - line_mask)
    weight_line = np.clip(dist_line / 30.0, 0.1, 1.0)

    fused = fused * weight_mark * weight_line
    return fused.astype(np.float32)


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
