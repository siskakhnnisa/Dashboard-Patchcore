import pickle
import numpy as np
import torch
import torch.nn.functional as F
import torchvision.transforms as T
from torchvision.models import wide_resnet50_2, Wide_ResNet50_2_Weights
from pathlib import Path
from app.core.logger import logger
from app.config import settings


class PatchCoreModel:

    def __init__(self, model_path: str):
        self.model_path = Path(model_path)
        self.device = torch.device(
            settings.DEVICE if torch.cuda.is_available() else "cpu"
        )

        # Komponen model (diisi saat load())
        self.pca = None
        self.nn  = None
        self.img_size = 384
        self.is_loaded = False

        # Backbone WideResNet50_2 — sama persis dengan training
        self.backbone = None
        self.f_l2, self.f_l3, self.f_l4 = [], [], []

        # Transform — sama persis dengan training
        self.transform = T.Compose([
            T.ToPILImage(),
            T.Resize((384, 384)),
            T.ToTensor(),
            T.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225]
            )
        ])

        # Untuk normalisasi score ke 0-1
        self._score_min = None
        self._score_max = None

    # ──────────────────────────────────────────────────────────────────────────
    def load(self):
        """Load .pkl dan siapkan backbone ResNet18"""
        logger.info(f"Loading PatchCore model dari {self.model_path}")

        # Load PCA + NearestNeighbors dari .pkl
        with open(self.model_path, "rb") as f:
            saved = pickle.load(f)

        self.pca      = saved["pca"]
        self.nn       = saved["nn"]
        self.img_size = saved.get("img_size", 384)

        # Setup backbone WideResNet50_2 — sama dengan training
        self.backbone = wide_resnet50_2(
            weights=Wide_ResNet50_2_Weights.IMAGENET1K_V1
        ).to(self.device).eval()

        # Register hook — layer2, layer3, layer4
        self.backbone.layer2.register_forward_hook(
            lambda m, i, o: self.f_l2.append(o)
        )
        self.backbone.layer3.register_forward_hook(
            lambda m, i, o: self.f_l3.append(o)
        )
        self.backbone.layer4.register_forward_hook(
            lambda m, i, o: self.f_l4.append(o)
        )

        self.is_loaded = True
        logger.success(f"PatchCore loaded | device={self.device} | "
                       f"img_size={self.img_size}")

    # ──────────────────────────────────────────────────────────────────────────
    def extract_feature_map(self, frame_bgr: np.ndarray) -> torch.Tensor:
        """
        Extract feature map dari satu frame.
        Return shape: (C, H, W) — sama dengan proses training.
        """
        # Bersihkan list hook sebelum forward pass
        self.f_l2.clear()
        self.f_l3.clear()
        self.f_l4.clear()

        # Convert BGR → RGB lalu transform
        frame_rgb = frame_bgr[:, :, ::-1].copy()
        x = self.transform(frame_rgb).unsqueeze(0).to(self.device)

        with torch.no_grad():
            self.backbone(x)

        # Ambil output tiap layer
        f_l2 = F.normalize(self.f_l2[0], dim=1)
        f_l3 = F.interpolate(F.normalize(self.f_l3[0], dim=1), size=f_l2.shape[-2:], mode="bilinear", align_corners=False)
        f_l4 = F.interpolate(F.normalize(self.f_l4[0], dim=1), size=f_l2.shape[-2:], mode="bilinear", align_corners=False)

        # Weighted concatenation [0.8, 1.0, 0.6]
        weighted_feat = torch.cat([
            f_l2 * 0.8,
            f_l3 * 1.0,
            f_l4 * 0.6
        ], dim=1)[0].detach()
        return weighted_feat  # shape: (C, H, W)

    # ──────────────────────────────────────────────────────────────────────────
    def score_frame(
        self,
        frame_bgr: np.ndarray,
        runway_mask: np.ndarray
    ) -> tuple[np.ndarray, float]:
        """
        Score seluruh patch di area runway.

        Args:
            frame_bgr   : frame asli dari video (BGR)
            runway_mask : binary mask (0/1), shape sama dengan frame

        Returns:
            anomaly_map : heatmap score per-patch, shape (H_feat, W_feat)
            max_score   : float 0-1, score tertinggi di frame ini
        """
        if not self.is_loaded:
            raise RuntimeError("Model belum diload. Panggil load() dulu.")

        # Extract feature map
        feat = self.extract_feature_map(frame_bgr)
        C, H, W = feat.shape

        # Resize mask ke ukuran feature map
        mask_rs = self._resize_mask(runway_mask, H, W)

        # Score tiap patch di runway
        anomaly_map = np.zeros((H, W), dtype=np.float32)
        patch_scores = []

        for y in range(H):
            for x in range(W):
                if mask_rs[y, x] == 0:
                    continue  # skip non-runway

                vec = feat[:, y, x].cpu().numpy().reshape(1, -1)

                # PCA transform
                vec_pca = self.pca.transform(vec)

                # Nearest neighbor distance (cosine)
                dist, _ = self.nn.kneighbors(vec_pca)
                score = float(dist[0][0])

                anomaly_map[y, x] = score
                patch_scores.append(score)

        # Normalisasi score ke 0-1
        if patch_scores:
            max_score = self._normalize_score(max(patch_scores))
            anomaly_map = self._normalize_map(anomaly_map)
        else:
            max_score = 0.0

        return anomaly_map, max_score

    # ──────────────────────────────────────────────────────────────────────────
    def _resize_mask(self, mask: np.ndarray, H: int, W: int) -> np.ndarray:
        import cv2
        # mask bisa 0/1 atau 0/255 — normalize ke 0/1
        m = (mask > 0).astype(np.uint8)
        return cv2.resize(m, (W, H), interpolation=cv2.INTER_NEAREST)

    def _normalize_score(self, score: float) -> float:
        """
        Normalisasi distance cosine ke 0-1.
        Cosine distance range: 0.0 (identik) - 2.0 (berlawanan).
        Dalam praktik anomaly, biasanya 0.0 - 0.5.
        Sesuaikan MAX_DIST jika perlu.
        """
        MAX_DIST = 0.5
        return float(min(score / MAX_DIST, 1.0))

    def _normalize_map(self, anomaly_map: np.ndarray) -> np.ndarray:
        """Normalize heatmap ke 0-1"""
        max_val = anomaly_map.max()
        if max_val > 0:
            return anomaly_map / max_val
        return anomaly_map