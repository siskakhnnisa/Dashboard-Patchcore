import pickle
import numpy as np
import cv2
import torch
import torch.nn.functional as F
import torchvision.transforms as T
from scipy.ndimage import gaussian_laplace, maximum_filter
from torchvision.models import wide_resnet50_2, Wide_ResNet50_2_Weights
from pathlib import Path
from app.core.logger import logger
from app.config import settings

# ══════════════════════════════════════════════════════════════════════════════
# DETERMINISTIC COMPUTE — wajib untuk reprodusibilitas maksimal
#
# 1. cuDNN deterministic: mencegah cuDNN memakai algoritma non-deterministic
#    yang lebih cepat tapi menghasilkan float berbeda tiap run (GPU).
# 2. torch.set_num_threads(1): memastikan operasi BLAS di CPU single-threaded.
#    Multi-threading pada matmul memakai floating-point non-associative addition
#    (hasil reduksi bergantung pada urutan thread) → hasil beda tiap run.
#    Dengan 1 thread, CPU matmul selalu bit-exact untuk run yang sama.
# 3. use_deterministic_algorithms: paksa semua op PyTorch pakai jalur deterministik
#    (warn_only=True agar tidak crash jika ada op yang belum punya jalur tersebut).
# ══════════════════════════════════════════════════════════════════════════════
torch.backends.cudnn.deterministic = True
torch.backends.cudnn.benchmark     = False
torch.set_num_threads(1)
torch.set_num_interop_threads(1)
try:
    torch.use_deterministic_algorithms(True, warn_only=True)
except TypeError:
    # PyTorch lama tidak support warn_only
    pass


