# Dharma API Documentation

## Base URL
```
Development: http://localhost:8000
Production: https://api.dharma.network
```

## Authentication
Most endpoints require authentication. Include JWT token in header:
```
Authorization: Bearer <token>
```

---

## Heatmap API

### Get Heatmap Data
```http
GET /v1/heatmap
```

**Query Parameters:**
- `min_lat` (float, required): Southwest corner latitude
- `min_lon` (float, required): Southwest corner longitude
- `max_lat` (float, required): Northeast corner latitude
- `max_lon` (float, required): Northeast corner longitude
- `zoom` (int, optional): Geohash precision 1-12 (default: 6)
- `window` (string, optional): Time window - `1h`, `6h`, `24h`, `7d` (default: `24h`)

**Response:**
```json
{
  "bbox": {
    "min_lat": 42.3,
    "min_lon": -71.1,
    "max_lat": 42.4,
    "max_lon": -71.0
  },
  "zoom": 6,
  "window": "24h",
  "generated_at": "2025-01-06T12:00:00Z",
  "cells": [
    {
      "geohash": "drt2z0",
      "count": 45,
      "intensity": 0.8
    }
  ]
}
```

### Refresh Heatmap Cache
```http
POST /v1/heatmap/refresh
```

---

## Drop Zones API

### List Drop Zones
```http
GET /v1/dropzones
```

