"""
Base classes for checkout adapters.
"""
from abc import ABC, abstractmethod
from typing import ClassVar
import httpx
from services.checkout.service import CheckoutTask, Profile, CheckoutResult

class BaseCheckoutAdapter(ABC):
    """
    Abstract base class for all checkout adapters.
    """
    # Unique identifier for the retailer (e.g., "shopify", "nike")
    RETAILER: ClassVar[str] = ""
    # Mode of operation (e.g., "request", "browser")
    MODE: ClassVar[str] = ""

    def __init__(self, http_client: httpx.AsyncClient):
        if not self.RETAILER or not self.MODE:
            raise NotImplementedError("Adapters must define RETAILE R and MODE class variables.")
        self.http_client = http_client

    @abstractmethod
    async def checkout(self, task: CheckoutTask, profile: Profile, dry_run: bool = False) -> CheckoutResult:
        """
        Execute the checkout process for a given task.

        :param task: The checkout task details.
        :param profile: The user profile for the checkout.
        :param dry_run: If True, simulate the checkout without making real purchases.
        :return: A CheckoutResult object.
        """
        pass

    @property
    def key(self) -> str:
        """A unique key for the adapter, used for registration."""
        return f"{self.RETAILER}_{self.MODE}"
