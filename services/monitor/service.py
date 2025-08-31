"""
SneakerSniper Monitor Service
High-performance SKU monitoring with <250ms polling
"""

import asyncio
import json
import time
import httpx
import redis.asyncio as redis
from typing import Dict, Any, Optional
from dataclasses import dataclass
from datetime import datetime
import logging
import os

from db import StockDatabase

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class MonitorConfig:
    """Configuration for a monitor instance"""
    monitor_id: str
    sku: str
    retailer: str
    interval_ms: int
    webhook_url: Optional[str] = None
    
@dataclass
class ProductInfo:
    """Product information from retailer"""
    sku: str
    title: str
    price: float
    in_stock: bool
    variants: Dict[str, Any]
    image_url: Optional[str] = None
    product_url: Optional[str] = None

class RetailerMonitor:
    """Base class for retailer-specific monitors"""

    def __init__(self, client: httpx.AsyncClient):
        self.client = client
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }

    async def _request(self, method: str, url: str, **kwargs) -> Optional[httpx.Response]:
        """HTTP request helper with retry logic.

        Args:
            method: HTTP method to use.
            url: Endpoint URL.
            **kwargs: Additional request arguments.

        Returns:
            httpx.Response if successful, otherwise None.
        """
        for attempt in range(3):
            try:
                response = await self.client.request(method, url, headers=self.headers, **kwargs)
                response.raise_for_status()
                return response
            except httpx.HTTPError as e:
                logger.warning(
                    f"Request error {method} {url} (attempt {attempt + 1}/3): {e}"
                )
                await asyncio.sleep(0.5 * (attempt + 1))
        logger.error(f"Failed request {method} {url} after 3 attempts")
        return None
    
    async def check_stock(self, sku: str) -> ProductInfo:
        """Check stock for a specific SKU"""
        raise NotImplementedError

class ShopifyMonitor(RetailerMonitor):
    """Monitor for Shopify-based stores"""
    
    def __init__(self, client: httpx.AsyncClient, store_url: str):
        super().__init__(client)
        self.store_url = store_url.rstrip('/')
        
    async def check_stock(self, sku: str) -> ProductInfo:
        """Check Shopify product.json endpoint"""
        try:
            # Try product handle first
            url = f"{self.store_url}/products/{sku}.json"
            response = await self._request("GET", url, timeout=3.0)

            if response:
                data = response.json()
                product = data.get('product', {})

                # Check variant availability
                variants = product.get('variants', [])
                available_variants = [v for v in variants if v.get('available', False)]

                return ProductInfo(
                    sku=sku,
                    title=product.get('title', ''),
                    price=float(variants[0].get('price', 0)) if variants else 0,
                    in_stock=len(available_variants) > 0,
                    variants={v['id']: v for v in variants},
                    image_url=product.get('image', {}).get('src'),
                    product_url=f"{self.store_url}/products/{product.get('handle', sku)}"
                )

            # Product not found or error
            return ProductInfo(
                sku=sku,
                title=f"SKU: {sku}",
                price=0,
                in_stock=False,
                variants={}
            )
                
        except Exception as e:
            logger.error(f"Shopify monitor error for {sku}: {e}")
            return ProductInfo(
                sku=sku,
                title=f"SKU: {sku}",
                price=0,
                in_stock=False,
                variants={}
            )

class FootsitesMonitor(RetailerMonitor):
    """Monitor for Footlocker, Champs, etc."""
    
    async def check_stock(self, sku: str) -> ProductInfo:
        """Check Footsites API"""
        # Implementation would go here
        # For now, return mock data
        return ProductInfo(
            sku=sku,
            title=f"Footsites Product {sku}",
            price=150.00,
            in_stock=False,
            variants={}
        )


