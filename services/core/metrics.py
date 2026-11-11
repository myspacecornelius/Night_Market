"""Prometheus metrics exported at /metrics.

Labels use the route template (``/v1/dropzones/{dropzone_id}``), never the raw
path, so the number of series stays bounded.
"""
from prometheus_client import Counter, Histogram

HTTP_REQUESTS = Counter(
    "http_requests_total", "HTTP requests handled", ["method", "route", "status"]
)
HTTP_REQUEST_DURATION = Histogram(
    "http_request_duration_seconds", "HTTP request duration in seconds", ["method", "route"]
)
LACES_LEDGER_ENTRIES = Counter(
    "laces_ledger_entries_total", "LACES ledger entries written", ["transaction_type"]
)
LACES_AMOUNT = Counter(
    "laces_amount_total", "LACES credited or debited", ["transaction_type", "direction"]
)
DROPZONE_CHECKINS = Counter("dropzone_checkins_total", "Successful drop zone check-ins")
POSTS_CREATED = Counter("posts_created_total", "Posts created", ["kind"])
