"""
SneakerSniper Checkout Service
Dual-mode checkout engine with request and browser modes
"""

import asyncio
import os
import json
import time
import httpx
import redis.asyncio as redis
from typing import Dict, Any, Optional, List
from cryptography.fernet import Fernet
from dataclasses import dataclass
from datetime import datetime
import logging
from tenacity import retry, stop_after_attempt, wait_exponential
import random
from abc import ABC, abstractmethod
import uuid

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass

class CheckoutTask:
    """Checkout task configuration"""
    task_id: str
    profile_id: str
    product_url: str
    variant_id: str
    size: str
    retailer: str
    mode: str  # 'request' or 'browser'
    is_dry_run: bool = False
    proxy_url: Optional[str] = None
    
@dataclass
class Profile:
    """User profile for checkout"""
    profile_id: str
    email: str
    first_name: str
    last_name: str
    phone: str
    address_line1: str
    address_line2: Optional[str]
    city: str
    state: str
    zip_code: str
    country: str
    card_number: str  # Encrypted
    card_cvv: str     # Encrypted
    card_exp: str
    
@dataclass
class CheckoutResult:
    """Result of checkout attempt"""
    success: bool
    order_id: Optional[str] = None
    error: Optional[str] = None
    retry_after: Optional[int] = None

class EncryptionService:
    """Handles encryption and decryption of sensitive data."""
    def __init__(self, key: str):
        if not key:
            raise ValueError("ENCRYPTION_KEY cannot be empty.")
        self.fernet = Fernet(key.encode())

    def encrypt(self, data: str) -> bytes:
        """Encrypts a string and returns bytes."""
        return self.fernet.encrypt(data.encode())

    def decrypt(self, token: bytes) -> str:
        """Decrypts a token and returns a string."""
        # In a real app, handle InvalidToken exceptions from Fernet
        # for cases where the token is corrupted or invalid.
        return self.fernet.decrypt(token).decode()


class CheckoutEngine(ABC):
    """Abstract base for checkout engines"""
    
    def __init__(self, http_client: httpx.AsyncClient):
        self.http_client = http_client
        
    @abstractmethod
    async def checkout(self, task: CheckoutTask, profile: Profile) -> CheckoutResult:
        """Execute checkout"""
        pass
        
    async def update_status(self, task_id: str, status: str, message: str, progress: int):
        """Update task status via Redis pub/sub"""
        # This would be implemented to publish updates
        pass

class ShopifyRequestMode(CheckoutEngine):
    """Fast request-mode checkout for Shopify"""
    
    def __init__(self, http_client: httpx.AsyncClient, store_url: str):
        super().__init__(http_client)
        self.store_url = store_url.rstrip('/')
        self.session_cookies = {}
        
    async def checkout(self, task: CheckoutTask, profile: Profile) -> CheckoutResult:
        """Execute Shopify checkout flow"""
        try:
            # Step 1: Add to cart
            await self.update_status(task.task_id, "RUNNING", "Adding to cart...", 20)
            cart_token = await self._add_to_cart(task.variant_id)
            if not cart_token:
                return CheckoutResult(success=False, error="Failed to add to cart")
            
            # Step 2: Start checkout
            await self.update_status(task.task_id, "RUNNING", "Starting checkout...", 40)
            checkout_token = await self._create_checkout(cart_token)
            if not checkout_token:
                return CheckoutResult(success=False, error="Failed to create checkout")
            
            # Step 3: Submit customer info
            await self.update_status(task.task_id, "RUNNING", "Submitting info...", 60)
            success = await self._submit_customer_info(checkout_token, profile)
            if not success:
                return CheckoutResult(success=False, error="Failed to submit customer info")
            
            # Step 4: Submit payment
            await self.update_status(task.task_id, "RUNNING", "Processing payment...", 80)
            order_id = await self._submit_payment(checkout_token, profile)
            
            if order_id:
                await self.update_status(task.task_id, "SUCCESS", f"Order {order_id}", 100)
                return CheckoutResult(success=True, order_id=order_id)
            else:
                return CheckoutResult(success=False, error="Payment failed")
                
        except Exception as e:
            logger.error(f"Checkout error for task {task.task_id}: {e}")
            return CheckoutResult(success=False, error=str(e))
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=5))
    async def _add_to_cart(self, variant_id: str) -> Optional[str]:
        """Add item to cart"""
        url = f"{self.store_url}/cart/add.js"
        data = {
            "items": [{
                "id": variant_id,
                "quantity": 1
            }]
        }
        
        headers = {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent': self._get_user_agent()
        }
        
        response = await self.http_client.post(
            url, 
            json=data, 
            headers=headers,
            timeout=5.0
        )
        
        if response.status_code == 200:
            cart_data = response.json()
            return cart_data.get('token')
        return None
    
    async def _create_checkout(self, cart_token: str) -> Optional[str]:
        """Create checkout session"""
        # Implementation would follow Shopify checkout API
        # This is a simplified version
        return f"checkout_{cart_token}_{int(time.time())}"
    
    async def _submit_customer_info(self, checkout_token: str, profile: Profile) -> bool:
        """Submit customer information"""
        # Implementation would submit to Shopify checkout API
        return True
    
    async def _submit_payment(self, checkout_token: str, profile: Profile) -> Optional[str]:
        """Submit payment information"""
        # Implementation would submit to payment processor
        # This is where you'd integrate with Shopify's payment API
        return f"ORDER-{int(time.time())}-{random.randint(1000, 9999)}"
    
    def _get_user_agent(self) -> str:
        """Get randomized user agent"""
        agents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
        ]
        return random.choice(agents)

