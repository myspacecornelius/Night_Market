"""
SQLAlchemy database models for Sniped
"""

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, JSON, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, nullable=False)
    api_key = Column(String, unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)
    
    # Relationships
    monitors = relationship("Monitor", back_populates="user")
    tasks = relationship("CheckoutTask", back_populates="user")
    laces_transactions = relationship("LACESTransaction", back_populates="user")

class Monitor(Base):
    __tablename__ = "monitors"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    sku = Column(String, nullable=False)
    retailer = Column(String, nullable=False)
    status = Column(String, default="active")
    interval_ms = Column(Integer, default=200)
    size_filter = Column(JSON)
    price_threshold = Column(Float)
    keywords = Column(JSON)
    webhook_url = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="monitors")
    tasks = relationship("CheckoutTask", back_populates="monitor")
    stock_alerts = relationship("StockAlert", back_populates="monitor")

class CheckoutTask(Base):
    __tablename__ = "checkout_tasks"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    monitor_id = Column(String, ForeignKey("monitors.id"), nullable=False)
    batch_id = Column(String)
    profile_id = Column(String, nullable=False)
    payment_id = Column(String, nullable=False)
    status = Column(String, default="queued")
    mode = Column(String, default="request")
    proxy_group = Column(String)
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    error_message = Column(Text)
    checkout_url = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="tasks")
    monitor = relationship("Monitor", back_populates="tasks")

class StockAlert(Base):
    __tablename__ = "stock_alerts"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    monitor_id = Column(String, ForeignKey("monitors.id"), nullable=False)
    sku = Column(String, nullable=False)
    retailer = Column(String, nullable=False)
    sizes_available = Column(JSON)
    price = Column(Float)
    url = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    monitor = relationship("Monitor", back_populates="stock_alerts")

class LACESTransaction(Base):
    __tablename__ = "laces_transactions"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    amount = Column(Integer, nullable=False)
    reason = Column(String, nullable=False)
    reference_type = Column(String)
    reference_id = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="laces_transactions")

class HeatMapEvent(Base):
    __tablename__ = "heatmap_events"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    type = Column(String, nullable=False)  # drop, restock, find
    store_id = Column(String)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text)
    verified_count = Column(Integer, default=0)
    images = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)

class Profile(Base):
    __tablename__ = "profiles"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    profile_name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    address_line1 = Column(String, nullable=False)
    address_line2 = Column(String)
    city = Column(String, nullable=False)
    state = Column(String, nullable=False)
    zip_code = Column(String, nullable=False)
    country = Column(String, default="US")
    created_at = Column(DateTime, default=datetime.utcnow)

class Payment(Base):
    __tablename__ = "payments"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    card_holder = Column(String, nullable=False)
    card_last_four = Column(String, nullable=False)
    exp_month = Column(Integer, nullable=False)
    exp_year = Column(Integer, nullable=False)
    card_type = Column(String)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Prediction(Base):
    __tablename__ = "predictions"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    sku = Column(String, nullable=False)
    brand = Column(String, nullable=False)
    model = Column(String, nullable=False)
    colorway = Column(String, nullable=False)
    retail_price = Column(Float, nullable=False)
    appreciation_probability = Column(Float)
    restock_probability = Column(Float)
    predicted_peak_value = Column(Float)
    predicted_peak_date = Column(DateTime)
    confidence_score = Column(Float)
    factors = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)
