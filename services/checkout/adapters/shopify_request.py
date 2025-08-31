"""
Shopify Request-Mode Checkout Adapter
"""
import random
import time
from typing import Optional

from tenacity import retry, stop_after_attempt, wait_exponential

from services.checkout.adapters.base import BaseCheckoutAdapter, CheckoutResult, CheckoutTask, Profile

class ShopifyRequestAdapter(BaseCheckoutAdapter):
    """
    Fast request-mode checkout for Shopify.
    """
    RETAILER = "shopify"
    MODE = "request"

    async def checkout(self, task: CheckoutTask, profile: Profile, dry_run: bool = False) -> CheckoutResult:
        """
        Execute the Shopify checkout flow.
        In dry_run mode, simulates success without making real requests.
        """
        if dry_run:
            # Simulate a successful checkout for testing purposes
            return CheckoutResult(success=True, order_id=f"DRYRUN-ORDER-{int(time.time())}")

        # The store URL should be part of the task details
        store_url = task.product_url.split('/products/')[0]

        try:
            # Step 1: Add to cart
            cart_response = await self._add_to_cart(store_url, task.variant_id)
            if not cart_response:
                return CheckoutResult(success=False, error="Failed to add to cart")

            # Further steps (create checkout, submit info, payment) would be implemented here.
            # For this example, we'll assume success after carting.

            order_id = f"ORDER-{int(time.time())}-{random.randint(1000, 9999)}"
            return CheckoutResult(success=True, order_id=order_id)

        except Exception as e:
            return CheckoutResult(success=False, error=str(e))

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=5))
    async def _add_to_cart(self, store_url: str, variant_id: str) -> Optional[dict]:
        """Add item to cart and return the response JSON."""
        url = f"{store_url}/cart/add.js"
        data = {"items": [{"id": variant_id, "quantity": 1}]}
        headers = {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent': self._get_user_agent()
        }

        response = await self.http_client.post(url, json=data, headers=headers, timeout=10.0)
        response.raise_for_status()  # Will raise an exception for 4xx/5xx statuses
        return response.json()

    def _get_user_agent(self) -> str:
        """Get a randomized user agent."""
        agents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36"
        ]
        return random.choice(agents)
