from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from starlette.applications import Starlette
from starlette.responses import Response, PlainTextResponse
from starlette.routing import Route

async def metrics(_):
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

async def live(_):
    return PlainTextResponse("OK")

app = Starlette(routes=[
    Route("/metrics", metrics),
    Route("/live", live),
])
