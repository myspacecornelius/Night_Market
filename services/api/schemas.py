"""
Enhanced Pydantic schemas for API validation and serialization
"""

from pydantic import BaseModel, Field, validator, EmailStr
from typing import Optional, List, Dict, Any, Union
from datetime import datetime
from enum import Enum
import uuid

# Enums
class TaskStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class MonitorStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    STOPPED = "stopped"
    ERROR = "error"

class RetailerType(str, Enum):
    SHOPIFY = "shopify"
    FOOTSITES = "footsites"
    SUPREME = "supreme"
    SNKRS = "snkrs"
    STOCKX = "stockx"
    GOAT = "goat"
    EBAY = "ebay"

class CheckoutMode(str, Enum):
    REQUEST = "request"
    BROWSER = "browser"
    HYBRID = "hybrid"

class NotificationType(str, Enum):
    DROP = "drop"
    RESTOCK = "restock"
    PRICE_DROP = "price_drop"
    DEAL = "deal"
    SYSTEM = "system"

class HeatType(str, Enum):
    DROP = "drop"
    RESTOCK = "restock"
    FIND = "find"

# Base Models
class BaseResponse(BaseModel):
    success: bool
    timestamp: datetime = Field(default_factory=datetime.now)
    request_id: str = Field(default_factory=lambda: str(uuid.uuid4()))

class PaginationParams(BaseModel):
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=100)
    sort_by: Optional[str] = None
    sort_order: Optional[str] = Field(default="desc", pattern="^(asc|desc)$")

# Auth Models
class AuthRequest(BaseModel):
    api_key: str = Field(..., min_length=10)
    device_id: Optional[str] = None
    
class AuthResponse(BaseResponse):
    token: str
    expires_at: datetime
    refresh_token: Optional[str] = None
    user_id: str

# Monitor Models
class MonitorRequest(BaseModel):
    sku: str = Field(..., min_length=3, max_length=100)
    retailer: RetailerType
    interval_ms: int = Field(default=200, ge=100, le=5000)
    size_filter: Optional[List[str]] = None
    price_threshold: Optional[float] = Field(None, ge=0)
    keywords: Optional[List[str]] = None
    webhook_url: Optional[str] = None
    
    @validator('size_filter')
    def validate_sizes(cls, v):
        if v:
            valid_sizes = [str(i) for i in range(35, 48)] + \
                         [f"{i}.5" for i in range(35, 47)]
            for size in v:
                if size not in valid_sizes:
                    raise ValueError(f"Invalid size: {size}")
        return v

class MonitorResponse(BaseResponse):
    monitor_id: str
    status: MonitorStatus
    estimated_cost_per_hour: float
    
class MonitorUpdate(BaseModel):
    status: Optional[MonitorStatus] = None
    interval_ms: Optional[int] = Field(None, ge=100, le=5000)
    size_filter: Optional[List[str]] = None
    price_threshold: Optional[float] = Field(None, ge=0)

# Checkout Models
class ProfileData(BaseModel):
    profile_name: str
    email: EmailStr
    phone: str = Field(..., pattern=r'^\+?1?\d{10,14}$')
    first_name: str = Field(..., min_length=1, max_length=50)
    last_name: str = Field(..., min_length=1, max_length=50)
    address_line1: str
    address_line2: Optional[str] = None
    city: str
    state: str = Field(..., min_length=2, max_length=2)
    zip_code: str = Field(..., pattern=r'^\d{5}(-\d{4})?$')
    country: str = Field(default="US", min_length=2, max_length=2)
    
class PaymentData(BaseModel):
    card_number: str = Field(..., min_length=13, max_length=19)
    card_holder: str
    exp_month: int = Field(..., ge=1, le=12)
    exp_year: int = Field(..., ge=datetime.now().year)
    cvv: str = Field(..., min_length=3, max_length=4)
    
    @validator('card_number')
    def validate_card(cls, v):
        # Remove spaces and validate
        v = v.replace(' ', '')
        if not v.isdigit():
            raise ValueError("Card number must contain only digits")
        return v

class CheckoutTaskRequest(BaseModel):
    monitor_id: str
    profile_id: str
    payment_id: str
    mode: CheckoutMode = CheckoutMode.REQUEST
    proxy_group: Optional[str] = None
    retry_count: int = Field(default=3, ge=0, le=10)
    