class PlaywrightBrowserMode(CheckoutEngine):
    """Browser-mode checkout using Playwright for heavy anti-bot sites"""
    
    def __init__(self):
        self.playwright = None
        self.browser = None
        
    async def initialize(self):
        """Initialize Playwright browser"""
        from playwright.async_api import async_playwright
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox'
            ]
        )
        
    async def checkout(self, task: CheckoutTask, profile: Profile) -> CheckoutResult:
        """Execute browser-based checkout"""
        context = await self.browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent=self._get_user_agent()
        )
        
        # Apply stealth techniques
        await context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
        """)
        
        page = await context.new_page()
        
        try:
            # Navigate to product
            await page.goto(task.product_url)
            
            # Select size and add to cart
            # ... implementation details ...
            
            return CheckoutResult(success=True, order_id="BROWSER-ORDER-123")
            
        finally:
            await context.close()
    
    def _get_user_agent(self) -> str:
        """Get randomized user agent"""
        return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

class CheckoutService:
    """Main checkout service that manages checkout tasks"""
    
    def __init__(self):
        self.redis_client: Optional[redis.Redis] = None
        self.http_client = httpx.AsyncClient(
            limits=httpx.Limits(max_keepalive_connections=50, max_connections=200),
            timeout=httpx.Timeout(10.0),
            http2=True
        )
        self.encryption_service: Optional[EncryptionService] = None
        self.engines = {}
        self.running_tasks = {}
        
    async def start(self):
        """Start the checkout service"""
        logger.info("Starting SneakerSniper Checkout Service...")
        
        # Initialize encryption service
        encryption_key = os.getenv("ENCRYPTION_KEY")
        if not encryption_key:
            raise RuntimeError("ENCRYPTION_KEY environment variable not set.")
        self.encryption_service = EncryptionService(encryption_key)
        
        # Connect to Redis
        self.redis_client = await redis.from_url(
            "redis://localhost:6379",
            encoding="utf-8",
            decode_responses=True
        )
        
        # Initialize checkout engines
        self.engines['shopify_request'] = ShopifyRequestMode(
            self.http_client,
            'https://kith.com'  # Would be dynamic per task
        )
        
        # Initialize browser mode
        browser_engine = PlaywrightBrowserMode()
        await browser_engine.initialize()
        self.engines['browser'] = browser_engine
        
        # Start task processor
        asyncio.create_task(self._process_checkout_queue())
        
        logger.info("Checkout Service started successfully")
        
    async def _process_checkout_queue(self):
        """Process checkout tasks from queue"""
        while True:
            try:
                # Get task from queue (blocking)
                task_data = await self.redis_client.brpop("checkout_queue", timeout=1)
                
                if task_data:
                    _, task_json = task_data
                    task_info = json.loads(task_json)
                    
                    # Create task
                    task = CheckoutTask(
                        task_id=task_info['task_id'],
                        profile_id=task_info['profile_id'],
                        product_url=task_info.get('product_url', ''),
                        variant_id=task_info.get('variant_id', ''),
                        size=task_info.get('size', ''),
                        retailer=task_info['retailer'],
                        mode=task_info['mode']
                        is_dry_run=task_info.get('is_dry_run', False)

                    )
                    
                    # Process task asynchronously
                    asyncio.create_task(self._execute_task(task))
                    
            except Exception as e:
                logger.error(f"Queue processing error: {e}")
                await asyncio.sleep(1)
    
    async def _execute_task(self, task: CheckoutTask):
        """Execute a checkout task"""
        try:
            # Mark as running
            self.running_tasks[task.task_id] = task
            await self._update_task_status(task.task_id, "RUNNING", "Starting checkout...")
            
            # Get profile
            profile = await self._get_profile(task.profile_id)
            if not profile:
                await self._update_task_status(
                    task.task_id, 
                    "FAILED", 
                    "Profile not found"
                )
                return
            
            # Select engine
            engine_key = f"{task.retailer}_{task.mode}"
            engine = self.engines.get(engine_key) or self.engines.get(task.mode)
            
            if not engine:
                await self._update_task_status(
                    task.task_id,
                    "FAILED",
                    f"No engine for {engine_key}"
                )
                return
            
            # Execute checkout
            if task.is_dry_run:
                # Simulate a successful checkout for dry runs
                await asyncio.sleep(random.uniform(1.5, 3.0)) # Simulate network latency
                result = CheckoutResult(
                    success=True,
                    order_id=f"DRY-RUN-{str(uuid.uuid4())[:8]}"
                )
                await self._update_task_status(
                    task.task_id, "SUCCESS", f"Dry run successful: {result.order_id}"
                )
            else:
                result = await engine.checkout(task, profile)
             
             # Store result in database for historical records
             await self._store_checkout_result(task, result)

            
            # Store result in database for historical records
            await self._store_checkout_result(task, result)
            
            # Update final status
            if result.success:
                await self._update_task_status(
                    task.task_id,
                    "SUCCESS",
                    f"Order: {result.order_id}"
                )
                await self._increment_success_metrics()
            else:
                await self._update_task_status(
                    task.task_id,
                    "FAILED",
                    result.error or "Unknown error"
                )
                
        except Exception as e:
            logger.error(f"Task execution error: {e}")
            await self._update_task_status(
                task.task_id,
                "FAILED",
                f"System error: {str(e)}"
            )
        finally:
            # Clean up
            self.running_tasks.pop(task.task_id, None)
    
    async def _get_profile(self, profile_id: str) -> Optional[Profile]:
        """Get profile from Redis cache or database (cache-aside pattern)"""
        # 1. Try to get profile from Redis cache
        profile_cache_key = f"profile:{profile_id}"
        cached_profile_json = await self.redis_client.get(profile_cache_key)
        
        if cached_profile_json:
            logger.info(f"Profile {profile_id} found in cache.")
            profile_data = json.loads(cached_profile_json)
            # In a real implementation, you would decrypt sensitive fields here
            return Profile(**profile_data)
    
        # 2. If not in cache, fetch from PostgreSQL database
        logger.info(f"Profile {profile_id} not in cache, fetching from database.")
        # This simulates what you would fetch from your PostgreSQL database.
        # Note that card_number and cvv are stored as encrypted bytes.
        # This mock data is encrypted on the fly for demonstration.
        db_profile_data = {
            "profile_id": profile_id,
            "email": "john.doe@example.com",
            "first_name": "John", "last_name": "Doe", "phone": "+1234567890",
            "address_line1": "123 Main St", "address_line2": None, "city": "New York",
            "state": "NY", "zip_code": "10001", "country": "US",
            "card_number_encrypted": self.encryption_service.encrypt("1234567890123456"),
            "card_cvv_encrypted": self.encryption_service.encrypt("123"),
            "card_exp": "12/25"
        }
    
        # Decrypt sensitive data before creating the Profile object for use in the task
        decrypted_card_number = self.encryption_service.decrypt(db_profile_data["card_number_encrypted"])
        decrypted_card_cvv = self.encryption_service.decrypt(db_profile_data["card_cvv_encrypted"])
    
        profile = Profile(
            profile_id=db_profile_data["profile_id"],
            email=db_profile_data["email"],
            first_name=db_profile_data["first_name"], last_name=db_profile_data["last_name"],
            phone=db_profile_data["phone"], address_line1=db_profile_data["address_line1"],
            address_line2=db_profile_data["address_line2"], city=db_profile_data["city"],
            state=db_profile_data["state"], zip_code=db_profile_data["zip_code"],
            country=db_profile_data["country"],
            card_number=decrypted_card_number,
            card_cvv=decrypted_card_cvv,
            card_exp=db_profile_data["card_exp"]
        )
    
        # 3. Store the fetched profile in Redis cache for future requests (with a 5-min TTL)
        # Avoid caching raw sensitive data like full card numbers.
        profile_dict_for_cache = {
            "profile_id": profile.profile_id, "email": profile.email,
            "first_name": profile.first_name, "last_name": profile.last_name,
            "phone": profile.phone, "address_line1": profile.address_line1,
            "address_line2": profile.address_line2, "city": profile.city, "state": profile.state,
            "zip_code": profile.zip_code, "country": profile.country,
            "card_number": "cached_placeholder", # Don't cache decrypted data
            "card_cvv": "cached_placeholder", "card_exp": profile.card_exp
        }
        await self.redis_client.set(
            profile_cache_key, 
            json.dumps(profile_dict_for_cache), 
            ex=300  # Cache for 5 minutes
        )
        
        return profile

    async def _create_profile_in_db(self, profile_data: Dict[str, Any]):
        """
        Example of how you would encrypt data before storing a new profile.
        This would be called from an API endpoint for creating/updating profiles.
        """
        # Encrypt sensitive fields before they are stored
        encrypted_card = self.encryption_service.encrypt(profile_data["card_number"])
        encrypted_cvv = self.encryption_service.encrypt(profile_data["card_cvv"])

        # Prepare data for DB insert (storing encrypted bytes)
        # Your database column for these should be of type BYTEA or similar
        db_record = {
            "profile_id": profile_data["profile_id"],
            "email": profile_data["email"],
            # ... other non-sensitive fields
            "card_number_encrypted": encrypted_card,
            "card_cvv_encrypted": encrypted_cvv,
            "card_exp": profile_data["card_exp"]
        }
        
        logger.info(f"Storing encrypted profile {profile_data['profile_id']} to database.")
        # In a real implementation, you would use your ORM to save this record:
        # e.g., new_profile = ProfileModel(**db_record)
        # e.g., session.add(new_profile); await session.commit()

    async def _store_checkout_result(self, task: CheckoutTask, result: CheckoutResult):
        """Store the result of a checkout attempt in the database."""
        # This is a placeholder for an actual database insert using an ORM.
        logger.info(f"Storing checkout result for task {task.task_id} in database.")
    
    async def _update_task_status(self, task_id: str, status: str, message: str):
        """Update task status and publish update"""
        # Update in Redis
        await self.redis_client.hset(
            f"task:{task_id}",
            mapping={
                "status": status,
                "message": message,
                "updated_at": datetime.now().isoformat()
            }
        )
        
        # Publish update
        update = {
            "type": "task.update",
            "payload": {
                "task_id": task_id,
                "status": status,
                "message": message,
                "progress": 100 if status in ["SUCCESS", "FAILED"] else 50,
                "timestamp": datetime.now().isoformat()
            }
        }
        
        await self.redis_client.publish("task_updates", json.dumps(update))
    
    async def _increment_success_metrics(self):
        """Update success metrics"""
        await self.redis_client.incr("metrics:total_checkouts")
        await self.redis_client.incr("metrics:successful_checkouts")
        
        # Update running tasks count
        running_count = len(self.running_tasks)
        await self.redis_client.set("metrics:running_tasks", running_count)
    
    async def shutdown(self):
        """Gracefully shutdown the service"""
        logger.info("Shutting down Checkout Service...")
        
        # Close HTTP client
        await self.http_client.aclose()
        
        # Close browser if initialized
        if 'browser' in self.engines:
            await self.engines['browser'].browser.close()
            await self.engines['browser'].playwright.stop()
        
        # Close Redis
        await self.redis_client.close()
        
        logger.info("Checkout Service shutdown complete")

async def main():
    """Main entry point"""
    service = CheckoutService()
    
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
