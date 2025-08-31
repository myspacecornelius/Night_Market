import pytest
import asyncio
from services.proxy.manager import ProxyManager, Proxy, proxy_id
from services.proxy.utils.settings import SETTINGS
import fakeredis.aioredis

def test_initial_setup():
    """
    A simple test to confirm that the pytest setup is working.
    """
    assert True

@pytest.mark.asyncio
async def test_async_setup():
    """
    A simple async test to confirm that pytest-asyncio is working.
    """
    assert True

@pytest.mark.asyncio
async def test_get_proxy_uses_proxy_id():
    """ 
    Tests that get_proxy correctly uses proxy_id for lookups.
    This test will fail with the original code.
    """
    # 1. Setup
    manager = ProxyManager()
    # Replace the real Redis client with a fake one
    manager.redis_client = await fakeredis.aioredis.FakeRedis(decode_responses=True)

    # 2. Create and save a proxy
    test_proxy = Proxy(
        url="http://user:pass@example.com:8080",
        provider="test_provider",
        proxy_type="residential",
        location="us"
    )
    pid = proxy_id(test_proxy)

    # Save the proxy data using the correct key structure
    await manager.redis_client.hset(f"snpd:proxy:{pid}", mapping=test_proxy.to_dict())
    # Add the proxy's ID to the active set
    await manager.redis_client.sadd("snpd:proxies:active", pid)

    # 3. Act
    # Call the method that is expected to fail
    retrieved_proxy = await manager.get_proxy()

    # 4. Assert
    assert retrieved_proxy is not None
    assert retrieved_proxy.url == test_proxy.url
    assert proxy_id(retrieved_proxy) == pid