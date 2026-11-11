
import logging
import uuid
from typing import Optional

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.exceptions import RequestValidationError

from services import models, schemas
from services.core.auth import get_current_active_user
from services.core.s3 import MAX_UPLOAD_BYTES, StorageNotConfigured, create_presigned_upload
from services.schemas.upload import IMAGE_EXTENSIONS, ImageContentType, PresignRequest

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/uploads",
    tags=["uploads"],
)

@router.post("/presign", response_model=schemas.PresignedUrl)
def create_presigned_url(
    file_type: Optional[ImageContentType] = Query(None),
    file_name: Optional[str] = Query(None, max_length=255),
    body: Optional[PresignRequest] = None,
    current_user: models.User = Depends(get_current_active_user),
):
    """Sign an image upload for the caller.

    `file_type` (and optionally `file_name`) may be sent as query parameters or as a
    JSON body. The object key is built here, under the caller's own prefix; the
    client's file name is never part of it.
    """
    content_type = body.file_type if body is not None else file_type
    if content_type is None:
        raise RequestValidationError(
            [{"type": "missing", "loc": ("query", "file_type"), "msg": "Field required", "input": None}]
        )

    object_key = f"uploads/{current_user.user_id}/{uuid.uuid4().hex}{IMAGE_EXTENSIONS[content_type]}"
    try:
        presigned = create_presigned_upload(object_key, content_type.value)
    except StorageNotConfigured as exc:
        logger.warning("Upload refused, storage is not configured: %s", exc)
        raise HTTPException(status_code=503, detail="File uploads are not configured on this server") from exc
    except (BotoCoreError, ClientError) as exc:
        logger.error("Could not sign an upload: %s", exc)
        raise HTTPException(status_code=503, detail="File uploads are temporarily unavailable") from exc

    return {"url": presigned["url"], "fields": presigned["fields"], "key": object_key, "max_bytes": MAX_UPLOAD_BYTES}