class PatchCoreModel:

    def __init__(self, model_path: str):
        self.model_path = Path(model_path)
        self.device = torch.device(
            settings.DEVICE if torch.cuda.is_available() else "cpu"
        )

        self.pca             = None
        self.nn              = None
        self.feature_weights = [0.8, 1.0, 0.6]   # fallback; di-override dari pkl
        self.img_size        = 384
        self.is_loaded       = False

        self.backbone           = None
        self.f_l2, self.f_l3, self.f_l4 = [], [], []
        self._transform_cache: dict = {}   # cache transform per-size agar konsisten

    # ──────────────────────────────────────────────────────────────────────────
    def load(self):
        """Load .pkl (pca + nn + feature_weights) dan siapkan backbone."""
        import torchvision
        import numpy as np_ver
        import sklearn as sk_ver
        logger.info(f"Loading PatchCore model dari {self.model_path}")
        logger.info(
            f"[VERSION DIAGNOSTICS] "
            f"torch={torch.__version__} | "
            f"torchvision={torchvision.__version__} | "
            f"numpy={np_ver.__version__} | "
            f"sklearn={sk_ver.__version__} | "
            f"device={self.device} | "
            f"CUDA={torch.cuda.is_available()} | "
            f"num_threads={torch.get_num_threads()}"
        )
        logger.warning(
            "PERHATIAN: Jika notebook dijalankan di GPU (Kaggle) dan dashboard "
            "berjalan di CPU, hasil TIDAK AKAN IDENTIK karena GPU/CPU menghasilkan "
            "floating-point yang berbeda untuk operasi neural network (WideResNet50). "
            "Ini BUKAN bug kode — ini sifat IEEE 754 floating-point di hardware berbeda."
        )

        with open(self.model_path, "rb") as f:
            saved = pickle.load(f)

        self.pca      = saved["pca"]
        self.nn       = saved["nn"]
        self.img_size = saved.get("img_size", 384)

        if "feature_weights" in saved:
            self.feature_weights = saved["feature_weights"]   # tipe asli dari pkl
            logger.info(f"Feature weights dari model: {self.feature_weights}")
        else:
            logger.warning(
                "feature_weights tidak ada di pkl, pakai default [0.8, 1.0, 0.6]"
            )

        self.backbone = wide_resnet50_2(
            weights=Wide_ResNet50_2_Weights.IMAGENET1K_V1
        ).to(self.device).eval()

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
        logger.success(
            f"PatchCore loaded | device={self.device} | img_size={self.img_size}"
        )

    # ──────────────────────────────────────────────────────────────────────────
    def _build_transform(self, sz: int) -> T.Compose:
        """Buat (atau ambil dari cache) transform untuk ukuran sz.
        Cache memastikan objek transform yang sama dipakai setiap call,
        konsisten dengan notebook yang juga memanggil build_transform(sz) sekali
        lalu langsung memakainya."""
        if sz not in self._transform_cache:
            import torchvision
            # antialias=True: konsisten di semua versi torchvision (≥0.17 default True,
            # versi lama tidak ada antialias). Eksplisit agar tidak bergantung default.
            tv_version = tuple(int(x) for x in torchvision.__version__.split('.')[:2])
            if tv_version >= (0, 17):
                resize = T.Resize((sz, sz), antialias=True)
            else:
                resize = T.Resize((sz, sz))
            self._transform_cache[sz] = T.Compose([
                T.ToPILImage(),
                resize,
                T.ToTensor(),
                T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
            ])
        return self._transform_cache[sz]

    # ──────────────────────────────────────────────────────────────────────────
    @torch.no_grad()
    def score_map_at_size(self, frame_bgr: np.ndarray, sz: int) -> np.ndarray:
        """
        Extract feature map pada resolusi `sz` dan score seluruh patch secara
        batch (vectorized) — jauh lebih cepat dari looping per-pixel.

        Args:
            frame_bgr : frame BGR (numpy)
            sz        : ukuran resize sebelum forward (384 atau 768)

        Returns:
            amap : raw anomaly map float32, shape (H_feat, W_feat)
                   nilai adalah rata-rata jarak kNN (belum di-normalize ke 0-1)
        """
        if not self.is_loaded:
            raise RuntimeError("Model belum diload. Panggil load() dulu.")

        # Bersihkan hook buffer
        self.f_l2.clear()
        self.f_l3.clear()
        self.f_l4.clear()

        # Preprocess: BGR → RGB → resize sz × sz → normalize
        frame_rgb = frame_bgr[:, :, ::-1].copy()
        x = self._build_transform(sz)(frame_rgb).unsqueeze(0).to(self.device)

        # Forward pass (hook mengisi f_l2, f_l3, f_l4)
        self.backbone(x)

        # Fuse multi-scale features
        l2 = F.normalize(self.f_l2[0], dim=1)
        l3 = F.interpolate(
            F.normalize(self.f_l3[0], dim=1),
            l2.shape[-2:], mode="bilinear"
        )
        l4 = F.interpolate(
            F.normalize(self.f_l4[0], dim=1),
            l2.shape[-2:], mode="bilinear"
        )

        w = self.feature_weights
        feat = torch.cat([l2 * w[0], l3 * w[1], l4 * w[2]], dim=1)  # (1, C, H, W)

        # Batch scoring — identik dengan Kaggle notebook
        B, C, H, W = feat.shape
        patches = feat.flatten(2).permute(0, 2, 1).squeeze(0).cpu().numpy()  # (H*W, C)

        emb = self.pca.transform(patches)       # (H*W, n_components)
        dist, _ = self.nn.kneighbors(emb)        # sklearn kNN (identik reference)

        amap = dist.mean(axis=1).reshape(H, W)

        # Resize ke ukuran frame input (identik dengan patchcore_map di reference)
        amap = cv2.resize(amap, (frame_bgr.shape[1], frame_bgr.shape[0]),
                          interpolation=cv2.INTER_CUBIC)

        return amap

    # ──────────────────────────────────────────────────────────────────────────
    @staticmethod
    def micro_peak_map(amap: np.ndarray) -> np.ndarray:
        """
        Tingkatkan sinyal objek kecil menggunakan Laplacian-of-Gaussian.
        Hanya mempertahankan nilai di local maxima positif.

        Identik dengan fungsi micro_peak_map() di Kaggle notebook.
        """
        log       = -gaussian_laplace(amap, sigma=0.6)
        local_max = maximum_filter(log, size=3)
        out       = np.zeros_like(log)
        mask      = (log == local_max) & (log > 0)
        out[mask] = log[mask]
        return out

    # ──────────────────────────────────────────────────────────────────────────
    def score_frame(
        self,
        frame_bgr: np.ndarray,
        runway_mask: np.ndarray
    ) -> tuple[np.ndarray, float]:
        """
        Kompatibilitas backward dengan kode lama.
        Untuk pipeline baru gunakan score_map_at_size() secara langsung.
        """
        import cv2
        amap = self.score_map_at_size(frame_bgr, self.img_size)

        h, w = frame_bgr.shape[:2]
        amap_resized = cv2.resize(amap, (w, h), interpolation=cv2.INTER_CUBIC)

        # Mask ke runway
        amap_resized[(runway_mask == 0)] = 0.0

        # Normalisasi ke 0-1
        max_val = amap_resized.max()
        if max_val > 0:
            amap_norm = amap_resized / max_val
        else:
            amap_norm = amap_resized

        return amap_norm, float(amap_norm.max())
