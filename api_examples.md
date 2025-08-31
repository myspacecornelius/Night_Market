
# API Usage Examples

## Users

### Create a new user

```bash
curl -X POST "http://localhost:8000/users/" -H "Content-Type: application/json" -d '
{
  "username": "testuser",
  "display_name": "Test User",
  "avatar_url": "https://example.com/avatar.png",
  "is_anonymous": false
}'
```

### Get all users

```bash
curl -X GET "http://localhost:8000/users/"
```

## Posts

### Create a new post

```bash
curl -X POST "http://localhost:8000/posts/" -H "Content-Type: application/json" -d '
{
  "user_id": "your_user_id",
  "content_type": "text",
  "content_text": "This is a sample post.",
  "tags": ["#sample", "#fastapi"],
  "visibility": "public"
}'
```

### Get global feed

```bash
curl -X GET "http://localhost:8000/posts/global"
```

### Get local feed

```bash
curl -X GET "http://localhost:8000/posts/local?lat=34.0522&long=-118.2437&radius=10"
```

### Get posts by user

```bash
curl -X GET "http://localhost:8000/posts/user/your_user_id"
```

### Delete a post

```bash
curl -X DELETE "http://localhost:8000/posts/your_post_id"
```

### Get pre-signed URL for media upload

```bash
curl -X POST "http://localhost:8000/posts/upload-url/?file_name=my_image.jpg"
```

