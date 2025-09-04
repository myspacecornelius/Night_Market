
import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException
from services import schemas
from services.core.s3 import s3_client

router = APIRouter(
    prefix="/uploads",
    tags=["uploads"],
)

@router.post("/presign", response_model=schemas.PresignedUrl)
def create_presigned_url(file_name: str, file_type: str):
    # TODO: Add validation for file_name and file_type
    # TODO: Get bucket name from config
    bucket_name = "your-s3-bucket-name"

    try:
        response = s3_client.generate_presigned_post(
            Bucket=bucket_name,
            Key=file_name,
            Fields={"Content-Type": file_type},
            Conditions=[{"Content-Type": file_type}],
            ExpiresIn=3600,
        )
    except ClientError as e:
        raise HTTPException(status_code=400, detail=f"Failed to generate presigned URL: {e}")

    return response
