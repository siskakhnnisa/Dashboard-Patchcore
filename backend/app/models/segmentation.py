import torch
import numpy as np
import cv2
from pathlib import Path
from app.core.logger import logger
from app.config import settings

try:
    import segmentation_models_pytorch as smp
except ImportError:
    raise ImportError("Install dulu: pip install segmentation-models-pytorch")


class RunwaySegmentationModel:
    def _refine_mask(self, mask: np.ndarray) -> np.ndarray:
        """Refinemen mask tanpa erosi agresif, boundary bernilai 0.5"""
        kernel = np.ones((3,3), np.uint8)
        dilated = cv2.dilate(mask, kernel, iterations=1)
        eroded = cv2.erode(mask, kernel, iterations=1)
        boundary = dilated - eroded
        refined_mask = mask.astype(np.float32)
        refined_mask[boundary == 1] = 0.5
        return refined_mask

    IMG_SIZE = 512          # sama dengan training
    MASK_THRESHOLD = 0.5    # sama dengan training

    def __init__(self, model_path: str):
        self.model_path = Path(model_path)
        self.device = torch.device(
            settings.DEVICE if torch.cuda.is_available() else "cpu"
        )
        self.model = None
        self.is_loaded = False

    # ──────────────────────────────────────────────────────────────────────────
    def load(self):
        """Load .pth ke arsitektur UNet EfficientNet-B3"""
        logger.info(f"Loading segmentation model dari {self.model_path}")

        # Arsitektur HARUS sama persis dengan saat training
        self.model = smp.Unet(
            encoder_name="efficientnet-b3",
            encoder_weights=None,   # tidak perlu pretrained, kita load weights sendiri
            in_channels=3,
            classes=1
        )

        # Load state dict
        checkpoint = torch.load(
            self.model_path,
            map_location=self.device
        )

        # Handle berbagai format checkpoint
        if isinstance(checkpoint, dict) and "state_dict" in checkpoint:
            self.model.load_state_dict(checkpoint["state_dict"])
        elif isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
            self.model.load_state_dict(checkpoint["model_state_dict"])
        else:
            # Format langsung state_dict — sesuai torch.save(model.state_dict())
            self.model.load_state_dict(checkpoint)

        self.model.eval().to(self.device)
        self.is_loaded = True
        logger.success(f"Segmentation model loaded | device={self.device}")

    # ──────────────────────────────────────────────────────────────────────────
    def predict_mask(self, frame_bgr: np.ndarray) -> np.ndarray:
        """
        Prediksi runway mask dari frame.

        Args:
            frame_bgr : frame asli dari video (BGR numpy array)

        Returns:
            mask : binary numpy array (0 atau 1),
                   shape sama dengan frame input
        """
        if not self.is_loaded:
            raise RuntimeError("Model belum diload.")

        original_h, original_w = frame_bgr.shape[:2]

        # Preprocess — sama persis dengan training (infer_mask)
        x = self._preprocess(frame_bgr)

        # Inference
        with torch.no_grad():
            logits = self.model(x)
            prob = torch.sigmoid(logits)[0, 0].cpu().numpy()

        # Threshold — sama dengan training
        mask = (prob > self.MASK_THRESHOLD).astype(np.uint8)

        # Morphological post-processing — sama persis dengan training
        kernel_close = np.ones((7, 7), np.uint8)
        kernel_open  = np.ones((7, 7), np.uint8)
        kernel_erode = np.ones((5, 5), np.uint8)

        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel_close)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel_open)
        mask = cv2.erode(mask, kernel_erode)

        # Boundary refinement agar identik dengan training
        mask = self._refine_mask(mask)

        # Resize kembali ke ukuran frame asli
        mask = cv2.resize(
            mask, (original_w, original_h),
            interpolation=cv2.INTER_LINEAR
        )

        return mask  # nilai 0, 0.5, atau 1

    # ──────────────────────────────────────────────────────────────────────────
    def get_runway_area_percentage(self, mask: np.ndarray) -> float:
        """Hitung persentase area runway di frame (0-100)"""
        return float(np.count_nonzero(mask) / mask.size * 100)

    # ──────────────────────────────────────────────────────────────────────────
    def _preprocess(self, frame_bgr: np.ndarray) -> torch.Tensor:
        """
        Preprocess frame — sama persis dengan fungsi preprocess_seg() training.
        BGR → RGB → resize 512x512 → /255 → transpose → tensor
        """
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        img = cv2.resize(frame_rgb, (self.IMG_SIZE, self.IMG_SIZE))
        img = img.astype(np.float32) / 255.0
        img = img.transpose(2, 0, 1)                         # HWC → CHW
        tensor = torch.from_numpy(img).unsqueeze(0).to(self.device)
        return tensor