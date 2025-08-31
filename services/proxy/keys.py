"""
Centralized Redis key schema for the proxy service.
"""

from services.proxy.models import Proxy

# Key Prefixes
PREFIX = "snpd"

# Key Templates
PROXY_DETAIL_KEY = f"{PREFIX}:proxy:{{proxy_id}}"
INFLIGHT_KEY = f"{PREFIX}:proxy:{{proxy_id}}:inflight"

# Sets
ACTIVE_PROXIES_SET = f"{PREFIX}:proxies:active"
BURNED_PROXIES_SET = f"{PREFIX}:proxies:burned"

# Hashes
METRICS_HEALTH_HASH = f"{PREFIX}:metrics:proxy_health"
METRICS_COST_BREAKDOWN_HASH = f"{PREFIX}:metrics:proxy_cost_breakdown"

# Simple Keys
METRICS_COST_TODAY_KEY = f"{PREFIX}:metrics:proxy_cost_today"
FINAL_STATS_KEY = f"{PREFIX}:proxy_manager:final_stats"

# Channels
SYSTEM_ALERTS_CHANNEL = f"{PREFIX}:system_alerts"


def proxy_detail_key(proxy_id: str) -> str:
    return PROXY_DETAIL_KEY.format(proxy_id=proxy_id)

def inflight_key(proxy_id: str) -> str:
    return INFLIGHT_KEY.format(proxy_id=proxy_id)
