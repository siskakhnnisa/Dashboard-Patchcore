"""
Diagnostic: Menjalankan SATU frame melalui pipeline deteksi dan melaporkan
setiap langkah secara detail — untuk membandingkan dengan notebook.
"""
import warnings
warnings.filterwarnings("ignore")

import os, sys, time
import cv2
import numpy as np

# 1) Cek onnxruntime SEBELUM load pipeline
print("=" * 70)
print("DIAGNOSTIC: Pipeline Deteksi FOD — Step-by-Step")
print("=" * 70)

try:
    import onnxruntime as ort
    print(f"[OK] onnxruntime {ort.__version__} terinstall")
    print(f"     Providers: {ort.get_available_providers()}")
except ImportError:
    print("[FATAL] onnxruntime TIDAK TERINSTALL!")
    print("        SEMUA kandidat PatchCore akan lolos → false positive masif")
    print("        Fix: pip install onnxruntime")
    sys.exit(1)

import torch
import sklearn
print(f"\n[ENV] Python  : {sys.version}")
print(f"[ENV] PyTorch : {torch.__version__} ({'CUDA' if torch.cuda.is_available() else 'CPU'})")
print(f"[ENV] sklearn : {sklearn.__version__}")
print(f"[ENV] NumPy   : {np.__version__}")
print(f"[ENV] OpenCV  : {cv2.__version__}")
print(f"[ENV] Threads : {torch.get_num_threads()}")

# 2) Load pipeline
print("\n" + "=" * 70)
print("Loading pipeline...")
print("=" * 70)
from app.ml.inference import InferencePipeline
from app.config import settings

pipe = InferencePipeline()
pipe.load_models()

print(f"\n[CLASSIFIER CHECK]")
print(f"  classifier_session : {pipe.classifier_session is not None}")
print(f"  input_name         : {pipe.classifier_input_name}")
print(f"  output_name        : {pipe.classifier_output_name}")
print(f"  CONF_THRESHOLD     : {settings.CLASSIFIER_CONF_THRESHOLD}")

if pipe.classifier_session is None:
    print("\n  *** CRITICAL: Classifier TIDAK AKTIF! ***")
    print("  *** SEMUA kandidat PatchCore akan lolos tanpa verifikasi ***")
    print("  *** Ini menyebabkan FALSE POSITIVE MASIF ***")
else:
    print("  [OK] Classifier aktif — akan memverifikasi setiap kandidat")

# 3) Baca frame dari video
print("\n" + "=" * 70)
print("Membaca frame dari video test...")
print("=" * 70)

# Cari video test
video_dir = "uploads"
videos = [f for f in os.listdir(video_dir) if f.lower().endswith(('.mp4', '.avi'))]
if not videos:
    print("Tidak ada video di uploads/")
    sys.exit(1)

# Ambil video terkecil untuk cepat
videos_with_size = [(f, os.path.getsize(os.path.join(video_dir, f))) for f in videos]
videos_with_size.sort(key=lambda x: x[1])
test_video = os.path.join(video_dir, videos_with_size[0][0])
print(f"Video test: {test_video} ({videos_with_size[0][1] / 1e6:.1f} MB)")

cap = cv2.VideoCapture(test_video)
fps = cap.get(cv2.CAP_PROP_FPS)
total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
print(f"  Resolution: {w}x{h}, FPS: {fps}, Frames: {total}")

# Skip ke frame di tengah video (lebih representatif)
target_frame = total // 2
cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
ret, frame = cap.read()
cap.release()

if not ret:
    print("Gagal membaca frame!")
    sys.exit(1)

print(f"  Frame #{target_frame}: shape={frame.shape}, dtype={frame.dtype}")

# 4) Jalankan pipeline step-by-step (MANUAL, untuk diagnostik detail)
print("\n" + "=" * 70)
print("Menjalankan pipeline step-by-step...")
print("=" * 70)

from app.ml.patchcore import PatchCoreModel
from app.ml.inference import (
    _runway_marking_mask, _detect_marking_lines, _fuse_maps,
    _classify_region, _non_max_suppression,
    _preprocess_for_classifier, crop_with_margin,
    IMAGENET_MEAN, IMAGENET_STD
)
from scipy.ndimage import label

orig_h, orig_w = frame.shape[:2]

# STEP 1: Segmentasi
t0 = time.time()
runway_mask = pipe.segmentation.predict_mask(frame)
runway_core = pipe.segmentation.get_runway_core(runway_mask)
t1 = time.time()
runway_pct = np.count_nonzero(runway_mask) / runway_mask.size * 100
core_pct = np.count_nonzero(runway_core) / runway_core.size * 100
print(f"\nSTEP 1 — Segmentasi ({(t1-t0)*1000:.0f}ms)")
print(f"  runway_mask: {runway_mask.shape}, pixels={np.count_nonzero(runway_mask)} ({runway_pct:.1f}%)")
print(f"  runway_core: pixels={np.count_nonzero(runway_core)} ({core_pct:.1f}%)")

