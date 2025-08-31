import pytest
from services.proxy.keys import (
    proxy_detail_key,
    inflight_key,
    ACTIVE_PROXIES_SET,
    BURNED_PROXIES_SET,
)

def test_key_generation():
    """Tests that the key generation functions produce the correct keys."""
    proxy_id = "test_provider:residential:none:12345abcde"

    assert proxy_detail_key(proxy_id) == "snpd:proxy:test_provider:residential:none:12345abcde"
    assert inflight_key(proxy_id) == "snpd:proxy:test_provider:residential:none:12345abcde:inflight"
    assert ACTIVE_PROXIES_SET == "snpd:proxies:active"
    assert BURNED_PROXIES_SET == "snpd:proxies:burned"
