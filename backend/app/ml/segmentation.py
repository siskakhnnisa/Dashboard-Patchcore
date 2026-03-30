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

    IMG_SIZE       = 512    # sama dengan training
    MASK_THRESHOLD = 0.5    # sama dengan training

    def __init__(self, model_path: str):
        self.model_path = Path(model_path)
        self.device = torch.device(
            settings.DEVICE if torch.cuda.is_available() else "cpu"
        )
        self.model     = None
        self.is_loaded = False

    # ──────────────────────────────────────────────────────────────────────────
    def load(self):
        """Load .pth ke arsitektur UNet EfficientNet-B3"""
        logger.info(f"Loading segmentation model dari {self.model_path}")

        self.model = smp.Unet(
            encoder_name="efficientnet-b3",
            encoder_weights=None,
            in_channels=3,
            classes=1
        )

        checkpoint = torch.load(self.model_path, map_location=self.device)

        if isinstance(checkpoint, dict) and "state_dict" in checkpoint:
            self.model.load_state_dict(checkpoint["state_dict"])
        elif isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
            self.model.load_state_dict(checkpoint["model_state_dict"])
        else:
            self.model.load_state_dict(checkpoint)

        self.model.eval().to(self.device)
        self.is_loaded = True
        logger.success(f"Segmentation model loaded | device={self.device}")

    # ──────────────────────────────────────────────────────────────────────────
    def predict_mask(self, frame_bgr: np.ndarray) -> np.ndarray:
        """
        Prediksi runway mask dari frame.

        Post-processing identik dengan infer_runway_mask() di Kaggle notebook:
          - MORPH_CLOSE kernel (21, 21)

        Returns:
            mask : binary numpy array (0 atau 1), shape sama dengan frame input
        """
        if not self.is_loaded:
            raise RuntimeError("Model belum diload.")

        original_h, original_w = frame_bgr.shape[:2]

        x = self._preprocess(frame_bgr)

        with torch.no_grad():
            logits = self.model(x)
            prob   = torch.sigmoid(logits)[0, 0].cpu().numpy()

        # Threshold
        mask = (prob > self.MASK_THRESHOLD).astype(np.uint8)

        # Post-processing — identik dengan Kaggle notebook
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((21, 21), np.uint8))

        # Resize ke frame asli
        mask = cv2.resize(mask, (original_w, original_h), interpolation=cv2.INTER_NEAREST)

        return mask  # binary: 0 atau 1

    # ──────────────────────────────────────────────────────────────────────────
    def get_runway_core(self, mask: np.ndarray) -> np.ndarray:
        """
        Erode runway mask untuk mendapatkan area inti runway (tanpa tepi).
        Digunakan untuk meng-mask anomaly map agar minim false positive di batas.

        Identik dengan refine_runway_core() di Kaggle notebook:
            cv2.erode(mask, np.ones((35, 35), np.uint8))
        """
        return cv2.erode(mask, np.ones((35, 35), np.uint8))

    # ──────────────────────────────────────────────────────────────────────────
    def get_runway_area_percentage(self, mask: np.ndarray) -> float:
        """Hitung persentase area runway di frame (0-100)"""
        return float(np.count_nonzero(mask) / mask.size * 100)

    # ──────────────────────────────────────────────────────────────────────────
    def _preprocess(self, frame_bgr: np.ndarray) -> torch.Tensor:
        """
        Preprocess frame — identik dengan preprocess_seg() di Kaggle notebook.
        BGR → RGB → resize 512×512 → /255 → CHW → tensor
        """
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        img       = cv2.resize(frame_rgb, (self.IMG_SIZE, self.IMG_SIZE))
        img       = img.astype(np.float32) / 255.0
        img       = img.transpose(2, 0, 1)   # HWC → CHW
        tensor    = torch.from_numpy(img).unsqueeze(0).to(self.device)
        return tensor
