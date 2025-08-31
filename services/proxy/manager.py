"""
SneakerSniper Proxy Manager
Intelligent proxy rotation and health monitoring
"""


import os
import asyncio
import json
import time
import logging
import random
import hashlib
from abc import ABC, abstractmethod
from collections import defaultdict
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import asdict
from datetime import datetime, timezone, timedelta

from services.proxy.utils.settings import SETTINGS
from services.proxy.utils.metrics import proxy_requests, proxy_inflight, proxy_health, proxy_latency, proxy_active_total, proxy_burned_total, proxy_cost_total
from services.proxy.keys import (
    proxy_detail_key,
    inflight_key,
    ACTIVE_PROXIES_SET,
    BURNED_PROXIES_SET,
    METRICS_HEALTH_HASH,
    METRICS_COST_BREAKDOWN_HASH,
    METRICS_COST_TODAY_KEY,
    FINAL_STATS_KEY,
    SYSTEM_ALERTS_CHANNEL,
)
from services.proxy.models import Proxy

try:
    import httpx
except ImportError:
    httpx = None  # type: ignore
try:
    import redis.asyncio as redis
except ImportError:
    redis = None  # type: ignore

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def proxy_id(p: "Proxy") -> str:
    basis = (p.username or p.url)
    sticky = p.sticky_session_id or "none"
    h = hashlib.sha256(basis.encode()).hexdigest()[:10]
    return f"{p.provider}:{p.proxy_type}:{sticky}:{h}"

def now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00","Z")

def redacted_auth(p: "Proxy") -> str:
    protocol, rest = p.url.split("://", 1)
    user = (p.username or "").split(":")[0] or "***"
    host = rest.split("@")[-1]
    return f"{protocol}://{user}:***@{host}"


class ProxyProvider(ABC):
    """Abstract base for proxy providers"""
    
    @abstractmethod
    async def get_proxies(self, count: int = 10) -> List[Proxy]:
        """Get new proxies from provider"""
        pass
    
    @abstractmethod
    async def rotate_ip(self, proxy: Proxy) -> Proxy:
        """Rotate IP for sticky session proxy"""
        pass

class BrightDataProvider(ProxyProvider):
    """Bright Data (Luminati) proxy provider"""
    
    def __init__(self, customer_id: str, password: str, zone: str):
        self.customer_id = customer_id
        self.password = password
        self.zone = zone
        self.base_url = f"http://zproxy.lum-superproxy.io:22225"
        
    async def get_proxies(self, count: int = 10) -> List[Proxy]:
        """Get ISP proxies from Bright Data"""
        proxies = []
        
        for i in range(count):
            # Generate sticky session ID
            session_id = f"session_{int(time.time())}_{i}"
            
            proxy = Proxy(
                url=self.base_url,
                provider="bright_data",
                proxy_type="isp",
                username=f"{self.customer_id}-zone-{self.zone}-session-{session_id}",
                password=self.password,
                sticky_session_id=session_id,
                location="us"
            )
            proxies.append(proxy)
            
        return proxies
    
    async def rotate_ip(self, proxy: Proxy) -> Proxy:
        """Rotate IP by changing session ID"""
        new_session_id = f"session_{int(time.time())}_{random.randint(1000, 9999)}"
        proxy.sticky_session_id = new_session_id
        proxy.username = f"{self.customer_id}-zone-{self.zone}-session-{new_session_id}"
        return proxy

class OxylabsProvider(ProxyProvider):
    """Oxylabs proxy provider"""
    
    def __init__(self, username: str, password: str):
        self.username = username
        self.password = password
        self.base_url = "http://pr.oxylabs.io:7777"
        
    async def get_proxies(self, count: int = 10) -> List[Proxy]:
        """Get residential proxies from Oxylabs"""
        proxies = []
        
        for i in range(count):
            proxy = Proxy(
                url=self.base_url,
                provider="oxylabs",
                proxy_type="residential",
                username=f"customer-{self.username}-cc-us-sessid-{int(time.time())}{i}",
                password=self.password,
                location="us"
            )
            proxies.append(proxy)
        return proxies
    
    async def rotate_ip(self, proxy: Proxy) -> Proxy:
        """Rotate IP by changing session in username"""
        if proxy.username:
            parts = proxy.username.split('-')
            parts[-1] = str(int(time.time())) + str(random.randint(100, 999))
            proxy.username = '-'.join(parts)
        return proxy

