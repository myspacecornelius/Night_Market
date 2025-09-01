"""
SneakerSniper API Gateway
FastAPI service that coordinates all bot operations
"""

from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, List, Dict, Any
import uuid
import json
import asyncio
import time
from datetime import datetime, timedelta
import redis.asyncio as redis
from contextlib import asynccontextmanager
import logging
import os

# Import schemas and middleware
from schemas import (
    AuthRequest, AuthResponse, MonitorRequest, MonitorResponse,
    CheckoutBatchRequest, CheckoutBatchResponse, CheckoutTaskResponse,
    MetricsRequest, MetricsResponse, MetricsTimeframe, TaskStatus, MonitorStatus,
    ErrorResponse, ErrorDetail, BaseResponse, StockAlert, StockAlertResponse,
    NotificationPreferences, HeatMapEvent, LACESBalance,
    PredictionRequest, PredictionResponse, WSMessage
)
from middleware import (
    RequestLoggingMiddleware, ErrorHandlingMiddleware,
    SecurityMiddleware, cache_response, EnhancedRateLimitMiddleware, EnhancedCacheMiddleware
)
from prometheus_fastapi_instrumentator import Instrumentator

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Additional schema for command parsing
from pydantic import BaseModel, Field

class CommandParseRequest(BaseModel):
    prompt: str

class CommandParseResponse(BaseModel):
    type: str  # 'command', 'chat', or 'error'
    command: Optional[Dict[str, Any]] = None
    response: Optional[str] = None
    message: Optional[str] = None

# Security
security = HTTPBearer()

# Redis connection manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    app.state.redis = await redis.from_url(
        redis_url,
        encoding="utf-8",
        decode_responses=True
    )
    
    # Initialize background tasks
    app.state.background_tasks = set()
    
    logger.info("API Gateway started successfully")
    
    yield
    
    # Shutdown
    # Cancel background tasks
    for task in app.state.background_tasks:
        task.cancel()
    
    await app.state.redis.close()
    logger.info("API Gateway shutdown complete")

# Initialize FastAPI
app = FastAPI(
    title="SneakerSniper API",
    version="2.0.0",
    description="Advanced sneaker bot engine with real-time monitoring and automated checkout",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

# Add middleware in order (order matters!)
# 1. CORS (needs to be first)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining"]
)

# 2. Security headers
app.add_middleware(SecurityMiddleware)

# 3. Error handling
app.add_middleware(ErrorHandlingMiddleware)

# 4. Request logging
app.add_middleware(RequestLoggingMiddleware)

# Note: Rate limiting and caching will be added after Redis is initialized

@app.on_event("startup")
async def _rate_cache_startup():
    r = app.state.redis  # established in lifespan
    # Rate limiter first (protects the stack)
    app.add_middleware(
        EnhancedRateLimitMiddleware,
        redis=r,
        capacity_global=int(os.getenv("RATE_GLOBAL_BURST", "1000")),
        rate_global=int(os.getenv("RATE_GLOBAL_QPS", "1000")),
        capacity_route=int(os.getenv("RATE_ROUTE_BURST", "300")),
        rate_route=int(os.getenv("RATE_ROUTE_QPS", "300")),
        capacity_user=int(os.getenv("RATE_USER_BURST", "200")),
        rate_user=int(os.getenv("RATE_USER_QPS", "200")),
        capacity_ip=int(os.getenv("RATE_IP_BURST", "150")),
        rate_ip=int(os.getenv("RATE_IP_QPS", "150")),
        max_concurrency=int(os.getenv("MAX_CONCURRENCY", "200")),
        shed_threshold=int(os.getenv("SHED_THRESHOLD", "240")),
    )
    app.add_middleware(
        EnhancedCacheMiddleware,
        redis=r,
        secret=os.getenv("CACHE_HMAC_SECRET", "dev-secret"),
        default_ttl=int(os.getenv("CACHE_TTL", "60")),
        swr_ttl=int(os.getenv("CACHE_SWR_TTL", "300")),
    )
    # Add prometheus instrumentator
    Instrumentator().instrument(app).expose(app)
    
    logger.info("Dynamic middleware initialized")

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket

    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]

    async def send_personal_message(self, message: str, client_id: str):
        if client_id in self.active_connections:
            await self.active_connections[client_id].send_text(message)

    async def broadcast(self, message: str):
        for connection in self.active_connections.values():
            await connection.send_text(message)

manager = ConnectionManager()

# Dependency to get current user from token
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    # In production, validate token from Redis/DB
    # For now, just check if it exists
    if not token:
        raise HTTPException(status_code=401, detail="Invalid authentication")
    return {"user_id": "dev-user", "token": token}

# Command Parser (replaces Gemini AI)
class CommandParser:
    """Internal command parser to replace external AI dependency"""
    
    def parse(self, prompt: str) -> CommandParseResponse:
        prompt_lower = prompt.lower()
        
        # Monitor commands
        if any(word in prompt_lower for word in ["monitor", "watch", "track"]):
            # Extract SKU from prompt
            words = prompt.split()
            sku = None
            for i, word in enumerate(words):
                if word.lower() in ["sku", "shoe", "shoes", "product"]:
                    if i + 1 < len(words):
                        sku = words[i + 1]
                        break
            
            if not sku:
                # Try to find any word that looks like a SKU
                for word in words:
                    if len(word) > 5 and any(c.isdigit() for c in word):
                        sku = word
                        break
                    elif "travis" in word.lower() or "jordan" in word.lower():
                        sku = "-".join(words[words.index(word):words.index(word)+3])
                        break
            
            if sku:
                return CommandParseResponse(
                    type="command",
                    command={
                        "action": "start_monitor",
                        "parameters": {"sku": sku, "retailer": "shopify"}
                    }
                )
        
        # Checkout commands
        elif any(word in prompt_lower for word in ["checkout", "run", "fire", "cop"]):
            # Extract count
            count = 50  # default
            for word in prompt.split():
                if word.isdigit():
                    count = int(word)
                    break
            
            # Extract profile
            profile = "main-profile"
            if "profile" in prompt_lower:
                words = prompt.split()
                profile_idx = words.index("profile") if "profile" in words else -1
                if profile_idx > 0:
                    profile = words[profile_idx - 1]
            
            return CommandParseResponse(
                type="command",
                command={
                    "action": "fire_checkout",
                    "parameters": {
                        "task_count": count,
                        "profile_id": profile,
                        "retailer": "shopify"
                    }
                }
            )
        
        # Clear commands
        elif any(word in prompt_lower for word in ["clear", "stop", "reset", "kill"]):
            return CommandParseResponse(
                type="command",
                command={
                    "action": "clear_dashboard",
                    "parameters": {}
                }
            )
        
        # General chat
        else:
            return CommandParseResponse(
                type="chat",
                response=self._generate_chat_response(prompt)
            )
    
    def _generate_chat_response(self, prompt: str) -> str:
        """Generate contextual responses for general questions"""
        prompt_lower = prompt.lower()
        
        if "proxy" in prompt_lower:
            return "Proxy rotation is handled automatically. The system uses sticky residential proxies with 10-15 minute TTL from providers like Bright Data. Cost tracking ensures we stay under $0.05 per successful checkout."
        elif "captcha" in prompt_lower:
            return "CAPTCHA solving uses CapSolver as primary with a human farm fallback. Current solve rate is 98%+ with average solve time under 3 seconds."
        elif "success" in prompt_lower or "rate" in prompt_lower:
            return "Success rates vary by site. Shopify averages 65%+, Footsites around 50%, and SNKRS is more challenging at 20-30%. These improve with aged accounts and quality proxies."
        elif "how" in prompt_lower and "work" in prompt_lower:
            return "SneakerSniper uses a dual-mode approach: fast request-mode for speed and stealth browser mode for heavy anti-bot sites. Monitors poll every 200ms and trigger checkout tasks on stock detection."
        else:
            return "I can help you monitor products, run checkout tasks, or answer questions about the bot's operation. Try commands like 'monitor travis scott shoes' or 'run 100 checkouts'."