class CheckoutBatchRequest(BaseModel):
    count: int = Field(..., ge=1, le=500)
    monitor_id: str
    profile_ids: List[str]
    payment_ids: List[str]
    mode: CheckoutMode = CheckoutMode.REQUEST
    proxy_group: Optional[str] = None
    stagger_ms: int = Field(default=100, ge=0, le=5000)
    
    @validator('profile_ids', 'payment_ids')
    def validate_ids_count(cls, v, values):
        if 'count' in values and len(v) < values['count']:
            raise ValueError(f"Not enough IDs provided for task count")
        return v

class CheckoutTaskResponse(BaseResponse):
    task_id: str
    status: TaskStatus
    queue_position: Optional[int] = None

class CheckoutBatchResponse(BaseResponse):
    batch_id: str
    task_ids: List[str]
    total_cost_estimate: float

# Metrics Models
class MetricsTimeframe(str, Enum):
    HOUR = "1h"
    DAY = "24h"
    WEEK = "7d"
    MONTH = "30d"

class MetricsRequest(BaseModel):
    timeframe: MetricsTimeframe = MetricsTimeframe.DAY
    retailer: Optional[RetailerType] = None
    include_costs: bool = True

class MetricsResponse(BaseResponse):
    timeframe: MetricsTimeframe
    active_monitors: int
    running_tasks: int
    completed_tasks: int
    success_rate: float = Field(..., ge=0, le=100)
    avg_checkout_time_ms: int
    total_spent: Optional[float] = None
    proxy_health: Dict[str, Any]
    top_products: List[Dict[str, Any]]
    
# Stock Alert Models
class StockAlert(BaseModel):
    alert_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    monitor_id: str
    sku: str
    retailer: RetailerType
    sizes_available: List[str]
    price: float
    url: str
    timestamp: datetime = Field(default_factory=datetime.now)
    
class StockAlertResponse(BaseResponse):
    alerts: List[StockAlert]
    total: int

# Notification Models
class NotificationPreferences(BaseModel):
    email: bool = True
    push: bool = True
    sms: bool = False
    webhook: bool = False
    types: List[NotificationType] = Field(default_factory=lambda: list(NotificationType))
    quiet_hours: Optional[Dict[str, str]] = None  # {"start": "22:00", "end": "08:00"}
    
    @validator('quiet_hours')
    def validate_quiet_hours(cls, v):
        if v:
            import re
            time_pattern = re.compile(r'^([01]\d|2[0-3]):([0-5]\d)$')
            if not all(time_pattern.match(v.get(k, '')) for k in ['start', 'end']):
                raise ValueError("Invalid time format. Use HH:MM")
        return v

# WebSocket Models
class WSMessage(BaseModel):
    type: str
    channel: str
    payload: Dict[str, Any]
    timestamp: datetime = Field(default_factory=datetime.now)

class WSSubscribe(BaseModel):
    channels: List[str]
    auth_token: str

# Error Models
class ErrorDetail(BaseModel):
    code: str
    message: str
    field: Optional[str] = None
    
class ErrorResponse(BaseModel):
    success: bool = False
    error: ErrorDetail
    request_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=datetime.now)

# LACES Token Models
class LACESTransaction(BaseModel):
    transaction_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    amount: int
    reason: str
    reference_type: Optional[str] = None
    reference_id: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.now)

class LACESBalance(BaseModel):
    user_id: str
    balance: int
    lifetime_earned: int
    lifetime_spent: int
    rank: int
    percentile: float

# Community Features Models
"""
Enhanced Pydantic schemas for API validation and serialization
"""

from pydantic import BaseModel, Field, validator, EmailStr
from typing import Optional, List, Dict, Any, Union
from datetime import datetime
from enum import Enum
import uuid

# Enums
class TaskStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class MonitorStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    STOPPED = "stopped"
    ERROR = "error"

class RetailerType(str, Enum):
    SHOPIFY = "shopify"
    FOOTSITES = "footsites"
    SUPREME = "supreme"
    SNKRS = "snkrs"
    STOCKX = "stockx"
    GOAT = "goat"
    EBAY = "ebay"