class ProxyManager:
    """Main proxy management service"""
    
    def __init__(self):
        self.redis_client = None  # type: ignore
        self.providers = {}  # type: ignore
        self.cost_tracker = defaultdict(float)
        self.http_client = httpx.AsyncClient(timeout=10.0) if httpx else None  # type: ignore
        
    async def start(self):
        """Start the proxy manager service"""
        logger.info("Starting SneakerSniper Proxy Manager...")
        
        # Connect to Redis
        if redis is None:
            logger.error("redis.asyncio is not installed.")
            return
        self.redis_client = await redis.from_url(
            SETTINGS.redis_url,
            encoding="utf-8",
            decode_responses=True
        )
        
        # Initialize providers from environment
        self._init_providers()
        
        # Load existing proxies
        await self._load_proxies()
        
        # Start background tasks
        asyncio.create_task(self._health_monitor())
        asyncio.create_task(self._cost_monitor())
        asyncio.create_task(self._rotation_scheduler())
        
        logger.info("Proxy Manager started successfully")
    
    def _init_providers(self):
        """Initialize proxy providers from config"""
        # In production, load from environment variables
        # Example initialization:
        if all(key in os.environ for key in ['BRIGHT_DATA_CUSTOMER', 'BRIGHT_DATA_PASSWORD', 'BRIGHT_DATA_ZONE']):
            self.providers['bright_data'] = BrightDataProvider(
                customer_id=os.environ['BRIGHT_DATA_CUSTOMER'],
                password=os.environ['BRIGHT_DATA_PASSWORD'],
                zone=os.environ['BRIGHT_DATA_ZONE']
            )
        
        if all(key in os.environ for key in ['OXYLABS_USERNAME', 'OXYLABS_PASSWORD']):
            self.providers['oxylabs'] = OxylabsProvider(
                username=os.environ['OXYLABS_USERNAME'],
                password=os.environ['OXYLABS_PASSWORD']
            )
    
    async def get_proxy(self, requirements: Optional[Dict[str, Any]] = None) -> Optional[Proxy]:
        """Get best available proxy based on requirements"""
        if self.redis_client is None:
            logger.error("Redis client is not initialized.")
            return None
        requirements = requirements or {}
        proxy_type = requirements.get('type', 'any')
        location = requirements.get('location', 'any')
        min_health_score = requirements.get('min_health_score', SETTINGS.min_health_score)

        # Get all active proxies
        proxy_ids = await self.redis_client.smembers(ACTIVE_PROXIES_SET)

        if not proxy_ids:
            # No proxies available, get new ones
            await self._provision_proxies(10)
            proxy_ids = await self.redis_client.smembers(ACTIVE_PROXIES_SET)

        # Score and sort proxies
        scored_proxies = []
        for pid in proxy_ids:
            proxy_data = await self.redis_client.hgetall(proxy_detail_key(pid))
            if not proxy_data:
                continue

            proxy = Proxy.from_dict(proxy_data)

            # Filter by requirements
            if proxy_type != 'any' and proxy.proxy_type != proxy_type:
                continue
            if location != 'any' and proxy.location != location:
                continue
            if proxy.health_score < min_health_score:
                continue

            scored_proxies.append((proxy.health_score, proxy))

        
        if not scored_proxies:
            logger.warning("No proxies match requirements")
            return None

        import random
        # ε-greedy weighted pick; avoid hotspotting
        if random.random() < SETTINGS.explore_rate and len(scored_proxies) > 1:
            weights = [max(1e-3, s) for s,_ in scored_proxies]
            pick = random.choices(scored_proxies, weights=weights, k=1)[0][1]
        else:
            scored_proxies.sort(key=lambda x: x[0], reverse=True)
            pick = scored_proxies[0][1]

        pid = proxy_id(pick)
        inflight_k = inflight_key(pid)
        inflight = await self.redis_client.incr(inflight_k)
        if inflight > requirements.get('max_inflight', SETTINGS.max_inflight):
            await self.redis_client.decr(inflight_k)
            logger.debug("Proxy at capacity; trying next candidate")
            scored_proxies = [sp for sp in scored_proxies if sp[1] is not pick]
            if not scored_proxies:
                return None
            weights = [max(1e-3, s) for s,_ in scored_proxies]
            pick = random.choices(scored_proxies, weights=weights, k=1)[0][1]
            pid = proxy_id(pick)
            inflight_k = inflight_key(pid)
            await self.redis_client.incr(inflight_k)

        await self.redis_client.hset(proxy_detail_key(pid), mapping={"last_used": now_utc_iso()})
        proxy_inflight.labels(proxy_id=pid).set(inflight)
        proxy_health.labels(proxy_id=pid, provider=pick.provider).set(pick.health_score)
        return pick

    
    async def report_usage(self, proxy: Proxy, success: bool, response_time: float,
                          bandwidth_mb: float = 0.0, error: Optional[str] = None):
        """Atomic stats + EWMA + metrics"""
        if self.redis_client is None:
            logger.error("Redis client is not initialized."); return
        pid = proxy_id(proxy)
        key = proxy_detail_key(pid)
        alpha = SETTINGS.ewma_alpha
        pipe = self.redis_client.pipeline()
        pipe.hincrby(key, "requests", 1)
        pipe.hincrby(key, "success" if success else "failures", 1)
        pipe.hincrbyfloat(key, "total_bandwidth_mb", bandwidth_mb)
        pipe.hset(key, mapping={"last_error": error or "", "last_used": now_utc_iso()})
        cur = None
        try:
            cur = await self.redis_client.hget(key, "response_time_ewma_ms")
        except Exception:
            cur = None
        ewma = float(cur) if cur is not None else response_time
        ewma = alpha * response_time + (1 - alpha) * ewma
        pipe.hset(key, "response_time_ewma_ms", ewma)
        pipe.decr(inflight_key(pid))
        await pipe.execute()

        # burn guard
        req = int(await self.redis_client.hget(key, "requests") or 0)
        fail = int(await self.redis_client.hget(key, "failures") or 0)
        failure_rate = (fail / req * 100) if req else 0
        if failure_rate > 30 and req > 10:
            await self._burn_proxy(proxy)

        # metrics
        host = "*"
        proxy_latency.labels(provider=proxy.provider, type=proxy.proxy_type, host=host).observe(response_time)
        if success:
            proxy_requests.labels(provider=proxy.provider, type=proxy.proxy_type, host=host, status="ok").inc()
        else:
            proxy_requests.labels(provider=proxy.provider, type=proxy.proxy_type, host=host, status="err").inc()
        proxy_cost_total.labels(provider=proxy.provider).inc(self._calculate_cost(proxy, bandwidth_mb))

    async def _provision_proxies(self, count: int):
        if self.redis_client is None:
            logger.error("Redis client is not initialized.")
            return
        """Provision new proxies from providers"""
        logger.info(f"Provisioning {count} new proxies")
        
        # Distribute across providers
        proxies_per_provider = count // len(self.providers) if self.providers else count
        
        for provider_name, provider in self.providers.items():
            try:
                new_proxies = await provider.get_proxies(proxies_per_provider)
                
                for proxy in new_proxies:
                    await self._save_proxy(proxy)
                    await self.redis_client.sadd(ACTIVE_PROXIES_SET, proxy_id(proxy))
                    
                logger.info(f"Provisioned {len(new_proxies)} proxies from {provider_name}")
                
            except Exception as e:
                logger.error(f"Failed to provision from {provider_name}: {e}")
    
    async def _save_proxy(self, proxy: Proxy):
        """Save proxy to Redis"""
        if self.redis_client is None:
            logger.error("Redis client is not initialized.")
            return
        await self.redis_client.hset(
            proxy_detail_key(proxy_id(proxy)),
            mapping=proxy.to_dict()
        )
    
    async def _burn_proxy(self, proxy: Proxy):
        if self.redis_client is None:
            logger.error("Redis client is not initialized.")
            return
        """Mark proxy as burned"""
        pid = proxy_id(proxy)
        logger.warning(f"Burning proxy {redacted_auth(proxy)} - {proxy.failure_rate:.1f}% failure rate")
        
        # Remove from active set
        await self.redis_client.srem(ACTIVE_PROXIES_SET, pid)
        await self.redis_client.sadd(BURNED_PROXIES_SET, pid)
        
        # Set expiry on proxy data (keep for 24h for analysis)
        await self.redis_client.expire(proxy_detail_key(pid), 86400)
        
        # Alert
        await self.redis_client.publish(
            SYSTEM_ALERTS_CHANNEL,
            json.dumps({
                "type": "alert",
                "payload": {
                    "message": f"Proxy burned: {proxy.provider} proxy with {proxy.failure_rate:.1f}% failure rate",
                    "severity": "warning",
                    "proxy_url": proxy.url
                }
            })
        )
    
    async def _health_monitor(self):
        if self.redis_client is None:
            logger.error("Redis client is not initialized.")
            return
        """Monitor proxy health periodically"""
        while True:
            try:
                await asyncio.sleep(300)  # Every 5 minutes
                
                active_proxies = await self.redis_client.smembers(ACTIVE_PROXIES_SET)
                healthy_count = 0
                unhealthy_count = 0
                
                for pid in active_proxies:
                    proxy_data = await self.redis_client.hgetall(proxy_detail_key(pid))
                    if not proxy_data:
                        continue
                        
                    proxy = Proxy.from_dict(proxy_data)
                    
                    if proxy.health_score < 50:
                        unhealthy_count += 1
                        # Consider burning very unhealthy proxies
                        if proxy.health_score < 20:
                            await self._burn_proxy(proxy)
                    else:
                        healthy_count += 1
                
                # Provision more if needed
                if healthy_count < 10:
                    await self._provision_proxies(20 - healthy_count)
                    
                # Update metrics
                await self.redis_client.hset(
                    METRICS_HEALTH_HASH,
                    mapping={
                        "healthy": healthy_count,
                        "unhealthy": unhealthy_count,
                        "total": len(active_proxies),
                        "last_check": datetime.now().isoformat()
                    }
                )
                
            except Exception as e:
                logger.error(f"Health monitor error: {e}")
    
    async def _cost_monitor(self):
        if self.redis_client is None:
            logger.error("Redis client is not initialized.")
            return
        """Monitor proxy costs"""
        while True:
            try:
                await asyncio.sleep(3600)  # Every hour
                
                # Calculate hourly costs
                hourly_costs = {}
                total_cost = 0
                
                for provider, cost in self.cost_tracker.items():
                    hourly_costs[provider] = round(cost, 2)
                    total_cost += cost
                
                # Reset hourly tracker
                self.cost_tracker.clear()
                
                # Update daily total
                daily_total = float(await self.redis_client.get(METRICS_COST_TODAY_KEY) or 0)
                daily_total += total_cost
                
                await self.redis_client.set(METRICS_COST_TODAY_KEY, daily_total)
                await self.redis_client.hset(
                    METRICS_COST_BREAKDOWN_HASH,
                    mapping=hourly_costs
                )
                
                # Alert if costs are high
                if total_cost > 5.0:  # $5/hour threshold
                    await self.redis_client.publish(
                        SYSTEM_ALERTS_CHANNEL,
                        json.dumps({
                            "type": "alert",
                            "payload": {
                                "message": f"⚠️ High proxy costs: ${total_cost:.2f}/hour",
                                "severity": "warning",
                                "breakdown": hourly_costs
                            }
                        })
                    )
                    
            except Exception as e:
                logger.error(f"Cost monitor error: {e}")
    
    async def _rotation_scheduler(self):
        if self.redis_client is None:
            logger.error("Redis client is not initialized.")
            return
        """Schedule proxy rotation for sticky sessions"""
        while True:
            try:
                await asyncio.sleep(600)  # Every 10 minutes
                
                active_proxies = await self.redis_client.smembers(ACTIVE_PROXIES_SET)
                
                for pid in active_proxies:
                    proxy_data = await self.redis_client.hgetall(proxy_detail_key(pid))
                    if not proxy_data:
                        continue
                        
                    proxy = Proxy.from_dict(proxy_data)
                    
                    # Rotate if sticky session is older than 15 minutes
                    if proxy.sticky_session_id and proxy.last_used:
                        age_minutes = (datetime.now() - proxy.last_used).total_seconds() / 60
                        if age_minutes > 15:
                            provider = self.providers.get(proxy.provider)
                            if provider:
                                rotated_proxy = await provider.rotate_ip(proxy)
                                await self._save_proxy(rotated_proxy)
                                logger.info(f"Rotated sticky session for {proxy.provider}")
                                
            except Exception as e:
                logger.error(f"Rotation scheduler error: {e}")
    
    def _calculate_cost(self, proxy: Proxy, bandwidth_mb: float) -> float:
        """Calculate cost for proxy usage"""
        # Cost model (example rates)
        cost_per_gb = {
            'residential': 15.0,  # $15/GB
            'isp': 3.0,          # $3/GB  
            'datacenter': 0.5    # $0.50/GB
        }
        
        base_rate = cost_per_gb.get(proxy.proxy_type, 1.0)
        bandwidth_cost = (bandwidth_mb / 1024) * base_rate
        
        # Add per-request cost for residential
        if proxy.proxy_type == 'residential':
            bandwidth_cost += 0.001  # $0.001 per request
            
        return bandwidth_cost
    
    async def _load_proxies(self):
        if self.redis_client is None:
            logger.error("Redis client is not initialized.")
            return
        """Load existing proxies from Redis"""
        active_count = await self.redis_client.scard(ACTIVE_PROXIES_SET)
        burned_count = await self.redis_client.scard(BURNED_PROXIES_SET)
        
        logger.info(f"Loaded {active_count} active proxies, {burned_count} burned"); proxy_active_total.set(active_count); proxy_burned_total.set(burned_count)
        
        # Ensure minimum proxy count
        if active_count < 10:
            await self._provision_proxies(20)
    
    async def get_stats(self) -> Dict[str, Any]:
        if self.redis_client is None:
            logger.error("Redis client is not initialized.")
            return {}
        """Get proxy statistics"""
        active_proxies = await self.redis_client.smembers(ACTIVE_PROXIES_SET)
        burned_proxies = await self.redis_client.smembers(BURNED_PROXIES_SET)
        
        stats = {
            'active': len(active_proxies),
            'burned': len(burned_proxies),
            'providers': list(self.providers.keys()),
            'cost_today': float(await self.redis_client.get(METRICS_COST_TODAY_KEY) or 0),
            'health_breakdown': {
                'excellent': 0,  # 90-100
                'good': 0,       # 70-89
                'fair': 0,       # 50-69
                'poor': 0        # <50
            }
        }
        
        # Analyze health scores
        for pid in active_proxies:
            proxy_data = await self.redis_client.hgetall(proxy_detail_key(pid))
            if proxy_data:
                proxy = Proxy.from_dict(proxy_data)
                score = proxy.health_score
                
                if score >= 90:
                    stats['health_breakdown']['excellent'] += 1
                elif score >= 70:
                    stats['health_breakdown']['good'] += 1
                elif score >= 50:
                    stats['health_breakdown']['fair'] += 1
                else:
                    stats['health_breakdown']['poor'] += 1
                    
        return stats
    
    async def shutdown(self):
        if self.redis_client is None:
            logger.error("Redis client is not initialized.")
            return
        """Gracefully shutdown the service"""
        logger.info("Shutting down Proxy Manager...")
        
        # Save final stats
        stats = await self.get_stats()
        await self.redis_client.set(
            FINAL_STATS_KEY,
            json.dumps(stats)
        )
        
        # Close connections
        if self.http_client is not None:
            await self.http_client.aclose()
        await self.redis_client.close()
        
        logger.info("Proxy Manager shutdown complete")