# Initialize command parser
command_parser = CommandParser()

# Routes
@app.get("/")
async def root():
    return {"status": "SneakerSniper API Online", "version": "1.0.0"}

@app.post("/api/auth/session", response_model=AuthResponse)
async def create_session(auth_request: AuthRequest):
    """Create a new session token"""
    try:
        token = str(uuid.uuid4())
        expires_at = datetime.now().timestamp() + 86400  # 24 hours
        
        # Store token in Redis
        await app.state.redis.setex(
            f"session:{token}",
            86400,
            json.dumps({
                "user_id": "dev-user", 
                "api_key": auth_request.api_key,
                "device_id": auth_request.device_id
            })
        )
        
        return AuthResponse(
            success=True,
            token=token,
            expires_at=datetime.fromtimestamp(expires_at),
            user_id="dev-user"
        )
    except Exception as e:
        logger.error(f"Session creation failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to create session")

@app.post("/api/commands/parse", response_model=CommandParseResponse)
async def parse_command(
    request: CommandParseRequest,
    current_user: dict = Depends(get_current_user)
):
    """Parse user command into executable action"""
    return command_parser.parse(request.prompt)

@app.post("/api/monitors", response_model=MonitorResponse)
async def create_monitor(
    request: MonitorRequest,
    current_user: dict = Depends(get_current_user)
):
    """Start a new product monitor"""
    try:
        monitor_id = str(uuid.uuid4())
        
        # Calculate estimated cost
        requests_per_hour = 3600000 / request.interval_ms
        proxy_cost_per_request = 0.00001  # $0.01 per 1000 requests
        estimated_cost = requests_per_hour * proxy_cost_per_request
        
        # Create monitor task in Redis
        monitor_data = {
            "monitor_id": monitor_id,
            "sku": request.sku,
            "retailer": request.retailer.value,
            "interval_ms": request.interval_ms,
            "size_filter": json.dumps(request.size_filter) if request.size_filter else None,
            "price_threshold": request.price_threshold,
            "keywords": json.dumps(request.keywords) if request.keywords else None,
            "webhook_url": request.webhook_url,
            "status": MonitorStatus.ACTIVE.value,
            "created_at": datetime.now().isoformat(),
            "user_id": current_user["user_id"]
        }
        
        # Remove None values
        monitor_data = {k: v for k, v in monitor_data.items() if v is not None}
        
        await app.state.redis.hset(
            f"monitor:{monitor_id}",
            mapping=monitor_data
        )
        
        # Add to active monitors set
        await app.state.redis.sadd("active_monitors", monitor_id)
        
        # Publish to monitor service via Redis pub/sub
        await app.state.redis.publish(
            "monitor_commands",
            json.dumps({"action": "start", "monitor": monitor_data})
        )
        
        # Track metrics
        await app.state.redis.incr("metrics:monitors_created")
        
        return MonitorResponse(
            success=True,
            monitor_id=monitor_id,
            status=MonitorStatus.ACTIVE,
            estimated_cost_per_hour=round(estimated_cost, 4)
        )
        
    except Exception as e:
        logger.error(f"Failed to create monitor: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create monitor: {str(e)}")