class CheckoutMode(str, Enum):
    REQUEST = "request"
    BROWSER = "browser"
    HYBRID = "hybrid"

class NotificationType(str, Enum):
    DROP = "drop"
    RESTOCK = "restock"
    PRICE_DROP = "price_drop"
    DEAL = "deal"
    SYSTEM = "system"

class HeatType(str, Enum):
    DROP = "drop"
    RESTOCK = "restock"
    FIND = "find"

# Base Models
class BaseResponse(BaseModel):
    success: bool
    timestamp: datetime = Field(default_factory=datetime.now)
    request_id: str = Field(default_factory=lambda: str(uuid.uuid4()))

class PaginationParams(BaseModel):
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=100)
    sort_by: Optional[str] = None
    sort_order: Optional[str] = Field(default="desc", pattern="^(asc|desc)$")

# Auth Models
class AuthRequest(BaseModel):
    api_key: str = Field(..., min_length=10)
    device_id: Optional[str] = None
    
class AuthResponse(BaseResponse):
    token: str
    expires_at: datetime
    refresh_token: Optional[str] = None
    user_id: str

# Monitor Models
class MonitorRequest(BaseModel):
    sku: str = Field(..., min_length=3, max_length=100)
    retailer: RetailerType
    interval_ms: int = Field(default=200, ge=100, le=5000)
    size_filter: Optional[List[str]] = None
    price_threshold: Optional[float] = Field(None, ge=0)
    keywords: Optional[List[str]] = None
    webhook_url: Optional[str] = None
    
    @validator('size_filter')
    def validate_sizes(cls, v):
        if v:
            valid_sizes = [str(i) for i in range(35, 48)] + \
                         [f"{i}.5" for i in range(35, 47)]
            for size in v:
                if size not in valid_sizes:
                    raise ValueError(f"Invalid size: {size}")
        return v

class MonitorResponse(BaseResponse):
    monitor_id: str
    status: MonitorStatus
    estimated_cost_per_hour: float
    
class MonitorUpdate(BaseModel):
    status: Optional[MonitorStatus] = None
    interval_ms: Optional[int] = Field(None, ge=100, le=5000)
    size_filter: Optional[List[str]] = None
    price_threshold: Optional[float] = Field(None, ge=0)

# Checkout Models
class ProfileData(BaseModel):
    profile_name: str
    email: EmailStr
    phone: str = Field(..., pattern=r'^\+?1?\d{10,14}
)
    first_name: str = Field(..., min_length=1, max_length=50)
    last_name: str = Field(..., min_length=1, max_length=50)
    address_line1: str
    address_line2: Optional[str] = None
    city: str
    state: str = Field(..., min_length=2, max_length=2)
    zip_code: str = Field(..., pattern=r'^\d{5}(-\d{4})?
)
    country: str = Field(default="US", min_length=2, max_length=2)
    
class PaymentData(BaseModel):
    card_number: str = Field(..., min_length=13, max_length=19)
    card_holder: str
    exp_month: int = Field(..., ge=1, le=12)
    exp_year: int = Field(..., ge=datetime.now().year)
    cvv: str = Field(..., min_length=3, max_length=4)
    
    @validator('card_number')
    def validate_card(cls, v):
        # Remove spaces and validate
        v = v.replace(' ', '')
        if not v.isdigit():
            raise ValueError("Card number must contain only digits")
        return v

class CheckoutTaskRequest(BaseModel):
    monitor_id: str
    profile_id: str
    payment_id: str
    mode: CheckoutMode = CheckoutMode.REQUEST
    proxy_group: Optional[str] = None
    retry_count: int = Field(default=3, ge=0, le=10)
    
class CheckoutBatchRequest(BaseModel):
    count: int = Field(..., ge=1, le=500)
    monitor_id: str
    profile_ids: List[str]
    payment_ids: List[str]
    mode: CheckoutMode = CheckoutMode.REQUEST
    proxy_group: Optional[str] = None
    stagger_ms: int = Field(default=100, ge=0, le=5000)
    
    @validator('profile_ids', 'payment_ids')
    def validate_ids_count(cls, v, values):
        if 'count' in values and len(v) < values['count']:
            raise ValueError(f"Not enough IDs provided for task count")
        return v

