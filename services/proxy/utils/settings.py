from dataclasses import dataclass
import os

@dataclass
class Settings:
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    min_health_score: int = int(os.getenv("PROXY_MIN_HEALTH", "70"))
    explore_rate: float = float(os.getenv("PROXY_EXPLORE_RATE", "0.08"))
    max_inflight: int = int(os.getenv("PROXY_MAX_INFLIGHT", "8"))
    ewma_alpha: float = float(os.getenv("PROXY_EWMA_ALPHA", "0.2"))
    cost_per_gb = {
        "residential": float(os.getenv("COST_GB_RES", "15.0")),
        "isp": float(os.getenv("COST_GB_ISP", "3.0")),
        "datacenter": float(os.getenv("COST_GB_DC", "0.5")),
    }

SETTINGS = Settings()
