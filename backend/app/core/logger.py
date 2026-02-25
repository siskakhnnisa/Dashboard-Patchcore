import sys
from loguru import logger

logger.remove()
logger.add(
    sys.stdout,
    format="<green>{time:HH:mm:ss}</green> | <level>{level}</level> | {message}",
    level="DEBUG"
)
logger.add(
    "logs/fod_system.log",
    rotation="10 MB",
    level="INFO"
)