class CheckoutTaskResponse(BaseResponse):
    task_id: str
    status: TaskStatus
    queue_position: Optional[int] = None

class CheckoutBatchResponse(BaseResponse):
    batch_id: str
    task_ids: List[str]
    total_cost_estimate: float

# Metrics Models
class MetricsTimeframe(str, Enum):
    HOUR = "1h"
    DAY = "24h"
    WEEK = "7d"
    MONTH = "30d"

class MetricsRequest(BaseModel):
    timeframe: MetricsTimeframe = MetricsTimeframe.DAY
    retailer: Optional[RetailerType] = None
    include_costs: bool = True

class MetricsResponse(BaseResponse):
    timeframe: MetricsTimeframe
    active_monitors: int
    running_tasks: int
    completed_tasks: int
    success_rate: float = Field(..., ge=0, le=100)
    avg_checkout_time_ms: int
    total_spent: Optional[float] = None
    proxy_health: Dict[str, Any]
    top_products: List[Dict[str, Any]]
    
# Stock Alert Models
class StockAlert(BaseModel):
    alert_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    monitor_id: str
    sku: str
    retailer: RetailerType
    sizes_available: List[str]
    price: float
    url: str
    timestamp: datetime = Field(default_factory=datetime.now)
    
class StockAlertResponse(BaseResponse):
    alerts: List[StockAlert]
    total: int

# Notification Models
class NotificationPreferences(BaseModel):
    email: bool = True
    push: bool = True
    sms: bool = False
    webhook: bool = False
    types: List[NotificationType] = Field(default_factory=lambda: list(NotificationType))
    quiet_hours: Optional[Dict[str, str]] = None  # {"start": "22:00", "end": "08:00"}
    
    @validator('quiet_hours')
    def validate_quiet_hours(cls, v):
        if v:
            import re
            time_pattern = re.compile(r'^([01]\d|2[0-3]):([0-5]\d)
)
            if not all(time_pattern.match(v.get(k, '')) for k in ['start', 'end']):
                raise ValueError("Invalid time format. Use HH:MM")
        return v

# WebSocket Models
class WSMessage(BaseModel):
    type: str
    channel: str
    payload: Dict[str, Any]
    timestamp: datetime = Field(default_factory=datetime.now)

class WSSubscribe(BaseModel):
    channels: List[str]
    auth_token: str

# Error Models
class ErrorDetail(BaseModel):
    code: str
    message: str
    field: Optional[str] = None
    
class ErrorResponse(BaseModel):
    success: bool = False
    error: ErrorDetail
    request_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=datetime.now)

# LACES Token Models
class LACESTransaction(BaseModel):
    transaction_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    amount: int
    reason: str
    reference_type: Optional[str] = None
    reference_id: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.now)

class LACESBalance(BaseModel):
    user_id: str
    balance: int
    lifetime_earned: int
    lifetime_spent: int
    rank: int
    percentile: float

# Community Features Models
class HeatMapEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: HeatType
    store_id: str
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    title: str
    description: Optional[str] = None
    user_id: str
    verified_count: int = 0
    images: Optional[List[str]] = None
    timestamp: datetime = Field(default_factory=datetime.now)

class HeatSubmit(BaseModel):
    type: HeatType
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    sku: str
    name: str

class DropZone(BaseModel):
    zone_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    radius_m: int = Field(..., ge=100, le=5000)
    active: bool = True
    subscriber_count: int = 0
    
# Prediction Models (for Deadstock Detective)
class PredictionRequest(BaseModel):
    sku: str
    brand: str
    model: str
    colorway: str
    retail_price: float
    release_date: Optional[datetime] = None
    
class PredictionResponse(BaseResponse):
    prediction_id: str
    sku: str
    appreciation_probability: float = Field(..., ge=0, le=1)
    restock_probability: float = Field(..., ge=0, le=1)
    predicted_peak_value: float
    predicted_peak_date: datetime
    confidence_score: float = Field(..., ge=0, le=1)
    factors: List[Dict[str, Any]]
    
# Validation Helpers
def validate_uuid(value: str) -> str:
    try:
        uuid.UUID(value)
        return value
    except ValueError:
        raise ValueError("Invalid UUID format")
