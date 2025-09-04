
import boto3
import os
from botocore.exceptions import NoCredentialsError

S3_BUCKET = os.getenv("S3_BUCKET")
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION")

s3_client = boto3.client(
    's3',
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    region_name=AWS_REGION
)

def create_presigned_url(object_name, expiration=3600):
    """Generate a presigned URL to share an S3 object

    :param object_name: string
    :param expiration: Time in seconds for the presigned URL to remain valid
    :return: Presigned URL as string. If error, returns None.
    """

    try:
        response = s3_client.generate_presigned_post(
            S3_BUCKET,
            object_name,
            Fields=None,
            Conditions=None,
            ExpiresIn=expiration
        )
    except NoCredentialsError:
        print("Credentials not available")
        return None

    return response