class SNKRSMonitor(RetailerMonitor):
    """Monitor for Nike SNKRS releases"""

    async def check_stock(self, sku: str) -> ProductInfo:
        """Check Nike product feed for style color"""
        try:
            params = {
                "filter": [
                    "marketplace(US)",
                    "language(en)",
                    "channelId(snkrs_web)",
                    f"styleColor({sku})",
                ]
            }
            url = "https://api.nike.com/product_feed/threads/v2/"
            response = await self._request("GET", url, params=params, timeout=5.0)
            if response:
                data = response.json()
                objects = data.get("objects", [])
                if objects:
                    product = objects[0].get("productInfo", [])[0]
                    skus = product.get("skus", [])
                    available = any(s.get("available", False) for s in skus)
                    price = product.get("merchPrice", {}).get("currentPrice", 0)
                    title = product.get("productContent", {}).get("title", f"SKU: {sku}")
                    image = product.get("imageUrls", {}).get("productImageUrl")
                    return ProductInfo(
                        sku=sku,
                        title=title,
                        price=float(price),
                        in_stock=available,
                        variants={s.get("id", f"variant-{i}"): s for i, s in enumerate(skus)},
                        image_url=image,
                        product_url=f"https://www.nike.com/launch/t/{sku}",
                    )
        except Exception as e:
            logger.error(f"SNKRS monitor error for {sku}: {e}")
        return ProductInfo(
            sku=sku,
            title=f"SKU: {sku}",
            price=0,
            in_stock=False,
            variants={},
        )


class FinishLineMonitor(RetailerMonitor):
    """Monitor for Finish Line"""

    async def check_stock(self, sku: str) -> ProductInfo:
        """Check Finish Line API"""
        try:
            url = f"https://www.finishline.com/store/api/browse/v1/stock/{sku}"
            response = await self._request("GET", url, timeout=5.0)
            if response:
                data = response.json()
                available = data.get("available", False)
                title = data.get("title", f"SKU: {sku}")
                price = float(data.get("price", 0))
                image = data.get("image")
                product_url = data.get("url")
                return ProductInfo(
                    sku=sku,
                    title=title,
                    price=price,
                    in_stock=available,
                    variants=data.get("variants", {}),
                    image_url=image,
                    product_url=product_url,
                )
        except Exception as e:
            logger.error(f"FinishLine monitor error for {sku}: {e}")
        return ProductInfo(
            sku=sku,
            title=f"SKU: {sku}",
            price=0,
            in_stock=False,
            variants={},
        )