**Query Parameters:**
- `bbox` (string, optional): Bounding box `min_lng,min_lat,max_lng,max_lat`
- `active` (boolean, optional): Filter by active status
- `limit` (int, optional): Max results (default: 50, max: 100)
- `offset` (int, optional): Pagination offset (default: 0)

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Newbury Street Drop",
    "description": "Weekly sneaker meetup",
    "owner_id": "uuid",
    "center_lat": 42.3505,
    "center_lng": -71.0795,
    "radius_meters": 100.0,
    "status": "ACTIVE",
    "starts_at": "2025-01-06T18:00:00Z",
    "ends_at": "2025-01-06T20:00:00Z",
    "member_count": 25,
    "check_in_count": 12,
    "created_at": "2025-01-01T00:00:00Z"
  }
]
```

### Get Drop Zone Details
```http
GET /v1/dropzones/{id}
```

**Response:** Same as list, plus:
```json
{
  "rules": "No resellers",
  "tags": ["sneakers", "streetwear"],
  "is_public": true,
  "stats": {
    "member_count": 25,
    "total_checkins": 145,
    "today_checkins": 8
  },
  "recent_checkins": [...]
}
```

### Create Drop Zone
```http
POST /v1/dropzones
```

**Request Body:**
```json
{
  "name": "Newbury Street Drop",
  "description": "Weekly sneaker meetup",
  "center_lat": 42.3505,
  "center_lng": -71.0795,
  "radius_meters": 100.0,
  "check_in_radius": 50.0,
  "starts_at": "2025-01-06T18:00:00Z",
  "ends_at": "2025-01-06T20:00:00Z",
  "max_capacity": 50,
  "rules": "No resellers",
  "tags": ["sneakers", "streetwear"],
  "is_public": true
}
```

### Check In to Drop Zone
```http
POST /v1/dropzones/{id}/checkin
```

**Request Body:**
```json
{
  "lat": 42.3505,
  "lng": -71.0795,
  "message": "Here for the drop!",
  "photo_url": "https://..."
}
```

**Response:**
```json
{
  "success": true,
  "check_in_id": "uuid",
  "distance_from_center": 35.5,
  "streak_count": 5,
  "points_earned": 20,
  "message": "Successfully checked in! Streak: 5, Points: 20"
}
```

**Error Responses:**
- `400`: Too far from drop zone
- `400`: Already checked in today
- `400`: Drop zone not active
- `404`: Drop zone not found

### Join Drop Zone
```http
POST /v1/dropzones/{id}/join
```

---

## LACES Token API

### Get Balance
```http
GET /v1/laces/balance
```

**Response:**
```json
{
  "balance": 1250,
  "user_id": "uuid",
  "last_stipend": "2025-01-06T00:00:00Z",
  "total_earned": 2500,
  "total_spent": 1250
}
```

### Get Transaction History
```http
GET /v1/laces/ledger
```

**Query Parameters:**
- `page` (int, optional): Page number (default: 1)
- `limit` (int, optional): Results per page (default: 20, max: 100)
- `transaction_type` (string, optional): Filter by type

**Response:**
```json
{
  "transactions": [
    {
      "id": "uuid",
      "amount": 100,
      "transaction_type": "DAILY_STIPEND",
      "related_post_id": null,
      "created_at": "2025-01-06T00:00:00Z",
      "description": "Daily LACES stipend"
    }
  ],
  "total_count": 50,
  "page": 1,
  "limit": 20
}
```

### Get Earning Opportunities
```http
GET /v1/laces/opportunities
```

**Response:**
```json
{
  "opportunities": [
    {
      "type": "daily_stipend",
      "reward": 100,
      "description": "Claim your daily LACES stipend"
    },
    {
      "type": "helpful_post",
      "reward": 25,
      "description": "Share helpful content (2/5 today)"
    }
  ],
  "daily_stipend_claimed": false,
  "posts_today": 2,
  "checkins_today": 0
}
```

### Claim Daily Stipend
```http
POST /v1/laces/daily-stipend
```

**Response:**
```json
{
  "transaction_id": "uuid",
  "new_balance": 1350,
  "amount": 100,
  "transaction_type": "DAILY_STIPEND",
  "message": "Daily stipend claimed! +100 LACES"
}
```

**Error:**
- `400`: Daily stipend already claimed

### Boost Post
```http
POST /v1/laces/boost-post/{post_id}?boost_amount=10
```

**Response:**
```json
{
  "success": true,
  "boost_amount": 10,
  "author_reward": 5,
  "new_boost_score": 45,
  "remaining_balance": 1240
}
```

**Errors:**
- `400`: Insufficient balance
- `400`: Cannot boost own post
- `404`: Post not found

### Grant LACES (Admin Only)
```http
POST /v1/laces/grant
```

**Request Body:**
```json
{
  "user_id": "uuid",
  "amount": 50,
  "transaction_type": "ADMIN_ADD",
  "related_post_id": null,
  "description": "Contest reward"
}
```

---

## Transaction Types

### Earning Types (Positive)
- `DAILY_STIPEND`: Daily allowance (100 LACES)
- `POST_REWARD`: Creating quality posts (5 LACES)
- `CHECKIN_REWARD`: Drop zone check-ins (3-30 LACES with streak bonus)
- `BOOST_RECEIVED`: Someone boosted your post (50% of boost)
- `SIGNAL_REWARD`: High-quality location signals
- `CONTEST_REWARD`: Community contests
- `ADMIN_ADD`: Manual admin grant
- `REFUND`: Refund from purchase

### Spending Types (Negative)
- `BOOST_SENT`: Boosting others' posts
- `PURCHASE`: Buying items/features
- `CHECKOUT_TASK_PURCHASE`: Purchasing checkout tasks
- `ADMIN_REMOVE`: Manual admin deduction

---

## Rate Limits

- Default: 60 requests per minute per user
- Burst: 10 additional requests
- Heatmap: Cached for 5 minutes
- Daily stipend: Once per 24 hours

---

## Error Responses

All endpoints return errors in this format:
```json
{
  "detail": "Error message"
}
```

**Status Codes:**
- `200`: Success
- `400`: Bad request / validation error
- `401`: Unauthorized / missing auth
- `403`: Forbidden / insufficient permissions
- `404`: Resource not found
- `429`: Rate limit exceeded
- `500`: Internal server error

---

## Webhooks (Coming Soon)

Subscribe to real-time events:
- `laces.earned`: When user earns LACES
- `dropzone.checkin`: When someone checks into a zone
- `post.boosted`: When a post receives a boost

---

## WebSocket (Coming Soon)

Connect to real-time feed:
```
ws://localhost:8000/ws/feed
```
