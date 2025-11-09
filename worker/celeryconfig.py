"""
Celery configuration for Night Market / Dharma
"""

import os
from kombu import Exchange, Queue

# Broker settings
broker_url = os.getenv('REDIS_URL', 'redis://redis:6379/0')
result_backend = os.getenv('REDIS_URL', 'redis://redis:6379/0')

# Task settings
task_serializer = 'json'
result_serializer = 'json'
accept_content = ['json']
timezone = 'UTC'
enable_utc = True

# Performance settings
worker_prefetch_multiplier = 4
worker_max_tasks_per_child = 1000
worker_disable_rate_limits = False
task_compression = 'gzip'

# Result backend settings
result_expires = 3600  # 1 hour
result_persistent = False
result_compression = 'gzip'

# Worker settings
worker_concurrency = os.cpu_count() or 4
worker_enable_remote_control = True
worker_send_task_events = True
task_send_sent_event = True

# Beat schedule for periodic tasks
beat_schedule = {
    'refresh-heatmap-cache': {
        'task': 'worker.tasks.refresh_heatmap_cache',
        'schedule': 300.0,  # Every 5 minutes
    },
    'daily-laces-stipend': {
        'task': 'worker.tasks.daily_laces_stipend',
        'schedule': 86400.0,  # Daily
    },
    'process-checkout-results': {
        'task': 'worker.tasks.process_checkout_results',
        'schedule': 1.0,  # Every second
    }
}

# Error handling
task_acks_late = True
task_reject_on_worker_lost = True
task_default_retry_delay = 60  # 1 minute
task_max_retries = 3
task_time_limit = 300  # 5 minutes
task_soft_time_limit = 240  # 4 minutes
