import asyncio
import random
from playwright.async_api import Page

class Humanize:
    """
    A class to make Playwright actions more human-like to evade bot detection.
    """

    def __init__(self, page: Page):
        self.page = page

    async def a_type(self, selector: str, text: str, delay_range: tuple = (50, 150)):
        """Types text into an element with random delays between keystrokes."""
        for char in text:
            await self.page.type(selector, char, delay=random.randint(*delay_range))

    async def a_click(self, selector: str, delay_range: tuple = (100, 300)):
        """Moves the mouse to an element with a bezier curve and then clicks."""
        element = await self.page.wait_for_selector(selector)
        box = await element.bounding_box()
        if not box:
            return

        x = box['x'] + box['width'] / 2
        y = box['y'] + box['height'] / 2
        
        await self.page.mouse.move(
            x + random.uniform(-5, 5),
            y + random.uniform(-5, 5),
            steps=random.randint(10, 20)
        )
        await asyncio.sleep(random.uniform(delay_range[0] / 1000, delay_range[1] / 1000))
        await self.page.mouse.down()
        await asyncio.sleep(random.uniform(0.05, 0.15))
        await self.page.mouse.up()

    async def a_scroll(self, scrolls: int = 5, scroll_delay_range: tuple = (0.5, 1.5)):
        """Scrolls the page randomly to mimic human reading behavior."""
        for _ in range(scrolls):
            await self.page.evaluate(f'window.scrollBy(0, {random.randint(100, 500)})')
            await asyncio.sleep(random.uniform(*scroll_delay_range))
