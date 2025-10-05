
from fastapi import APIRouter

from services.routers import users, posts, releases, subscriptions, uploads, auth
from services.routers import hyperlocal_subs, dropzones_ext, quests_ext, heatmap, laces, dashboard
from services.routers import signals, drops, stores

router = APIRouter()

router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(users.router, prefix="/users", tags=["users"])
router.include_router(posts.router, prefix="/posts", tags=["posts"])
router.include_router(releases.router, prefix="/releases", tags=["releases"])
router.include_router(subscriptions.router, prefix="/subscriptions", tags=["subscriptions"])
router.include_router(uploads.router, prefix="/uploads", tags=["uploads"])
router.include_router(hyperlocal_subs.router, prefix="/hyperlocal", tags=["hyperlocal-subscriptions"])
router.include_router(dropzones_ext.router, tags=["dropzones-ext"])
router.include_router(quests_ext.router, tags=["quests-ext"])
router.include_router(heatmap.router, prefix="/v1", tags=["heatmap"])
router.include_router(laces.router, prefix="/v1", tags=["laces"])
router.include_router(dashboard.router, prefix="/v1", tags=["dashboard"])
router.include_router(signals.router, prefix="/v1", tags=["signals"])
router.include_router(drops.router, prefix="/v1", tags=["drops"])
router.include_router(stores.router, prefix="/v1", tags=["stores"])