@app.delete("/api/monitors/{monitor_id}")
async def stop_monitor(
    monitor_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Stop a running monitor"""
    # Remove from active set
    await app.state.redis.srem("active_monitors", monitor_id)
    
    # Update status
    await app.state.redis.hset(f"monitor:{monitor_id}", "status", "stopped")
    
    # Publish stop command
    await app.state.redis.publish(
        "monitor_commands",
        json.dumps({"action": "stop", "monitor_id": monitor_id})
    )
    
    return {"success": True}

@app.post("/api/checkout/tasks/batch", response_model=CheckoutBatchResponse)
async def create_checkout_tasks(
    request: CheckoutBatchRequest,
    current_user: dict = Depends(get_current_user)
):
    """Create multiple checkout tasks"""
    try:
        batch_id = str(uuid.uuid4())
        task_ids = []
        
        # Calculate cost estimate
        proxy_cost_per_task = 0.05  # $0.05 per checkout attempt
        captcha_cost_per_task = 0.003  # $3 per 1000 solves
        total_cost_estimate = request.count * (proxy_cost_per_task + captcha_cost_per_task)
        
        # Create staggered tasks
        for i in range(request.count):
            task_id = str(uuid.uuid4())
            
            # Rotate through profiles and payments
            profile_id = request.profile_ids[i % len(request.profile_ids)]
            payment_id = request.payment_ids[i % len(request.payment_ids)]
            
            task_data = {
                "task_id": task_id,
                "batch_id": batch_id,
                "monitor_id": request.monitor_id,
                "profile_id": profile_id,
                "payment_id": payment_id,
                "mode": request.mode.value,
                "proxy_group": request.proxy_group,
                "status": TaskStatus.QUEUED.value,
                "created_at": datetime.now().isoformat(),
                "user_id": current_user["user_id"],
                "delay_ms": i * request.stagger_ms  # Stagger start times
            }
            
            # Queue task in Redis with priority
            await app.state.redis.zadd(
                "checkout_queue",
                {json.dumps(task_data): time.time() + (i * request.stagger_ms / 1000)}
            )
            
            # Store task data
            await app.state.redis.hset(
                f"task:{task_id}",
                mapping=task_data
            )
            
            task_ids.append(task_id)
        
        # Store batch info
        await app.state.redis.hset(
            f"batch:{batch_id}",
            mapping={
                "batch_id": batch_id,
                "task_count": request.count,
                "created_at": datetime.now().isoformat(),
                "user_id": current_user["user_id"]
            }
        )
        
        # Track metrics
        await app.state.redis.incrby("metrics:tasks_created", request.count)
        
        # Trigger worker processing
        await app.state.redis.publish(
            "task_commands",
            json.dumps({"action": "process_batch", "batch_id": batch_id})
        )
        
        return CheckoutBatchResponse(
            success=True,
            batch_id=batch_id,
            task_ids=task_ids,
            total_cost_estimate=round(total_cost_estimate, 2)
        )
        
    except Exception as e:
        logger.error(f"Failed to create checkout tasks: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create tasks: {str(e)}")

@app.post("/api/metrics/dashboard", response_model=MetricsResponse)
@cache_response(ttl=60)  # Cache for 1 minute
async def get_metrics(
    request: MetricsRequest,
    current_user: dict = Depends(get_current_user)
):
    """Get dashboard metrics with filtering"""
    try:
        # Get time range
        now = datetime.now()
        if request.timeframe == MetricsTimeframe.HOUR:
            start_time = now - timedelta(hours=1)
        elif request.timeframe == MetricsTimeframe.DAY:
            start_time = now - timedelta(days=1)
        elif request.timeframe == MetricsTimeframe.WEEK:
            start_time = now - timedelta(days=7)
        else:  # MONTH
            start_time = now - timedelta(days=30)
        
        # Get counts from Redis
        active_monitors = await app.state.redis.scard("active_monitors") or 0
        
        # Get running tasks
        running_tasks = await app.state.redis.zcount(
            "checkout_queue",
            start_time.timestamp(),
            now.timestamp()
        )
        
        # Get completed tasks
        completed_tasks = int(await app.state.redis.get(f"metrics:completed_tasks:{request.timeframe.value}") or 0)
        
        # Get success metrics
        if request.retailer:
            total_key = f"metrics:{request.retailer.value}:total:{request.timeframe.value}"
            success_key = f"metrics:{request.retailer.value}:success:{request.timeframe.value}"
        else:
            total_key = f"metrics:total_checkouts:{request.timeframe.value}"
            success_key = f"metrics:successful_checkouts:{request.timeframe.value}"
        
        total_checkouts = int(await app.state.redis.get(total_key) or 0)
        successful_checkouts = int(await app.state.redis.get(success_key) or 0)
        success_rate = (successful_checkouts / total_checkouts * 100) if total_checkouts > 0 else 0
        
        # Get average checkout time
        avg_checkout_time = int(await app.state.redis.get(f"metrics:avg_checkout_ms:{request.timeframe.value}") or 2500)
        
        # Get proxy health
        active_proxies = await app.state.redis.scard("proxies:active") or 0
        burned_proxies = await app.state.redis.scard("proxies:burned") or 0
        proxy_cost = float(await app.state.redis.get("metrics:proxy_cost_today") or 0)
        
        proxy_health = {
            "active": active_proxies,
            "burned": burned_proxies,
            "health_score": round((active_proxies / (active_proxies + burned_proxies) * 100) if (active_proxies + burned_proxies) > 0 else 100, 1),
            "cost_today": f"${proxy_cost:.2f}"
        }
        
        # Get top products
        top_products_data = await app.state.redis.zrevrange(
            f"metrics:top_products:{request.timeframe.value}",
            0, 9,
            withscores=True
        )
        
        top_products = []
        for i in range(0, len(top_products_data), 2):
            if i + 1 < len(top_products_data):
                product_info = json.loads(top_products_data[i])
                product_info["checkout_count"] = int(top_products_data[i + 1])
                top_products.append(product_info)
        
        # Calculate total spent if requested
        total_spent = None
        if request.include_costs:
            proxy_costs = float(await app.state.redis.get(f"metrics:proxy_costs:{request.timeframe.value}") or 0)
            captcha_costs = float(await app.state.redis.get(f"metrics:captcha_costs:{request.timeframe.value}") or 0)
            total_spent = round(proxy_costs + captcha_costs, 2)
        
        return MetricsResponse(
            success=True,
            timeframe=request.timeframe,
            active_monitors=active_monitors,
            running_tasks=int(running_tasks),
            completed_tasks=completed_tasks,
            success_rate=round(success_rate, 1),
            avg_checkout_time_ms=avg_checkout_time,
            total_spent=total_spent,
            proxy_health=proxy_health,
            top_products=top_products
        )
        
    except Exception as e:
        logger.error(f"Failed to get metrics: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve metrics")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str):
    """WebSocket endpoint for real-time updates"""
    client_id = str(uuid.uuid4())
    await manager.connect(websocket, client_id)
    
    # Subscribe to Redis pub/sub for updates
    pubsub = app.state.redis.pubsub()
    await pubsub.subscribe("monitor_updates", "task_updates", "system_alerts")
    
    try:
        # Send updates to client
        async def redis_listener():
            async for message in pubsub.listen():
                if message["type"] == "message":
                    await manager.send_personal_message(
                        message["data"],
                        client_id
                    )
        
        # Keep connection alive
        redis_task = asyncio.create_task(redis_listener())
        
        while True:
            # Wait for messages from client (mainly for ping/pong)
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
                
    except WebSocketDisconnect:
        manager.disconnect(client_id)
        redis_task.cancel()
        await pubsub.unsubscribe()
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(client_id)

# LACES Token System Endpoints
@app.get("/api/laces/balance", response_model=LACESBalance)
async def get_laces_balance(current_user: dict = Depends(get_current_user)):
    """Get user's LACES token balance and stats"""
    try:
        user_id = current_user["user_id"]
        
        # Get balance
        balance = int(await app.state.redis.get(f"laces:balance:{user_id}") or 0)
        lifetime_earned = int(await app.state.redis.get(f"laces:earned:{user_id}") or 0)
        lifetime_spent = int(await app.state.redis.get(f"laces:spent:{user_id}") or 0)
        
        # Get rank
        rank = await app.state.redis.zrevrank("laces:leaderboard", user_id) or 0
        total_users = await app.state.redis.zcard("laces:leaderboard") or 1
        percentile = round((1 - (rank / total_users)) * 100, 1)
        
        return LACESBalance(
            user_id=user_id,
            balance=balance,
            lifetime_earned=lifetime_earned,
            lifetime_spent=lifetime_spent,
            rank=rank + 1,  # Convert 0-based to 1-based
            percentile=percentile
        )
    except Exception as e:
        logger.error(f"Failed to get LACES balance: {e}")
        raise HTTPException(status_code=500, detail="Failed to get balance")

@app.post("/api/laces/earn")
async def earn_laces(
    reason: str,
    amount: int,
    reference_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Award LACES tokens to user"""
    try:
        user_id = current_user["user_id"]
        
        # Update balance
        new_balance = await app.state.redis.incrby(f"laces:balance:{user_id}", amount)
        await app.state.redis.incrby(f"laces:earned:{user_id}", amount)
        
        # Update leaderboard
        await app.state.redis.zincrby("laces:leaderboard", amount, user_id)
        
        # Log transaction
        transaction = {
            "user_id": user_id,
            "amount": amount,
            "reason": reason,
            "reference_id": reference_id,
            "timestamp": datetime.now().isoformat()
        }
        await app.state.redis.lpush(f"laces:transactions:{user_id}", json.dumps(transaction))
        
        # Send notification
        await app.state.redis.publish(
            "user_notifications",
            json.dumps({
                "user_id": user_id,
                "type": "laces_earned",
                "amount": amount,
                "reason": reason,
                "new_balance": new_balance
            })
        )
        
        return {"success": True, "new_balance": new_balance}
    except Exception as e:
        logger.error(f"Failed to award LACES: {e}")
        raise HTTPException(status_code=500, detail="Failed to award tokens")

# HeatMap Events Endpoints
@app.post("/api/heatmap/events", response_model=BaseResponse)
async def create_heatmap_event(
    event: HeatMapEvent,
    current_user: dict = Depends(get_current_user)
):
    """Create a new HeatMap event (drop, restock, find)"""
    try:
        event.user_id = current_user["user_id"]
        
        # Store event
        await app.state.redis.hset(
            f"heatmap:event:{event.event_id}",
            mapping=event.dict()
        )
        
        # Add to geo index
        await app.state.redis.geoadd(
            f"heatmap:geo:{event.type}",
            event.lng,
            event.lat,
            event.event_id
        )
        
        # Add to time index
        await app.state.redis.zadd(
            f"heatmap:timeline",
            {event.event_id: event.timestamp.timestamp()}
        )
        
        # Award LACES for contribution
        await earn_laces(
            reason="SPOT",
            amount=10,
            reference_id=event.event_id,
            current_user=current_user
        )
        
        # Broadcast to nearby users
        await app.state.redis.publish(
            "heatmap_updates",
            json.dumps({
                "type": "new_event",
                "event": event.dict()
            })
        )
        
        return BaseResponse(success=True)
    except Exception as e:
        logger.error(f"Failed to create HeatMap event: {e}")
        raise HTTPException(status_code=500, detail="Failed to create event")

@app.get("/api/heatmap/events/nearby")
async def get_nearby_events(
    lat: float,
    lng: float,
    radius_km: int = 5,
    event_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get HeatMap events near a location"""
    try:
        # Get events within radius
        if event_type:
            events = await app.state.redis.georadius(
                f"heatmap:geo:{event_type}",
                lng, lat,
                radius_km,
                unit="km",
                withcoord=True,
                withdist=True
            )
        else:
            # Get all event types
            all_events = []
            for etype in ["drop", "restock", "find"]:
                events = await app.state.redis.georadius(
                    f"heatmap:geo:{etype}",
                    lng, lat,
                    radius_km,
                    unit="km",
                    withcoord=True,
                    withdist=True
                )
                all_events.extend(events)
            events = all_events
        
        # Get event details
        event_details = []
        for event_data in events:
            event_id = event_data[0]
            distance = event_data[1]
            coords = event_data[2]
            
            event_info = await app.state.redis.hgetall(f"heatmap:event:{event_id}")
            if event_info:
                event_info["distance_km"] = round(distance, 2)
                event_details.append(event_info)
        
        return {
            "success": True,
            "events": event_details,
            "total": len(event_details)
        }
    except Exception as e:
        logger.error(f"Failed to get nearby events: {e}")
        raise HTTPException(status_code=500, detail="Failed to get events")

# Prediction Endpoints (Deadstock Detective)
@app.post("/api/predictions/analyze", response_model=PredictionResponse)
async def analyze_sneaker(
    request: PredictionRequest,
    current_user: dict = Depends(get_current_user)
):
    """Analyze a sneaker for appreciation and restock probability"""
    try:
        prediction_id = str(uuid.uuid4())
        
        # Mock ML prediction (in production, this would call the ML service)
        # Factors: hype level, limited edition, collaboration, retail price
        base_appreciation = 0.3
        
        # Adjust based on brand
        brand_multipliers = {
            "Jordan": 1.5,
            "Yeezy": 1.3,
            "Travis Scott": 2.0,
            "Off-White": 1.8,
            "Dunk": 1.2
        }
        
        brand_mult = 1.0
        for brand, mult in brand_multipliers.items():
            if brand.lower() in request.brand.lower() or brand.lower() in request.model.lower():
                brand_mult = max(brand_mult, mult)
        
        appreciation_probability = min(0.95, base_appreciation * brand_mult)
        
        # Restock probability (inverse of appreciation)
        restock_probability = max(0.05, 1 - appreciation_probability)
        
        # Predicted peak value
        predicted_multiplier = 1 + (appreciation_probability * 2.5)  # Up to 3.5x retail
        predicted_peak_value = request.retail_price * predicted_multiplier
        
        # Peak date (3-12 months based on hype)
        days_to_peak = int(90 + (1 - appreciation_probability) * 270)
        predicted_peak_date = datetime.now() + timedelta(days=days_to_peak)
        
        # Confidence based on data availability
        confidence_score = 0.75  # Mock confidence
        
        # Factors
        factors = [
            {"factor": "Brand Recognition", "impact": "positive", "weight": 0.3},
            {"factor": "Limited Release", "impact": "positive", "weight": 0.25},
            {"factor": "Celebrity Endorsement", "impact": "positive", "weight": 0.2},
            {"factor": "Retail Price Point", "impact": "neutral", "weight": 0.15},
            {"factor": "Market Saturation", "impact": "negative", "weight": 0.1}
        ]
        
        response = PredictionResponse(
            success=True,
            prediction_id=prediction_id,
            sku=request.sku,
            appreciation_probability=round(appreciation_probability, 3),
            restock_probability=round(restock_probability, 3),
            predicted_peak_value=round(predicted_peak_value, 2),
            predicted_peak_date=predicted_peak_date,
            confidence_score=round(confidence_score, 3),
            factors=factors
        )
        
        # Store prediction
        await app.state.redis.hset(
            f"prediction:{prediction_id}",
            mapping={
                "prediction_id": prediction_id,
                "sku": request.sku,
                "user_id": current_user["user_id"],
                "result": json.dumps(response.dict()),
                "created_at": datetime.now().isoformat()
            }
        )
        
        # Track usage for analytics
        await app.state.redis.incr("metrics:predictions_made")
        
        return response
    except Exception as e:
        logger.error(f"Failed to analyze sneaker: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate prediction")

# Notification Preferences
@app.put("/api/notifications/preferences")
async def update_notification_preferences(
    preferences: NotificationPreferences,
    current_user: dict = Depends(get_current_user)
):
    """Update user notification preferences"""
    try:
        user_id = current_user["user_id"]
        
        # Store preferences
        await app.state.redis.hset(
            f"notifications:preferences:{user_id}",
            mapping=preferences.dict()
        )
        
        return {"success": True, "message": "Preferences updated"}
    except Exception as e:
        logger.error(f"Failed to update preferences: {e}")
        raise HTTPException(status_code=500, detail="Failed to update preferences")

# Stock Alerts
@app.get("/api/alerts/stock", response_model=StockAlertResponse)
async def get_stock_alerts(
    limit: int = 50,
    retailer: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get recent stock alerts"""
    try:
        # Get alerts from sorted set
        alerts_data = await app.state.redis.zrevrange(
            "stock_alerts",
            0,
            limit - 1,
            withscores=True
        )
        
        alerts = []
        for i in range(0, len(alerts_data), 2):
            if i + 1 < len(alerts_data):
                alert_json = alerts_data[i]
                alert = StockAlert(**json.loads(alert_json))
                
                # Filter by retailer if specified
                if not retailer or alert.retailer.value == retailer:
                    alerts.append(alert)
        
        return StockAlertResponse(
            success=True,
            alerts=alerts,
            total=len(alerts)
        )
    except Exception as e:
        logger.error(f"Failed to get stock alerts: {e}")
        raise HTTPException(status_code=500, detail="Failed to get alerts")

"""
SneakerSniper API Gateway
FastAPI service that coordinates all bot operations
"""

from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, List, Dict, Any
import uuid
import json
import asyncio
import time
from datetime import datetime, timedelta
import redis.asyncio as redis
from contextlib import asynccontextmanager
import logging
import os

# Import schemas and middleware
from schemas import (
    AuthRequest, AuthResponse, MonitorRequest, MonitorResponse,
    CheckoutBatchRequest, CheckoutBatchResponse, CheckoutTaskResponse,
    MetricsRequest, MetricsResponse, MetricsTimeframe, TaskStatus, MonitorStatus,
    ErrorResponse, ErrorDetail, BaseResponse, StockAlert, StockAlertResponse,
    NotificationPreferences, HeatMapEvent, LACESBalance,
    PredictionRequest, PredictionResponse, WSMessage, HeatType, HeatSubmit
)
from middleware import (
    RequestLoggingMiddleware, ErrorHandlingMiddleware,
    SecurityMiddleware, cache_response, EnhancedRateLimitMiddleware, EnhancedCacheMiddleware
)
from prometheus_fastapi_instrumentator import Instrumentator

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Additional schema for command parsing
from pydantic import BaseModel, Field

class CommandParseRequest(BaseModel):
    prompt: str

class CommandParseResponse(BaseModel):
    type: str  # 'command', 'chat', or 'error'
    command: Optional[Dict[str, Any]] = None
    response: Optional[str] = None
    message: Optional[str] = None

# Security
security = HTTPBearer()

# Redis connection manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    app.state.redis = await redis.from_url(
        redis_url,
        encoding="utf-8",
        decode_responses=True
    )
    
    # Initialize background tasks
    app.state.background_tasks = set()
    
    logger.info("API Gateway started successfully")
    
    yield
    
    # Shutdown
    # Cancel background tasks
    for task in app.state.background_tasks:
        task.cancel()
    
    await app.state.redis.close()
    logger.info("API Gateway shutdown complete")

# Initialize FastAPI
app = FastAPI(
    title="SneakerSniper API",
    version="2.0.0",
    description="Advanced sneaker bot engine with real-time monitoring and automated checkout",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

# Add middleware in order (order matters!)
# 1. CORS (needs to be first)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining"]
)

# 2. Security headers
app.add_middleware(SecurityMiddleware)

# 3. Error handling
app.add_middleware(ErrorHandlingMiddleware)

# 4. Request logging
app.add_middleware(RequestLoggingMiddleware)

# Note: Rate limiting and caching will be added after Redis is initialized

@app.on_event("startup")
async def _rate_cache_startup():
    r = app.state.redis  # established in lifespan
    # Rate limiter first (protects the stack)
    app.add_middleware(
        EnhancedRateLimitMiddleware,
        redis=r,
        capacity_global=int(os.getenv("RATE_GLOBAL_BURST", "1000")),
        rate_global=int(os.getenv("RATE_GLOBAL_QPS", "1000")),
        capacity_route=int(os.getenv("RATE_ROUTE_BURST", "300")),
        rate_route=int(os.getenv("RATE_ROUTE_QPS", "300")),
        capacity_user=int(os.getenv("RATE_USER_BURST", "200")),
        rate_user=int(os.getenv("RATE_USER_QPS", "200")),
        capacity_ip=int(os.getenv("RATE_IP_BURST", "150")),
        rate_ip=int(os.getenv("RATE_IP_QPS", "150")),
        max_concurrency=int(os.getenv("MAX_CONCURRENCY", "200")),
        shed_threshold=int(os.getenv("SHED_THRESHOLD", "240")),
    )
    app.add_middleware(
        EnhancedCacheMiddleware,
        redis=r,
        secret=os.getenv("CACHE_HMAC_SECRET", "dev-secret"),
        default_ttl=int(os.getenv("CACHE_TTL", "60")),
        swr_ttl=int(os.getenv("CACHE_SWR_TTL", "300")),
    )
    # Add prometheus instrumentator
    Instrumentator().instrument(app).expose(app)
    
    logger.info("Dynamic middleware initialized")

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket

    async def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]

    async def send_personal_message(self, message: str, client_id: str):
        if client_id in self.active_connections:
            await self.active_connections[client_id].send_text(message)

    async def broadcast(self, message: str):
        for connection in self.active_connections.values():
            await connection.send_text(message)

manager = ConnectionManager()

# Dependency to get current user from token
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    # In production, validate token from Redis/DB
    # For now, just check if it exists
    if not token:
        raise HTTPException(status_code=401, detail="Invalid authentication")
    return {"user_id": "dev-user", "token": token}

# Command Parser (replaces Gemini AI)
class CommandParser:
    """Internal command parser to replace external AI dependency"""
    
    def parse(self, prompt: str) -> CommandParseResponse:
        prompt_lower = prompt.lower()
        
        # Monitor commands
        if any(word in prompt_lower for word in ["monitor", "watch", "track"]):
            # Extract SKU from prompt
            words = prompt.split()
            sku = None
            for i, word in enumerate(words):
                if word.lower() in ["sku", "shoe", "shoes", "product"]:
                    if i + 1 < len(words):
                        sku = words[i + 1]
                        break
            
            if not sku:
                # Try to find any word that looks like a SKU
                for word in words:
                    if len(word) > 5 and any(c.isdigit() for c in word):
                        sku = word
                        break
                    elif "travis" in word.lower() or "jordan" in word.lower():
                        sku = "-".join(words[words.index(word):words.index(word)+3])
                        break
            
            if sku:
                return CommandParseResponse(
                    type="command",
                    command={
                        "action": "start_monitor",
                        "parameters": {"sku": sku, "retailer": "shopify"}
                    }
                )
        
        # Checkout commands
        elif any(word in prompt_lower for word in ["checkout", "run", "fire", "cop"]):
            # Extract count
            count = 50  # default
            for word in prompt.split():
                if word.isdigit():
                    count = int(word)
                    break
            
            # Extract profile
            profile = "main-profile"
            if "profile" in prompt_lower:
                words = prompt.split()
                profile_idx = words.index("profile") if "profile" in words else -1
                if profile_idx > 0:
                    profile = words[profile_idx - 1]
            
            return CommandParseResponse(
                type="command",
                command={
                    "action": "fire_checkout",
                    "parameters": {
                        "task_count": count,
                        "profile_id": profile,
                        "retailer": "shopify"
                    }
                }
            )
        
        # Clear commands
        elif any(word in prompt_lower for word in ["clear", "stop", "reset", "kill"]):
            return CommandParseResponse(
                type="command",
                command={
                    "action": "clear_dashboard",
                    "parameters": {}
                }
            )
        
        # General chat
        else:
            return CommandParseResponse(
                type="chat",
                response=self._generate_chat_response(prompt)
            )
    
    def _generate_chat_response(self, prompt: str) -> str:
        """Generate contextual responses for general questions"""
        prompt_lower = prompt.lower()
        
        if "proxy" in prompt_lower:
            return "Proxy rotation is handled automatically. The system uses sticky residential proxies with 10-15 minute TTL from providers like Bright Data. Cost tracking ensures we stay under $0.05 per successful checkout."
        elif "captcha" in prompt_lower:
            return "CAPTCHA solving uses CapSolver as primary with a human farm fallback. Current solve rate is 98%+ with average solve time under 3 seconds."
        elif "success" in prompt_lower or "rate" in prompt_lower:
            return "Success rates vary by site. Shopify averages 65%+, Footsites around 50%, and SNKRS is more challenging at 20-30%. These improve with aged accounts and quality proxies."
        elif "how" in prompt_lower and "work" in prompt_lower:
            return "SneakerSniper uses a dual-mode approach: fast request-mode for speed and stealth browser mode for heavy anti-bot sites. Monitors poll every 200ms and trigger checkout tasks on stock detection."
        else:
            return "I can help you monitor products, run checkout tasks, or answer questions about the bot's operation. Try commands like 'monitor travis scott shoes' or 'run 100 checkouts'."

# Initialize command parser
command_parser = CommandParser()

# Routes
@app.get("/")
async def root():
    return {"status": "SneakerSniper API Online", "version": "1.0.0"}

@app.post("/api/auth/session", response_model=AuthResponse)
async def create_session(auth_request: AuthRequest):
    """Create a new session token"""
    try:
        token = str(uuid.uuid4())
        expires_at = datetime.now().timestamp() + 86400  # 24 hours
        
        # Store token in Redis
        await app.state.redis.setex(
            f"session:{token}",
            86400,
            json.dumps({
                "user_id": "dev-user", 
                "api_key": auth_request.api_key,
                "device_id": auth_request.device_id
            })
        )
        
        return AuthResponse(
            success=True,
            token=token,
            expires_at=datetime.fromtimestamp(expires_at),
            user_id="dev-user"
        )
    except Exception as e:
        logger.error(f"Session creation failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to create session")

@app.post("/api/commands/parse", response_model=CommandParseResponse)
async def parse_command(
    request: CommandParseRequest,
    current_user: dict = Depends(get_current_user)
):
    """Parse user command into executable action"""
    return command_parser.parse(request.prompt)

@app.post("/api/monitors", response_model=MonitorResponse)
async def create_monitor(
    request: MonitorRequest,
    current_user: dict = Depends(get_current_user)
):
    """Start a new product monitor"""
    try:
        monitor_id = str(uuid.uuid4())
        
        # Calculate estimated cost
        requests_per_hour = 3600000 / request.interval_ms
        proxy_cost_per_request = 0.00001  # $0.01 per 1000 requests
        estimated_cost = requests_per_hour * proxy_cost_per_request
        
        # Create monitor task in Redis
        monitor_data = {
            "monitor_id": monitor_id,
            "sku": request.sku,
            "retailer": request.retailer.value,
            "interval_ms": request.interval_ms,
            "size_filter": json.dumps(request.size_filter) if request.size_filter else None,
            "price_threshold": request.price_threshold,
            "keywords": json.dumps(request.keywords) if request.keywords else None,
            "webhook_url": request.webhook_url,
            "status": MonitorStatus.ACTIVE.value,
            "created_at": datetime.now().isoformat(),
            "user_id": current_user["user_id"]
        }
        
        # Remove None values
        monitor_data = {k: v for k, v in monitor_data.items() if v is not None}
        
        await app.state.redis.hset(
            f"monitor:{monitor_id}",
            mapping=monitor_data
        )
        
        # Add to active monitors set
        await app.state.redis.sadd("active_monitors", monitor_id)
        
        # Publish to monitor service via Redis pub/sub
        await app.state.redis.publish(
            "monitor_commands",
            json.dumps({"action": "start", "monitor": monitor_data})
        )
        
        # Track metrics
        await app.state.redis.incr("metrics:monitors_created")
        
        return MonitorResponse(
            success=True,
            monitor_id=monitor_id,
            status=MonitorStatus.ACTIVE,
            estimated_cost_per_hour=round(estimated_cost, 4)
        )
        
    except Exception as e:
        logger.error(f"Failed to create monitor: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create monitor: {str(e)}")

@app.delete("/api/monitors/{monitor_id}")
async def stop_monitor(
    monitor_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Stop a running monitor"""
    # Remove from active set
    await app.state.redis.srem("active_monitors", monitor_id)
    
    # Update status
    await app.state.redis.hset(f"monitor:{monitor_id}", "status", "stopped")
    
    # Publish stop command
    await app.state.redis.publish(
        "monitor_commands",
        json.dumps({"action": "stop", "monitor_id": monitor_id})
    )
    
    return {"success": True}

@app.post("/api/checkout/tasks/batch", response_model=CheckoutBatchResponse)
async def create_checkout_tasks(
    request: CheckoutBatchRequest,
    current_user: dict = Depends(get_current_user)
):
    """Create multiple checkout tasks"""
    try:
        batch_id = str(uuid.uuid4())
        task_ids = []
        
        # Calculate cost estimate
        proxy_cost_per_task = 0.05  # $0.05 per checkout attempt
        captcha_cost_per_task = 0.003  # $3 per 1000 solves
        total_cost_estimate = request.count * (proxy_cost_per_task + captcha_cost_per_task)
        
        # Create staggered tasks
        for i in range(request.count):
            task_id = str(uuid.uuid4())
            
            # Rotate through profiles and payments
            profile_id = request.profile_ids[i % len(request.profile_ids)]
            payment_id = request.payment_ids[i % len(request.payment_ids)]
            
            task_data = {
                "task_id": task_id,
                "batch_id": batch_id,
                "monitor_id": request.monitor_id,
                "profile_id": profile_id,
                "payment_id": payment_id,
                "mode": request.mode.value,
                "proxy_group": request.proxy_group,
                "status": TaskStatus.QUEUED.value,
                "created_at": datetime.now().isoformat(),
                "user_id": current_user["user_id"],
                "delay_ms": i * request.stagger_ms  # Stagger start times
            }
            
            # Queue task in Redis with priority
            await app.state.redis.zadd(
                "checkout_queue",
                {json.dumps(task_data): time.time() + (i * request.stagger_ms / 1000)}
            )
            
            # Store task data
            await app.state.redis.hset(
                f"task:{task_id}",
                mapping=task_data
            )
            
            task_ids.append(task_id)
        
        # Store batch info
        await app.state.redis.hset(
            f"batch:{batch_id}",
            mapping={
                "batch_id": batch_id,
                "task_count": request.count,
                "created_at": datetime.now().isoformat(),
                "user_id": current_user["user_id"]
            }
        )
        
        # Track metrics
        await app.state.redis.incrby("metrics:tasks_created", request.count)
        
        # Trigger worker processing
        await app.state.redis.publish(
            "task_commands",
            json.dumps({"action": "process_batch", "batch_id": batch_id})
        )
        
        return CheckoutBatchResponse(
            success=True,
            batch_id=batch_id,
            task_ids=task_ids,
            total_cost_estimate=round(total_cost_estimate, 2)
        )
        
    except Exception as e:
        logger.error(f"Failed to create checkout tasks: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create tasks: {str(e)}")

@app.post("/api/metrics/dashboard", response_model=MetricsResponse)
@cache_response(ttl=60)  # Cache for 1 minute
async def get_metrics(
    request: MetricsRequest,
    current_user: dict = Depends(get_current_user)
):
    """Get dashboard metrics with filtering"""
    try:
        # Get time range
        now = datetime.now()
        if request.timeframe == MetricsTimeframe.HOUR:
            start_time = now - timedelta(hours=1)
        elif request.timeframe == MetricsTimeframe.DAY:
            start_time = now - timedelta(days=1)
        elif request.timeframe == MetricsTimeframe.WEEK:
            start_time = now - timedelta(days=7)
        else:  # MONTH
            start_time = now - timedelta(days=30)
        
        # Get counts from Redis
        active_monitors = await app.state.redis.scard("active_monitors") or 0
        
        # Get running tasks
        running_tasks = await app.state.redis.zcount(
            "checkout_queue",
            start_time.timestamp(),
            now.timestamp()
        )
        
        # Get completed tasks
        completed_tasks = int(await app.state.redis.get(f"metrics:completed_tasks:{request.timeframe.value}") or 0)
        
        # Get success metrics
        if request.retailer:
            total_key = f"metrics:{request.retailer.value}:total:{request.timeframe.value}"
            success_key = f"metrics:{request.retailer.value}:success:{request.timeframe.value}"
        else:
            total_key = f"metrics:total_checkouts:{request.timeframe.value}"
            success_key = f"metrics:successful_checkouts:{request.timeframe.value}"
        
        total_checkouts = int(await app.state.redis.get(total_key) or 0)
        successful_checkouts = int(await app.state.redis.get(success_key) or 0)
        success_rate = (successful_checkouts / total_checkouts * 100) if total_checkouts > 0 else 0
        
        # Get average checkout time
        avg_checkout_time = int(await app.state.redis.get(f"metrics:avg_checkout_ms:{request.timeframe.value}") or 2500)
        
        # Get proxy health
        active_proxies = await app.state.redis.scard("proxies:active") or 0
        burned_proxies = await app.state.redis.scard("proxies:burned") or 0
        proxy_cost = float(await app.state.redis.get("metrics:proxy_cost_today") or 0)
        
        proxy_health = {
            "active": active_proxies,
            "burned": burned_proxies,
            "health_score": round((active_proxies / (active_proxies + burned_proxies) * 100) if (active_proxies + burned_proxies) > 0 else 100, 1),
            "cost_today": f"${proxy_cost:.2f}"
        }
        
        # Get top products
        top_products_data = await app.state.redis.zrevrange(
            f"metrics:top_products:{request.timeframe.value}",
            0, 9,
            withscores=True
        )
        
        top_products = []
        for i in range(0, len(top_products_data), 2):
            if i + 1 < len(top_products_data):
                product_info = json.loads(top_products_data[i])
                product_info["checkout_count"] = int(top_products_data[i + 1])
                top_products.append(product_info)
        
        # Calculate total spent if requested
        total_spent = None
        if request.include_costs:
            proxy_costs = float(await app.state.redis.get(f"metrics:proxy_costs:{request.timeframe.value}") or 0)
            captcha_costs = float(await app.state.redis.get(f"metrics:captcha_costs:{request.timeframe.value}") or 0)
            total_spent = round(proxy_costs + captcha_costs, 2)
        
        return MetricsResponse(
            success=True,
            timeframe=request.timeframe,
            active_monitors=active_monitors,
            running_tasks=int(running_tasks),
            completed_tasks=completed_tasks,
            success_rate=round(success_rate, 1),
            avg_checkout_time_ms=avg_checkout_time,
            total_spent=total_spent,
            proxy_health=proxy_health,
            top_products=top_products
        )
        
    except Exception as e:
        logger.error(f"Failed to get metrics: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve metrics")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str):
    """WebSocket endpoint for real-time updates"""
    client_id = str(uuid.uuid4())
    await manager.connect(websocket, client_id)
    
    # Subscribe to Redis pub/sub for updates
    pubsub = app.state.redis.pubsub()
    await pubsub.subscribe("monitor_updates", "task_updates", "system_alerts")
    
    try:
        # Send updates to client
        async def redis_listener():
            async for message in pubsub.listen():
                if message["type"] == "message":
                    await manager.send_personal_message(
                        message["data"],
                        client_id
                    )
        
        # Keep connection alive
        redis_task = asyncio.create_task(redis_listener())
        
        while True:
            # Wait for messages from client (mainly for ping/pong)
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
                
    except WebSocketDisconnect:
        manager.disconnect(client_id)
        redis_task.cancel()
        await pubsub.unsubscribe()
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(client_id)

# LACES Token System Endpoints
@app.get("/api/laces/balance", response_model=LACESBalance)
async def get_laces_balance(current_user: dict = Depends(get_current_user)):
    """Get user's LACES token balance and stats"""
    try:
        user_id = current_user["user_id"]
        
        # Get balance
        balance = int(await app.state.redis.get(f"laces:balance:{user_id}") or 0)
        lifetime_earned = int(await app.state.redis.get(f"laces:earned:{user_id}") or 0)
        lifetime_spent = int(await app.state.redis.get(f"laces:spent:{user_id}") or 0)
        
        # Get rank
        rank = await app.state.redis.zrevrank("laces:leaderboard", user_id) or 0
        total_users = await app.state.redis.zcard("laces:leaderboard") or 1
        percentile = round((1 - (rank / total_users)) * 100, 1)
        
        return LACESBalance(
            user_id=user_id,
            balance=balance,
            lifetime_earned=lifetime_earned,
            lifetime_spent=lifetime_spent,
            rank=rank + 1,  # Convert 0-based to 1-based
            percentile=percentile
        )
    except Exception as e:
        logger.error(f"Failed to get LACES balance: {e}")
        raise HTTPException(status_code=500, detail="Failed to get balance")

@app.post("/api/laces/earn")
async def earn_laces(
    reason: str,
    amount: int,
    reference_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Award LACES tokens to user"""
    try:
        user_id = current_user["user_id"]
        
        # Update balance
        new_balance = await app.state.redis.incrby(f"laces:balance:{user_id}", amount)
        await app.state.redis.incrby(f"laces:earned:{user_id}", amount)
        
        # Update leaderboard
        await app.state.redis.zincrby("laces:leaderboard", amount, user_id)
        
        # Log transaction
        transaction = {
            "user_id": user_id,
            "amount": amount,
            "reason": reason,
            "reference_id": reference_id,
            "timestamp": datetime.now().isoformat()
        }
        await app.state.redis.lpush(f"laces:transactions:{user_id}", json.dumps(transaction))
        
        # Send notification
        await app.state.redis.publish(
            "user_notifications",
            json.dumps({
                "user_id": user_id,
                "type": "laces_earned",
                "amount": amount,
                "reason": reason,
                "new_balance": new_balance
            })
        )
        
        return {"success": True, "new_balance": new_balance}
    except Exception as e:
        logger.error(f"Failed to award LACES: {e}")
        raise HTTPException(status_code=500, detail="Failed to award tokens")

# HeatMap Events Endpoints
@app.post("/api/heatmap/events", response_model=BaseResponse)
async def create_heatmap_event(
    event: HeatMapEvent,
    current_user: dict = Depends(get_current_user)
):
    """Create a new HeatMap event (drop, restock, find)"""
    try:
        event.user_id = current_user["user_id"]
        
        # Store event
        await app.state.redis.hset(
            f"heatmap:event:{event.event_id}",
            mapping=event.dict()
        )
        
        # Add to geo index
        await app.state.redis.geoadd(
            f"heatmap:geo:{event.type}",
            event.lng,
            event.lat,
            event.event_id
        )
        
        # Add to time index
        await app.state.redis.zadd(
            f"heatmap:timeline",
            {event.event_id: event.timestamp.timestamp()}
        )
        
        # Award LACES for contribution
        await earn_laces(
            reason="SPOT",
            amount=10,
            reference_id=event.event_id,
            current_user=current_user
        )
        
        # Broadcast to nearby users
        await app.state.redis.publish(
            "heatmap_updates",
            json.dumps({
                "type": "new_event",
                "event": event.dict()
            })
        )
        
        return BaseResponse(success=True)
    except Exception as e:
        logger.error(f"Failed to create HeatMap event: {e}")
        raise HTTPException(status_code=500, detail="Failed to create event")

@app.get("/api/heatmap/events/nearby")
async def get_nearby_events(
    lat: float,
    lng: float,
    radius_km: int = 5,
    event_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get HeatMap events near a location"""
    try:
        # Get events within radius
        if event_type:
            events = await app.state.redis.georadius(
                f"heatmap:geo:{event_type}",
                lng, lat,
                radius_km,
                unit="km",
                withcoord=True,
                withdist=True
            )
        else:
            # Get all event types
            all_events = []
            for etype in ["drop", "restock", "find"]:
                events = await app.state.redis.georadius(
                    f"heatmap:geo:{etype}",
                    lng, lat,
                    radius_km,
                    unit="km",
                    withcoord=True,
                    withdist=True
                )
                all_events.extend(events)
            events = all_events
        
        # Get event details
        event_details = []
        for event_data in events:
            event_id = event_data[0]
            distance = event_data[1]
            coords = event_data[2]
            
            event_info = await app.state.redis.hgetall(f"heatmap:event:{event_id}")
            if event_info:
                event_info["distance_km"] = round(distance, 2)
                event_details.append(event_info)
        
        return {
            "success": True,
            "events": event_details,
            "total": len(event_details)
        }
    except Exception as e:
        logger.error(f"Failed to get nearby events: {e}")
        raise HTTPException(status_code=500, detail="Failed to get events")

# Prediction Endpoints (Deadstock Detective)
@app.post("/api/predictions/analyze", response_model=PredictionResponse)
async def analyze_sneaker(
    request: PredictionRequest,
    current_user: dict = Depends(get_current_user)
):
    """Analyze a sneaker for appreciation and restock probability"""
    try:
        prediction_id = str(uuid.uuid4())
        
        # Mock ML prediction (in production, this would call the ML service)
        # Factors: hype level, limited edition, collaboration, retail price
        base_appreciation = 0.3
        
        # Adjust based on brand
        brand_multipliers = {
            "Jordan": 1.5,
            "Yeezy": 1.3,
            "Travis Scott": 2.0,
            "Off-White": 1.8,
            "Dunk": 1.2
        }
        
        brand_mult = 1.0
        for brand, mult in brand_multipliers.items():
            if brand.lower() in request.brand.lower() or brand.lower() in request.model.lower():
                brand_mult = max(brand_mult, mult)
        
        appreciation_probability = min(0.95, base_appreciation * brand_mult)
        
        # Restock probability (inverse of appreciation)
        restock_probability = max(0.05, 1 - appreciation_probability)
        
        # Predicted peak value
        predicted_multiplier = 1 + (appreciation_probability * 2.5)  # Up to 3.5x retail
        predicted_peak_value = request.retail_price * predicted_multiplier
        
        # Peak date (3-12 months based on hype)
        days_to_peak = int(90 + (1 - appreciation_probability) * 270)
        predicted_peak_date = datetime.now() + timedelta(days=days_to_peak)
        
        # Confidence based on data availability
        confidence_score = 0.75  # Mock confidence
        
        # Factors
        factors = [
            {"factor": "Brand Recognition", "impact": "positive", "weight": 0.3},
            {"factor": "Limited Release", "impact": "positive", "weight": 0.25},
            {"factor": "Celebrity Endorsement", "impact": "positive", "weight": 0.2},
            {"factor": "Retail Price Point", "impact": "neutral", "weight": 0.15},
            {"factor": "Market Saturation", "impact": "negative", "weight": 0.1}
        ]
        
        response = PredictionResponse(
            success=True,
            prediction_id=prediction_id,
            sku=request.sku,
            appreciation_probability=round(appreciation_probability, 3),
            restock_probability=round(restock_probability, 3),
            predicted_peak_value=round(predicted_peak_value, 2),
            predicted_peak_date=predicted_peak_date,
            confidence_score=round(confidence_score, 3),
            factors=factors
        )
        
        # Store prediction
        await app.state.redis.hset(
            f"prediction:{prediction_id}",
            mapping={
                "prediction_id": prediction_id,
                "sku": request.sku,
                "user_id": current_user["user_id"],
                "result": json.dumps(response.dict()),
                "created_at": datetime.now().isoformat()
            }
        )
        
        # Track usage for analytics
        await app.state.redis.incr("metrics:predictions_made")
        
        return response
    except Exception as e:
        logger.error(f"Failed to analyze sneaker: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate prediction")

# Notification Preferences
@app.put("/api/notifications/preferences")
async def update_notification_preferences(
    preferences: NotificationPreferences,
    current_user: dict = Depends(get_current_user)
):
    """Update user notification preferences"""
    try:
        user_id = current_user["user_id"]
        
        # Store preferences
        await app.state.redis.hset(
            f"notifications:preferences:{user_id}",
            mapping=preferences.dict()
        )
        
        return {"success": True, "message": "Preferences updated"}
    except Exception as e:
        logger.error(f"Failed to update preferences: {e}")
        raise HTTPException(status_code=500, detail="Failed to update preferences")

# Stock Alerts
@app.get("/api/alerts/stock", response_model=StockAlertResponse)
async def get_stock_alerts(
    limit: int = 50,
    retailer: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get recent stock alerts"""
    try:
        # Get alerts from sorted set
        alerts_data = await app.state.redis.zrevrange(
            "stock_alerts",
            0,
            limit - 1,
            withscores=True
        )
        
        alerts = []
        for i in range(0, len(alerts_data), 2):
            if i + 1 < len(alerts_data):
                alert_json = alerts_data[i]
                alert = StockAlert(**json.loads(alert_json))
                
                # Filter by retailer if specified
                if not retailer or alert.retailer.value == retailer:
                    alerts.append(alert)
        
        return StockAlertResponse(
            success=True,
            alerts=alerts,
            total=len(alerts)
        )
    except Exception as e:
        logger.error(f"Failed to get stock alerts: {e}")
        raise HTTPException(status_code=500, detail="Failed to get alerts")

from pydantic import BaseModel, Field
from typing import List

class LeaderEntry(BaseModel):
    user_id: str
    score: int
    rank: int

@app.get("/api/community/leaderboard", response_model=List[LeaderEntry])
async def leaderboard(limit: int = 50, current_user: dict = Depends(get_current_user)):
    z = await app.state.redis.zrevrange("laces:leaderboard", 0, limit-1, withscores=True)
    out = []
    for idx, (user_id, score) in enumerate(z):
        out.append(LeaderEntry(user_id=user_id, score=int(score), rank=idx+1))
    return out

@app.post("/api/community/heat", response_model=BaseResponse)
async def submit_heat(ev: HeatSubmit, current_user: dict = Depends(get_current_user)):
    event_id = str(uuid.uuid4())
    data = ev.dict()
    data.update({"event_id": event_id, "timestamp": datetime.now().isoformat(), "user_id": current_user["user_id"]})
    await app.state.redis.hset(f"heatmap:event:{event_id}", mapping=data)
    await app.state.redis.geoadd(f"heatmap:geo:{ev.type.value}", data["lng"], data["lat"], event_id)
    await app.state.redis.publish("heatmap_updates", json.dumps({"type":"new_event","event":data}))
    await app.state.redis.zadd("heatmap:timeline", {event_id: datetime.now().timestamp()})
    return BaseResponse(success=True)

# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Check Redis connection
        await app.state.redis.ping()
        return {"status": "healthy", "redis": "connected"}
    except:
        return {"status": "unhealthy", "redis": "disconnected"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