# STEP 2: PatchCore
t2 = time.time()
amap_main = pipe.patchcore.score_map_at_size(frame, settings.IMG_PC_MAIN)
amap_micro_raw = pipe.patchcore.score_map_at_size(frame, settings.IMG_PC_MICRO)
amap_micro = PatchCoreModel.micro_peak_map(amap_micro_raw)
t3 = time.time()
print(f"\nSTEP 2 — PatchCore dual-scale ({(t3-t2)*1000:.0f}ms)")
print(f"  amap_main : shape={amap_main.shape}, range=[{amap_main.min():.4f}, {amap_main.max():.4f}]")
print(f"  amap_micro: shape={amap_micro.shape}, range=[{amap_micro.min():.4f}, {amap_micro.max():.4f}]")

# STEP 3: Marking & fusion
marking_mask = _runway_marking_mask(frame, runway_mask)
line_mask = _detect_marking_lines(marking_mask, (orig_h, orig_w))
marking_mask_dilated = cv2.dilate(marking_mask, np.ones((7, 7), np.uint8), iterations=1)
print(f"\nSTEP 3 — Marking & Line suppression")
print(f"  marking_mask pixels: {np.count_nonzero(marking_mask)}")
print(f"  line_mask pixels   : {np.count_nonzero(line_mask)}")
print(f"  marking_dilated    : {np.count_nonzero(marking_mask_dilated)}")

# CRITICAL: cek Canny pada marking_mask
edges_test = cv2.Canny(marking_mask, 50, 150, apertureSize=3)
print(f"  Canny edges pixels : {np.count_nonzero(edges_test)}")
print(f"  marking_mask values: unique={np.unique(marking_mask)}")
if np.count_nonzero(edges_test) == 0:
    print(f"  ⚠ Canny menghasilkan 0 edges karena marking_mask bernilai 0/1 (bukan 0/255)")
    print(f"    → line_mask selalu kosong → weight_line tidak punya efek")
    print(f"    → SAMA seperti di notebook (bukan penyebab perbedaan)")

amap = _fuse_maps(amap_main, amap_micro, marking_mask, line_mask)
amap[runway_core == 0] = 0
core_vals = amap[runway_core == 1]
print(f"\n  fused_amap in core: range=[{core_vals.min():.4f}, {core_vals.max():.4f}], mean={core_vals.mean():.4f}")

# STEP 4: Deteksi region kandidat
gray_img = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
fod_boxes_blue = []
fod_boxes_red = []

