"""
Custom exceptions for Night Market API

This module defines standardized exceptions for consistent error handling
across the application.
"""
from typing import Optional, Dict, Any
from fastapi import HTTPException, status


class NightMarketException(Exception):
    """Base exception for all Night Market errors"""

    def __init__(
        self,
        message: str,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: Optional[Dict[str, Any]] = None
    ):
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)

    def to_http_exception(self) -> HTTPException:
        """Convert to FastAPI HTTPException"""
        return HTTPException(
            status_code=self.status_code,
            detail={
                "message": self.message,
                "type": self.__class__.__name__,
                **self.details
            }
        )


# Authentication & Authorization Exceptions
class AuthenticationError(NightMarketException):
    """Authentication failed"""

    def __init__(self, message: str = "Authentication failed"):
        super().__init__(message, status.HTTP_401_UNAUTHORIZED)


class InvalidCredentialsError(AuthenticationError):
    """Invalid username or password"""

    def __init__(self):
        super().__init__("Invalid username or password")


class TokenExpiredError(AuthenticationError):
    """JWT token has expired"""

    def __init__(self):
        super().__init__("Token has expired")


class InvalidTokenError(AuthenticationError):
    """Invalid or malformed token"""

    def __init__(self):
        super().__init__("Invalid or malformed token")


class AuthorizationError(NightMarketException):
    """Insufficient permissions"""

    def __init__(self, message: str = "Insufficient permissions"):
        super().__init__(message, status.HTTP_403_FORBIDDEN)


class AdminRequiredError(AuthorizationError):
    """Admin privileges required"""

    def __init__(self):
        super().__init__("Admin privileges required for this operation")


# Resource Exceptions
class ResourceNotFoundError(NightMarketException):
    """Requested resource not found"""

    def __init__(self, resource_type: str, resource_id: Optional[str] = None):
        message = f"{resource_type} not found"
        if resource_id:
            message += f": {resource_id}"
        super().__init__(message, status.HTTP_404_NOT_FOUND)


class UserNotFoundError(ResourceNotFoundError):
    """User not found"""

    def __init__(self, identifier: Optional[str] = None):
        super().__init__("User", identifier)


class PostNotFoundError(ResourceNotFoundError):
    """Post not found"""

    def __init__(self, post_id: Optional[str] = None):
        super().__init__("Post", post_id)


class SignalNotFoundError(ResourceNotFoundError):
    """Signal not found"""

    def __init__(self, signal_id: Optional[str] = None):
        super().__init__("Signal", signal_id)


class DropZoneNotFoundError(ResourceNotFoundError):
    """Drop zone not found"""

    def __init__(self, dropzone_id: Optional[str] = None):
        super().__init__("Drop zone", dropzone_id)


# Validation Exceptions
class ValidationError(NightMarketException):
    """Data validation failed"""

    def __init__(self, message: str, field: Optional[str] = None):
        details = {"field": field} if field else {}
        super().__init__(message, status.HTTP_422_UNPROCESSABLE_ENTITY, details)


class InvalidGeolocationError(ValidationError):
    """Invalid geolocation coordinates"""

    def __init__(self, latitude: float, longitude: float):
        super().__init__(
            f"Invalid coordinates: latitude={latitude}, longitude={longitude}",
            field="location"
        )


class InvalidFileTypeError(ValidationError):
    """Invalid file type for upload"""

    def __init__(self, file_type: str, allowed_types: list):
        super().__init__(
            f"File type '{file_type}' not allowed. Allowed types: {', '.join(allowed_types)}",
            field="file_type"
        )


# Business Logic Exceptions
class BusinessLogicError(NightMarketException):
    """Business logic constraint violated"""

    def __init__(self, message: str):
        super().__init__(message, status.HTTP_400_BAD_REQUEST)


class InsufficientLacesError(BusinessLogicError):
    """Insufficient LACES balance"""

    def __init__(self, required: int, available: int):
        super().__init__(
            f"Insufficient LACES balance. Required: {required}, Available: {available}"
        )
        self.details = {"required": required, "available": available}


class DailyLimitExceededError(BusinessLogicError):
    """Daily operation limit exceeded"""

    def __init__(self, operation: str, limit: int):
        super().__init__(
            f"Daily limit exceeded for {operation}. Limit: {limit}"
        )
        self.details = {"operation": operation, "limit": limit}


class AlreadyExistsError(BusinessLogicError):
    """Resource already exists"""

    def __init__(self, resource_type: str, identifier: str):
        super().__init__(
            f"{resource_type} already exists: {identifier}"
        )


class CannotBoostOwnContentError(BusinessLogicError):
    """Cannot boost own content"""

    def __init__(self):
        super().__init__("Cannot boost your own content")


class AlreadyClaimedError(BusinessLogicError):
    """Daily reward already claimed"""

    def __init__(self, reward_type: str = "Daily stipend"):
        super().__init__(f"{reward_type} already claimed today")


# Drop Zone Exceptions
class DropZoneError(NightMarketException):
    """Drop zone related error"""

    def __init__(self, message: str):
        super().__init__(message, status.HTTP_400_BAD_REQUEST)


class DropZoneNotActiveError(DropZoneError):
    """Drop zone is not currently active"""

    def __init__(self):
        super().__init__("Drop zone is not currently active")


class OutOfRangeError(DropZoneError):
    """User is out of range for check-in"""

    def __init__(self, distance: float, required: float):
        super().__init__(
            f"Too far from drop zone. Distance: {distance:.1f}m, Required: {required:.1f}m"
        )
        self.details = {"distance": distance, "required": required}


class AlreadyCheckedInError(DropZoneError):
    """Already checked in today"""

    def __init__(self):
        super().__init__("Already checked in today")


class DropZoneCapacityError(DropZoneError):
    """Drop zone at maximum capacity"""

    def __init__(self):
        super().__init__("Drop zone has reached maximum capacity")


# Rate Limiting Exception
class RateLimitExceededError(NightMarketException):
    """Rate limit exceeded"""

    def __init__(self, retry_after: int):
        super().__init__(
            f"Rate limit exceeded. Try again in {retry_after} seconds",
            status.HTTP_429_TOO_MANY_REQUESTS
        )
        self.details = {"retry_after": retry_after}


# External Service Exceptions
class ExternalServiceError(NightMarketException):
    """External service error"""

    def __init__(self, service_name: str, message: str):
        super().__init__(
            f"External service error ({service_name}): {message}",
            status.HTTP_503_SERVICE_UNAVAILABLE
        )
        self.details = {"service": service_name}


class S3UploadError(ExternalServiceError):
    """S3 upload failed"""

    def __init__(self, message: str):
        super().__init__("S3", message)


class RedisError(ExternalServiceError):
    """Redis operation failed"""

    def __init__(self, message: str):
        super().__init__("Redis", message)


# Database Exceptions
class DatabaseError(NightMarketException):
    """Database operation failed"""

    def __init__(self, message: str):
        super().__init__(
            f"Database error: {message}",
            status.HTTP_500_INTERNAL_SERVER_ERROR
        )


class DatabaseConnectionError(DatabaseError):
    """Database connection failed"""

    def __init__(self):
        super().__init__("Failed to connect to database")


# Helper function for exception handling in routes
def handle_exception(exc: Exception) -> HTTPException:
    """Convert any exception to HTTPException"""
    if isinstance(exc, NightMarketException):
        return exc.to_http_exception()
    elif isinstance(exc, HTTPException):
        return exc
    else:
        # Log unexpected exception
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Unexpected error: {exc}", exc_info=True)

        # Return generic error
        return HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred"
        )
