from dataclasses import dataclass, asdict
from typing import Dict, List, Optional
from datetime import datetime
import json

@dataclass
class Proxy:
    """Proxy configuration and stats"""
    url: str
    provider: str
    proxy_type: str  # 'residential', 'isp', 'datacenter'
    location: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    sticky_session_id: Optional[str] = None
    requests: int = 0
    failures: int = 0
    success: int = 0
    total_bandwidth_mb: float = 0.0
    last_used: Optional[datetime] = None
    last_error: Optional[str] = None
    response_times: Optional[List[float]] = None
    
    def __post_init__(self):
        if self.response_times is None:
            self.response_times = []
    
    @property
    def auth_url(self) -> str:
        """Get proxy URL with authentication"""
        if self.username and self.password:
            protocol, rest = self.url.split('://', 1)
            return f"{protocol}://{self.username}:{self.password}@{rest}"
        return self.url
    
    @property
    def failure_rate(self) -> float:
        """Calculate failure rate"""
        total = self.requests
        return (self.failures / total * 100) if total > 0 else 0
    
    @property
    def avg_response_time(self) -> float:
        """Calculate average response time"""
        if not self.response_times:
            return 0
        return sum(self.response_times[-100:]) / len(self.response_times[-100:])
    
    @property
    def health_score(self) -> float:
        """Calculate overall health score (0-100)"""
        if self.requests == 0:
            return 100
        
        # Factors: success rate (60%), response time (30%), recency (10%)
        success_rate = (self.success / self.requests) * 60 if self.requests > 0 else 60
        
        # Response time score (lower is better, <500ms = full score)
        avg_time = self.avg_response_time
        time_score = max(0, 30 - (avg_time / 50)) if avg_time > 0 else 30
        
        # Recency score
        if self.last_used:
            minutes_ago = (datetime.now() - self.last_used).total_seconds() / 60
            recency_score = max(0, 10 - (minutes_ago / 6))  # Lose 1 point per 6 minutes
        else:
            recency_score = 10
            
        return min(100, success_rate + time_score + recency_score)
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for Redis storage"""
        data = asdict(self)
        data['last_used'] = self.last_used.isoformat() if self.last_used else ''
        if self.response_times is not None:
            data['response_times'] = json.dumps(self.response_times[-100:])  # Keep last 100
        else:
            data['response_times'] = json.dumps([])
        # Convert all None values to empty strings for Redis compatibility
        for k, v in data.items():
            if v is None:
                data[k] = ''
        return data
    
    @classmethod
    def from_dict(cls, data: Dict) -> 'Proxy':
        """Create from dictionary"""
        if data.get('last_used'):
            data['last_used'] = datetime.fromisoformat(data['last_used'])
        else:
            data['last_used'] = None

        if data.get('response_times') and isinstance(data['response_times'], str):
            data['response_times'] = json.loads(data['response_times'])

        # Convert numeric fields from string
        for field in ['requests', 'failures', 'success']:
            if field in data and data[field]:
                data[field] = int(data[field])
        if 'total_bandwidth_mb' in data and data['total_bandwidth_mb']:
            data['total_bandwidth_mb'] = float(data['total_bandwidth_mb'])

        return cls(**data)