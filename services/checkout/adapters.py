
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional

from services.checkout.service import CheckoutTask, Profile, CheckoutResult

class BaseCheckoutAdapter(ABC):
    """Abstract base class for all checkout adapters."""

    @abstractmethod
    async def checkout(self, task: CheckoutTask, profile: Profile) -> CheckoutResult:
        """
        Executes the checkout process for a given task and profile.

        Args:
            task: The checkout task to be executed.
            profile: The user profile to be used for the checkout.

        Returns:
            A CheckoutResult object representing the outcome of the checkout.
        """
        pass

    @property
    @abstractmethod
    def retailer(self) -> str:
        """
        Returns the name of the retailer that this adapter supports.
        """
        pass

    @property
    @abstractmethod
    def mode(self) -> str:
        """
        Returns the checkout mode that this adapter supports (e.g., 'request', 'browser').
        """
        pass


class AdapterRegistry:
    """
    A registry for discovering and managing checkout adapters.
    """

    def __init__(self):
        self._adapters: Dict[str, BaseCheckoutAdapter] = {}

    def register(self, adapter: BaseCheckoutAdapter):
        """
        Registers a new checkout adapter.
        """
        key = f"{adapter.retailer.lower()}_{adapter.mode.lower()}"
        if key in self._adapters:
            raise ValueError(f"Adapter with key '{key}' is already registered.")
        self._adapters[key] = adapter

    def get_adapter(self, retailer: str, mode: str) -> Optional[BaseCheckoutAdapter]:
        """
        Returns the checkout adapter for the a given retailer and mode.
        """
        key = f"{retailer.lower()}_{mode.lower()}"
        return self._adapters.get(key)


