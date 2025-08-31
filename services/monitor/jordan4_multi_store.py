"""Multi-store monitoring workflow for Jordan 4 'Military Blue'."""

import asyncio
from service import MonitorService, MonitorConfig

# SKU identifiers for each retailer (placeholders)
JORDAN4_MILITARY_BLUE = {
    "snkrs": "FJ2260-100",       # Nike style code
    "footsites": "12345678",    # Footlocker product ID
    "finishline": "98765432",   # Finish Line SKU
}

MONITOR_INTERVAL_MS = 1000  # Poll every second


async def run() -> None:
    """Start monitors for all configured retailers."""
    service = MonitorService()
    await service.start()

    tasks = []
    for retailer, sku in JORDAN4_MILITARY_BLUE.items():
        config = MonitorConfig(
            monitor_id=f"{retailer}-jordan4-military-blue",
            sku=sku,
            retailer=retailer,
            interval_ms=MONITOR_INTERVAL_MS,
        )
        tasks.append(service._start_monitor(config))
    await asyncio.gather(*tasks)

    try:
        # Keep running until manually stopped
        await asyncio.Event().wait()
    finally:
        await service.shutdown()


if __name__ == "__main__":
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        pass
