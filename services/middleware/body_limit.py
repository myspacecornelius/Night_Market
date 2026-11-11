"""Reject request bodies larger than a fixed size.

Without a cap, one request could make the server buffer and parse an arbitrarily
large body before any authentication or validation ran.
"""
from __future__ import annotations

import json

from starlette.types import ASGIApp, Message, Receive, Scope, Send

DEFAULT_MAX_BODY_BYTES = 1024 * 1024  # 1 MiB; uploads go straight to object storage, not through the API


class BodySizeLimitMiddleware:
    def __init__(self, app: ASGIApp, max_body_bytes: int = DEFAULT_MAX_BODY_BYTES):
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def _reject(self, send: Send) -> None:
        body = json.dumps({"detail": f"Request body is larger than {self.max_body_bytes} bytes"}).encode()
        await send({
            "type": "http.response.start",
            "status": 413,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
                (b"connection", b"close"),
            ],
        })
        await send({"type": "http.response.body", "body": body})

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        declared = dict(scope.get("headers") or []).get(b"content-length")
        if declared is not None:
            try:
                too_large = int(declared) > self.max_body_bytes
            except ValueError:
                too_large = True
            if too_large:
                await self._reject(send)
                return

        # A body sent without Content-Length (chunked) is counted as it arrives. Once it
        # passes the limit the 413 is sent, the application is told the client went away
        # so it stops reading, and whatever it still tries to send is dropped.
        received = 0
        response_started = False
        rejected = False

        async def counting_receive() -> Message:
            nonlocal received, rejected
            if rejected:
                return {"type": "http.disconnect"}
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_body_bytes:
                    rejected = True
                    if not response_started:
                        await self._reject(send)
                    return {"type": "http.disconnect"}
            return message

        async def tracking_send(message: Message) -> None:
            nonlocal response_started
            if rejected:
                return
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        await self.app(scope, counting_receive, tracking_send)
