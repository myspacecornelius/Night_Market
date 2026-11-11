"""Presigned uploads straight to S3.

Settings, read from the environment when a URL is requested:

  S3_BUCKET              the bucket uploads go to (the only place it is configured)
  AWS_ACCESS_KEY_ID /
  AWS_SECRET_ACCESS_KEY  optional: without them boto3's own credential chain is
                         used (an IAM role, a shared credentials file)
  AWS_REGION             the bucket's region
"""
import os
from functools import lru_cache
from typing import Optional

import boto3

# Largest object a presigned upload accepts; S3 enforces it through the signed policy.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
PRESIGN_EXPIRES_SECONDS = 3600

# Example values (.env.example, the bucket name this module used to sign for). A URL
# signed with them looks valid and is then rejected by S3, so they count as "not set".
PLACEHOLDER_VALUES = frozenset({
    "your-s3-bucket-name",
    "your_aws_access_key_here",
    "your_aws_secret_key_here",
})


class StorageNotConfigured(RuntimeError):
    """The bucket or the AWS credentials are missing; uploads cannot be signed."""


def _setting(name: str) -> Optional[str]:
    return (os.getenv(name) or "").strip() or None


def get_upload_bucket() -> str:
    bucket = _setting("S3_BUCKET")
    if bucket is None or bucket in PLACEHOLDER_VALUES:
        raise StorageNotConfigured("S3_BUCKET is not set")
    return bucket


@lru_cache(maxsize=4)
def _client_for(
    access_key_id: Optional[str],
    secret_access_key: Optional[str],
    session_token: Optional[str],
    region: Optional[str],
):
    """One client per configuration, built on first use (building one is slow)."""
    session = boto3.session.Session(
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
        aws_session_token=session_token,
        region_name=region,
    )
    if session.get_credentials() is None:
        # Not cached: lru_cache does not keep exceptions, so this is looked up again next time
        raise StorageNotConfigured("No AWS credentials were found")
    return session.client("s3")


def get_s3_client():
    access_key_id = _setting("AWS_ACCESS_KEY_ID")
    secret_access_key = _setting("AWS_SECRET_ACCESS_KEY")
    if (access_key_id is None) != (secret_access_key is None):
        raise StorageNotConfigured("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set together")
    if access_key_id in PLACEHOLDER_VALUES or secret_access_key in PLACEHOLDER_VALUES:
        raise StorageNotConfigured("The AWS credentials are still the example values")
    session_token = _setting("AWS_SESSION_TOKEN") if access_key_id else None
    return _client_for(access_key_id, secret_access_key, session_token, _setting("AWS_REGION"))


def create_presigned_upload(object_key: str, content_type: str) -> dict:
    """Sign a browser upload (POST) of one object.

    The signature is only valid for this key, this Content-Type and a body of
    1..MAX_UPLOAD_BYTES bytes. Returns {"url": ..., "fields": {...}}.

    Raises StorageNotConfigured when the bucket or credentials are missing, and
    botocore's BotoCoreError when signing fails for another reason.
    """
    bucket = get_upload_bucket()
    return get_s3_client().generate_presigned_post(
        Bucket=bucket,
        Key=object_key,
        Fields={"Content-Type": content_type},
        Conditions=[
            {"Content-Type": content_type},
            ["content-length-range", 1, MAX_UPLOAD_BYTES],
        ],
        ExpiresIn=PRESIGN_EXPIRES_SECONDS,
    )