# HTTP proxy client wrapper
class ProxiedClient:
    """HTTP client with automatic proxy rotation"""
    
    def __init__(self, proxy_manager: ProxyManager):
        self.proxy_manager = proxy_manager
        
    async def request(self, method: str, url: str, **kwargs):  # type: ignore
        """Make HTTP request with proxy"""
        # Get a proxy
        proxy = await self.proxy_manager.get_proxy(kwargs.pop('proxy_requirements', {}))
        if not proxy:
            raise Exception("No proxy available")
            
        # Configure proxy
        proxies = {
            "http://": proxy.auth_url,
            "https://": proxy.auth_url
        }

        # Make request
        start_time = time.monotonic()
        success = False
        error = None
        response = None

        if httpx is None:
            raise ImportError("httpx is not installed.")

        try:
            async with httpx.AsyncClient(proxies=proxies, timeout=10.0) as client:
                response = await client.request(method, url, **kwargs)
                response.raise_for_status()
                success = True
                return response

        except Exception as e:
            error = str(e)
            raise

        finally:
            # Report usage
            response_time = (time.monotonic() - start_time) * 1000
            bandwidth_mb = len(response.content) / (1024 * 1024) if (success and response and hasattr(response, 'content')) else 0

            await self.proxy_manager.report_usage(
                proxy=proxy,
                success=success,
                response_time=response_time,
                bandwidth_mb=bandwidth_mb,
                error=error
            )

async def main():
    """Main entry point"""
    import os
    
    manager = ProxyManager()
    
    try:
        await manager.start()
        # Keep service running
        await asyncio.Event().wait()
    except KeyboardInterrupt:
        logger.info("Received shutdown signal")
    finally:
        await manager.shutdown()

if __name__ == "__main__":
    asyncio.run(main())