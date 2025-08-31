# Frontend Handoff Notes

This document outlines the expected API contracts and real-time integration points for the Dharma frontend.

## API Contracts

Below are the expected data shapes for the main entities in the application. These are currently mocked, but should be replaced with API calls.

### Post

Represents a single post in the feed.

```typescript
type Post = {
  id: string;
  post_type: 'text' | 'heat_check' | 'intel_report';
  author: {
    name: string;
    avatarUrl?: string;
    isAnon: boolean;
  };
  distance: string; // e.g., "0.5 mi"
  timestamp: string; // ISO 8601 date string
  content?: string; // For text posts
  images?: string[]; // For heat_check posts
  store?: string; // For intel_report posts
  model?: string; // For intel_report posts
  sizes?: string; // For intel_report posts
  price?: string; // For intel_report posts
  karma: number;
};
```

### Vote

Represents an upvote or downvote action.

```typescript
type Vote = {
  post_id: string;
  direction: 'up' | 'down';
};
```

### Event (Drop Zone)

Represents a geofenced event.

```typescript
type DropZone = {
  id: string;
  name: string;
  radius: number; // in miles
  activeWindow: {
    start: string; // ISO 8601 date string
    end: string; // ISO 8601 date string
  };
  distance: string; // e.g., "2.1 mi"
};
```

### Profile

Represents a user profile.

```typescript
type Profile = {
  id: string;
  name: string;
  avatarUrl?: string;
  location: string; // e.g., "Brooklyn, NY"
  karma: number;
  badges: {
    id: string;
    name: string;
    iconUrl: string;
  }[];
};
```

## Real-time Integrations

### Event Feeds (Drop Zones)

The `EventFeed.tsx` component within the `DropZonesPage` is designed to show a real-time feed of posts scoped to a specific event. This is an ideal candidate for a WebSocket integration.

When a user "joins" a Drop Zone, the client should subscribe to a WebSocket channel for that event. The server should then push new posts and karma updates to all subscribed clients.

**File:** `frontend/src/pages/DropZonesPage.tsx` (and its child `EventFeed.tsx`)

```typescript
// TODO(websocket): Connect to WebSocket for real-time event feed updates
