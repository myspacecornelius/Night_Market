
import os
import re
import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException
from services import schemas
from services.core.s3 import s3_client
from services.core.security import get_current_user
from services.models.user import User

router = APIRouter(
    prefix="/uploads",
    tags=["uploads"],
)

# Allowed file types for uploads
ALLOWED_FILE_TYPES = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif"
]

# Maximum file size in bytes (10MB)
MAX_FILE_SIZE = 10 * 1024 * 1024

def validate_file_upload(file_name: str, file_type: str):
    """Validate file upload parameters"""
    # Validate file type
    if file_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed types: {', '.join(ALLOWED_FILE_TYPES)}"
        )

    # Validate file name (no path traversal, reasonable length)
    if not file_name or len(file_name) > 255:
        raise HTTPException(status_code=400, detail="Invalid file name length")

    # Check for path traversal attempts
    if ".." in file_name or "/" in file_name or "\\" in file_name:
        raise HTTPException(status_code=400, detail="Invalid file name format")

    # Check for valid file extension
    valid_extensions = [".jpg", ".jpeg", ".png", ".webp", ".gif"]
    if not any(file_name.lower().endswith(ext) for ext in valid_extensions):
        raise HTTPException(status_code=400, detail="Invalid file extension")

    return True

@router.post("/presign", response_model=schemas.PresignedUrl)
def create_presigned_url(
    file_name: str,
    file_type: str,
    current_user: User = Depends(get_current_user)
):
    """Generate presigned URL for file upload (authenticated users only)"""
    # Validate upload parameters
    validate_file_upload(file_name, file_type)

    # Get bucket name from environment
    bucket_name = os.getenv("S3_BUCKET_NAME")
    if not bucket_name:
        raise HTTPException(
            status_code=500,
            detail="S3 bucket not configured. Please set S3_BUCKET_NAME environment variable."
        )

    # Generate unique file key with user ID prefix to avoid collisions
    import uuid
    unique_key = f"uploads/{current_user.user_id}/{uuid.uuid4()}_{file_name}"

    try:
        response = s3_client.generate_presigned_post(
            Bucket=bucket_name,
            Key=unique_key,
            Fields={"Content-Type": file_type},
            Conditions=[
                {"Content-Type": file_type},
                ["content-length-range", 0, MAX_FILE_SIZE]  # Enforce max file size
            ],
            ExpiresIn=3600,  # URL expires in 1 hour
        )
    except ClientError as e:
        raise HTTPException(status_code=400, detail=f"Failed to generate presigned URL: {e}")

    return response