if core_vals.size > 0:
    threshold_blue = float(np.percentile(core_vals, 15))
    threshold_red = float(np.percentile(core_vals, 95))
    print(f"\nSTEP 4 — Region detection")
    print(f"  threshold_blue (15th pct): {threshold_blue:.4f}")
    print(f"  threshold_red  (95th pct): {threshold_red:.4f}")

    # Blue region
    blue_mask = (amap <= threshold_blue).astype(np.uint8)
    blue_mask[runway_core == 0] = 0
    labeled_blue, num_blue = label(blue_mask)
    blue_candidates = 0
    for i in range(1, num_blue + 1):
        region_mask = (labeled_blue == i).astype(np.uint8)
        ys, xs = np.where(region_mask)
        if len(xs) < 20:
            continue
        x1, x2 = xs.min(), xs.max()
        y1, y2 = ys.min(), ys.max()
        area = len(xs)
        if area > settings.MAX_BLUE_AREA:
            continue
        blue_candidates += 1
        pred_label, *_ = _classify_region(
            region_mask, (x1, y1, x2, y2), frame, marking_mask_dilated,
            gray_img, orig_h, source='blue', line_mask=line_mask
        )
        if pred_label == "FOD":
            fod_boxes_blue.append((x1, y1, x2 - x1 + 1, y2 - y1 + 1))

    # Red region
    red_mask = (amap >= threshold_red).astype(np.uint8)
    red_mask[runway_core == 0] = 0
    labeled_red, num_red = label(red_mask)
    red_candidates = 0
    for i in range(1, num_red + 1):
        region_mask = (labeled_red == i).astype(np.uint8)
        ys, xs = np.where(region_mask)
        if len(xs) < 20:
            continue
        x1, x2 = xs.min(), xs.max()
        y1, y2 = ys.min(), ys.max()
        area = len(xs)
        if area < settings.MIN_RED_AREA:
            continue
        red_candidates += 1
        contours, _ = cv2.findContours(region_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue
        cnt = max(contours, key=cv2.contourArea)
        hull = cv2.convexHull(cnt)
        hull_area = cv2.contourArea(hull)
        solidity = area / hull_area if hull_area > 0 else 0
        pred_label, overlap, aspect, compact, contrast, hsv_avg, dist_score, \
            eccentricity, orientation, line_dist = _classify_region(
                region_mask, (x1, y1, x2, y2), frame, marking_mask_dilated,
                gray_img, orig_h, source='red', line_mask=line_mask
            )
        if pred_label == "FOD":
            mean_amap = float(amap[region_mask == 1].mean())
            is_white_strict = (hsv_avg[2] > 190 and hsv_avg[1] < 50)
            is_yellow_strict = (15 < hsv_avg[0] < 45 and hsv_avg[1] > 80 and hsv_avg[2] > 160)
            is_elongated = (aspect > 3.5) and (compact < 0.3) and (eccentricity > 0.9)
            if (mean_amap < threshold_red * 0.95 or compact < 0.35 or aspect > 3.5 or
                    dist_score < 0.45 or overlap > 0.1 or solidity < 0.7 or
                    is_white_strict or is_yellow_strict or is_elongated):
                pred_label = "IGNORE"
        if pred_label == "FOD":
            fod_boxes_red.append((x1, y1, x2 - x1 + 1, y2 - y1 + 1))

    print(f"\n  BLUE: {num_blue} regions total -> {blue_candidates} valid candidates -> {len(fod_boxes_blue)} FOD")
    print(f"  RED:  {num_red} regions total -> {red_candidates} valid candidates -> {len(fod_boxes_red)} FOD")

all_fod = fod_boxes_blue + fod_boxes_red
print(f"\n  Total FOD sebelum NMS: {len(all_fod)}")

# STEP 5: NMS
fod_boxes = _non_max_suppression(all_fod, iou_threshold=0.5)
print(f"  Total FOD setelah NMS: {len(fod_boxes)}")

# STEP 6: Classifier verification
print(f"\nSTEP 5 — Classifier EfficientNet-B3 ONNX verification")
print(f"  Classifier active: {pipe.classifier_session is not None}")

if pipe.classifier_session is not None:
    verified = []
    for idx, (x, y, w, h) in enumerate(fod_boxes):
        crop, (x1c, y1c, x2c, y2c), margin = crop_with_margin(frame, x, y, w, h)
        if crop.size == 0 or crop.shape[0] < 5 or crop.shape[1] < 5:
            print(f"  [{idx}] ({x},{y},{w},{h}) → SKIP (crop terlalu kecil)")
            continue

        input_tensor = _preprocess_for_classifier(crop)
        raw_output = pipe.classifier_session.run(
            [pipe.classifier_output_name],
            {pipe.classifier_input_name: input_tensor}
        )[0]

        prob_nonfod = float(raw_output[0])
        prob_fod = 1.0 - prob_nonfod
        confirmed = prob_nonfod < settings.CLASSIFIER_CONF_THRESHOLD

        status = "✓ FOD CONFIRMED" if confirmed else "✗ REJECTED (NONFOD)"
        print(f"  [{idx}] box=({x},{y},{w},{h}) margin={margin} crop={crop.shape} "
              f"P(NONFOD)={prob_nonfod:.4f} P(FOD)={prob_fod:.4f} → {status}")

        if confirmed:
            verified.append((x, y, w, h, prob_fod))

    print(f"\n  Kandidat: {len(fod_boxes)} → Classifier lolos: {len(verified)}")
    print(f"  Classifier menolak: {len(fod_boxes) - len(verified)} false positive!")
else:
    print(f"  *** CLASSIFIER TIDAK AKTIF ***")
    print(f"  *** SEMUA {len(fod_boxes)} kandidat LOLOS tanpa verifikasi ***")
    print(f"  *** INI PENYEBAB FALSE POSITIVE MASIF ***")

# 5) Full pipeline call
print("\n" + "=" * 70)
print("Menjalankan process_frame() lengkap...")
print("=" * 70)
t_start = time.time()
result = pipe.process_frame(frame)
t_end = time.time()
print(f"  Time: {(t_end-t_start)*1000:.0f}ms")
print(f"  Anomaly detected: {result.anomaly_detected}")
print(f"  Anomaly score   : {result.anomaly_score}")
print(f"  BBoxes           : {len(result.bboxes)}")
for b in result.bboxes:
    print(f"    ({b.x},{b.y},{b.width},{b.height}) conf={b.confidence} label={b.label}")

print("\n" + "=" * 70)
print("DIAGNOSTIC SELESAI")
print("=" * 70)