class MonitorService:
    """Main monitoring service that manages all monitors"""
    
    def __init__(self):
        self.redis_client: Optional[redis.Redis] = None
        self.monitors: Dict[str, asyncio.Task] = {}
        self.http_client = httpx.AsyncClient(
            limits=httpx.Limits(max_keepalive_connections=25, max_connections=100),
            timeout=httpx.Timeout(5.0),
            http2=True
        )
        self.retailer_monitors = {
            'shopify': ShopifyMonitor(self.http_client, 'https://kith.com'),
            'footsites': FootsitesMonitor(self.http_client),
            'snkrs': SNKRSMonitor(self.http_client),
            'finishline': FinishLineMonitor(self.http_client),
        }
        db_config = {
            "host": os.getenv("DB_HOST", "localhost"),
            "port": int(os.getenv("DB_PORT", "3306")),
            "user": os.getenv("DB_USER", "sneakers"),
            "password": os.getenv("DB_PASSWORD", "sneakers"),
            "db": os.getenv("DB_NAME", "sneakersniper"),
        }
        self.db = StockDatabase(db_config)
        
    async def start(self):
        """Start the monitor service"""
        logger.info("Starting SneakerSniper Monitor Service...")

        # Connect to Redis
        self.redis_client = await redis.from_url(
            "redis://localhost:6379",
            encoding="utf-8",
            decode_responses=True
        )

        # Connect to MySQL
        await self.db.connect()
        
        # Subscribe to monitor commands
        pubsub = self.redis_client.pubsub()
        await pubsub.subscribe("monitor_commands")
        
        # Start command listener
        asyncio.create_task(self._command_listener(pubsub))
        
        # Load existing active monitors
        await self._load_active_monitors()
        
        logger.info("Monitor Service started successfully")
        
    async def _command_listener(self, pubsub):
        """Listen for monitor commands from Redis"""
        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    command = json.loads(message["data"])
                    await self._handle_command(command)
                except Exception as e:
                    logger.error(f"Error handling command: {e}")
    
    async def _handle_command(self, command: Dict[str, Any]):
        """Handle monitor commands"""
        action = command.get("action")
        
        if action == "start":
            monitor_data = command.get("monitor")
            config = MonitorConfig(
                monitor_id=monitor_data["monitor_id"],
                sku=monitor_data["sku"],
                retailer=monitor_data["retailer"],
                interval_ms=monitor_data["interval_ms"]
            )
            await self._start_monitor(config)
            
        elif action == "stop":
            monitor_id = command.get("monitor_id")
            await self._stop_monitor(monitor_id)

        elif action == "status":
            await self._publish_status()
    
    async def _start_monitor(self, config: MonitorConfig):
        """Start a new monitor task"""
        if config.monitor_id in self.monitors:
            logger.warning(f"Monitor {config.monitor_id} already running")
            return

        # Create monitor task
        task = asyncio.create_task(self._monitor_loop(config))
        self.monitors[config.monitor_id] = task
        await self._persist_monitor(config, status="active")

        logger.info(f"Started monitor {config.monitor_id} for SKU {config.sku}")
    
    async def _stop_monitor(self, monitor_id: str):
        """Stop a running monitor"""
        if monitor_id in self.monitors:
            self.monitors[monitor_id].cancel()
            del self.monitors[monitor_id]
            await self.redis_client.srem("active_monitors", monitor_id)
            await self.redis_client.hset(f"monitor:{monitor_id}", "status", "stopped")
            logger.info(f"Stopped monitor {monitor_id}")
    
    async def _monitor_loop(self, config: MonitorConfig):
        """Main monitoring loop for a SKU"""
        retailer_monitor = self.retailer_monitors.get(config.retailer)
        if not retailer_monitor:
            logger.error(f"Unknown retailer: {config.retailer}")
            return
            
        poll_count = 0
        last_status = None
        
        try:
            while True:
                start_time = time.time()
                
                # Check stock
                product_info = await retailer_monitor.check_stock(config.sku)
                
                # Calculate latency
                latency_ms = int((time.time() - start_time) * 1000)
                poll_count += 1
                
                # Detect status change
                if last_status is not None and last_status != product_info.in_stock:
                    if product_info.in_stock:
                        # Stock detected!
                        await self._handle_stock_alert(config, product_info)
                
                last_status = product_info.in_stock
                
                # Publish update to Redis
                update_data = {
                    "type": "monitor.update",
                    "payload": {
                        "monitor_id": config.monitor_id,
                        "sku": config.sku,
                        "status": product_info.title[:50],
                        "in_stock": product_info.in_stock,
                        "poll_count": poll_count,
                        "latency_ms": latency_ms,
                        "timestamp": datetime.now().isoformat()
                    }
                }
                
                await self.redis_client.publish(
                    "monitor_updates",
                    json.dumps(update_data)
                )
                
                # Update metrics
                await self._update_metrics(latency_ms)
                
                # Wait for next poll
                await asyncio.sleep(config.interval_ms / 1000.0)
                
        except asyncio.CancelledError:
            logger.info(f"Monitor {config.monitor_id} cancelled")
        except Exception as e:
            logger.error(f"Monitor {config.monitor_id} error: {e}")
            # Publish error
            await self.redis_client.publish(
                "system_alerts",
                json.dumps({
                    "type": "alert",
                    "payload": {
                        "message": f"Monitor {config.monitor_id} crashed: {str(e)}",
                        "severity": "error"
                    }
                })
            )
            await self.redis_client.hset(
                f"monitor:{config.monitor_id}", "status", "error"
            )
    
    async def _handle_stock_alert(self, config: MonitorConfig, product_info: ProductInfo):
        """Handle stock detection"""
        logger.info(f"STOCK ALERT: {product_info.sku} - {product_info.title}")
        
        # Create alert
        alert_data = {
            "monitor_id": config.monitor_id,
            "sku": product_info.sku,
            "title": product_info.title,
            "price": product_info.price,
            "variants": len(product_info.variants),
            "product_url": product_info.product_url,
            "image_url": product_info.image_url,
            "timestamp": datetime.now().isoformat()
        }
        
        # Store in Redis
        publish_task = self.redis_client.publish(
            "system_alerts",
            json.dumps({
                "type": "alert",
                "payload": {
                    "message": f"🚨 IN STOCK: {product_info.title} @ ${product_info.price}",
                    "severity": "success",
                    "data": alert_data
                }
            })
        )
        tasks = [
            self.redis_client.lpush("stock_alerts", json.dumps(alert_data)),
            publish_task,
            self.db.store_alert(alert_data),
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for res in results:
            if isinstance(res, Exception):
                logger.error(f"Alert dispatch error: {res}")
        
        # Trigger webhook if configured
        if config.webhook_url:
            asyncio.create_task(self._send_webhook(config.webhook_url, alert_data))
    
    async def _send_webhook(self, url: str, data: Dict[str, Any]):
        """Send webhook notification"""
        try:
            await self.http_client.post(url, json=data, timeout=5.0)
        except Exception as e:
            logger.error(f"Webhook failed: {e}")
    
    async def _update_metrics(self, latency_ms: int):
        """Update monitoring metrics"""
        # Update rolling average latency
        current_avg = int(await self.redis_client.get("metrics:avg_latency_ms") or 120)
        new_avg = int((current_avg * 0.95) + (latency_ms * 0.05))  # Exponential moving average
        await self.redis_client.set("metrics:avg_latency_ms", new_avg)

    async def _persist_monitor(self, config: MonitorConfig, status: str) -> None:
        """Persist monitor configuration to Redis"""
        await self.redis_client.sadd("active_monitors", config.monitor_id)
        await self.redis_client.hset(
            f"monitor:{config.monitor_id}",
            mapping={
                "sku": config.sku,
                "retailer": config.retailer,
                "interval_ms": config.interval_ms,
                "status": status,
            },
        )

    async def _publish_status(self) -> None:
        """Publish current monitor status to Redis"""
        payload = {
            monitor_id: {
                "running": not task.done(),
                "retailer": await self.redis_client.hget(f"monitor:{monitor_id}", "retailer"),
            }
            for monitor_id, task in self.monitors.items()
        }
        await self.redis_client.publish(
            "monitor_updates",
            json.dumps({"type": "monitor.status", "payload": payload}),
        )
    
    async def _load_active_monitors(self):
        """Load and restart active monitors from Redis"""
        active_monitor_ids = await self.redis_client.smembers("active_monitors")
        
        for monitor_id in active_monitor_ids:
            monitor_data = await self.redis_client.hgetall(f"monitor:{monitor_id}")
            if monitor_data and monitor_data.get("status") == "active":
                config = MonitorConfig(
                    monitor_id=monitor_id,
                    sku=monitor_data["sku"],
                    retailer=monitor_data["retailer"],
                    interval_ms=int(monitor_data["interval_ms"])
                )
                await self._start_monitor(config)
    
    async def shutdown(self):
        """Gracefully shutdown the service"""
        logger.info("Shutting down Monitor Service...")
        
        # Cancel all monitors
        for task in self.monitors.values():
            task.cancel()
        
        # Wait for tasks to complete
        await asyncio.gather(*self.monitors.values(), return_exceptions=True)
        
        # Close connections
        await self.http_client.aclose()
        await self.redis_client.close()
        await self.db.close()
        
        logger.info("Monitor Service shutdown complete")

async def main():
    """Main entry point"""
    service = MonitorService()
    
    try:
        await service.start()
        # Keep service running
        await asyncio.Event().wait()
    except KeyboardInterrupt:
        logger.info("Received shutdown signal")
    finally:
        await service.shutdown()

if __name__ == "__main__":
    asyncio.run(main())
