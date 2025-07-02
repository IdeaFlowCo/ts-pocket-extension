# ThoughtStream API Documentation

## Base URL
```
https://your-api-domain.com
```

## Authentication
Most endpoints require authentication via Bearer token in the Authorization header:
```
Authorization: Bearer YOUR_AUTH_TOKEN
```

## API Routes

### Health Check

#### GET /v1/health
Check API health status.

**Request:**
```bash
curl -X GET 'https://your-api-domain.com/v1/health'
```

**Response:**
```json
{
  "status": "ok"
}
```

---

### User Management

#### GET /v1/user
Get current authenticated user information.

**Request:**
```bash
curl -X GET 'https://your-api-domain.com/v1/user' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN'
```

**Response:**
```json
{
  "id": "user-123-abc-def",
  "email": "user@example.com",
  "handle": "username",
  "settings": {
    "theme": "light",
    "notifications": true
  }
}
```

#### DELETE /v1/user
Delete current user account.

**Request:**
```bash
curl -X DELETE 'https://your-api-domain.com/v1/user' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN'
```

**Response:**
```json
{
  "status": "success",
  "message": "User deleted successfully"
}
```

#### PATCH /v1/user
Update user information.

**Request:**
```bash
curl -X PATCH 'https://your-api-domain.com/v1/user' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "newemail@example.com",
    "name": "Updated Name"
  }'
```

**Response:**
```json
{
  "id": "user-123-abc-def",
  "email": "newemail@example.com",
  "name": "Updated Name"
}
```

#### POST /v1/users
Create a new user.

**Request:**
```bash
curl -X POST 'https://your-api-domain.com/v1/users' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "newuser@example.com",
    "handle": "newusername",
    "name": "New User"
  }'
```

**Response:**
```json
{
  "id": "user-456-ghi-jkl",
  "email": "newuser@example.com",
  "handle": "newusername"
}
```

#### POST /v1/user/initialize
Initialize user with default notes.

**Request:**
```bash
curl -X POST 'https://your-api-domain.com/v1/user/initialize' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN'
```

**Response:**
```json
{
  "status": true,
  "message": "User initialized with default notes"
}
```

#### PATCH /v1/user/settings
Update user settings.

**Request:**
```bash
curl -X PATCH 'https://your-api-domain.com/v1/user/settings' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "theme": "dark",
    "notifications": false,
    "language": "en"
  }'
```

**Response:**
```json
{
  "theme": "dark",
  "notifications": false,
  "language": "en"
}
```

#### PATCH /v1/user/handle
Update user handle/username.

**Request:**
```bash
curl -X PATCH 'https://your-api-domain.com/v1/user/handle' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "handle": "newusername"
  }'
```

**Response:**
```json
{
  "handle": "newusername",
  "status": "success"
}
```

#### GET /v1/users/:id/public-notes
Get public notes for a specific user (no auth required).

**Request:**
```bash
curl -X GET 'https://your-api-domain.com/v1/users/user-123-abc/public-notes'
```

**Response:**
```json
{
  "notes": [
    {
      "id": "note-123",
      "text": "Public note content",
      "createdAt": "2025-01-01T10:00:00Z",
      "readAll": true
    }
  ]
}
```

---

### Notes Management

#### GET /v1/delta
Get note changes since a specific timestamp.

**Request:**
```bash
curl -X GET 'https://your-api-domain.com/v1/delta?timestamp=2025-01-01T00:00:00Z&limit=100' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN'
```

**Response:**
```json
{
  "notes": [
    {
      "id": "note-123",
      "text": "Updated note",
      "updatedAt": "2025-01-02T10:00:00Z",
      "action": "update"
    }
  ],
  "checkpoint": "2025-01-02T10:00:00Z"
}
```

#### POST /v1/notes
Create or update notes (batch operation).

**Request:**
```bash
curl -X POST 'https://your-api-domain.com/v1/notes' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "notes": [
      {
        "id": "note-123-abc-def-456",
        "text": "This is my updated note text",
        "updatedAt": "2025-01-02T12:00:00Z",
        "createdAt": "2025-01-01T10:00:00Z",
        "userId": "user-789-ghi-jkl-012",
        "folderId": "folder-456-mno-pqr-789",
        "color": "#ffffff",
        "archived": false,
        "deleted": false,
        "readAll": false,
        "entities": [],
        "x": 100,
        "y": 200,
        "z": 1
      }
    ]
  }'
```

**Response:**
```json
{
  "data": [
    {
      "id": "note-123-abc-def-456",
      "status": "success"
    }
  ],
  "error": null
}
```

#### PATCH /v1/notes/:id/publish
Toggle note publish status.

**Request:**
```bash
curl -X PATCH 'https://your-api-domain.com/v1/notes/note-123/publish' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "visibility": true
  }'
```

**Response:**
```json
{
  "status": true
}
```

#### GET /v1/notes/stats
Get notes statistics.

**Request:**
```bash
curl -X GET 'https://your-api-domain.com/v1/notes/stats' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN'
```

**Response:**
```json
{
  "totalNotes": 150,
  "publicNotes": 25,
  "archivedNotes": 10,
  "notesPerFolder": {
    "folder-123": 50,
    "folder-456": 100
  }
}
```

#### POST /v1/notes/export-media
Queue media export for notes.

**Request:**
```bash
curl -X POST 'https://your-api-domain.com/v1/notes/export-media' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "exportImage": true,
    "exportAudio": false
  }'
```

**Response:**
```json
{
  "message": "ok"
}
```

#### GET /v1/public-notes/:noteId
Get a specific public note (no auth required).

**Request:**
```bash
curl -X GET 'https://your-api-domain.com/v1/public-notes/note-123-abc'
```

**Response:**
```json
{
  "id": "note-123-abc",
  "text": "Public note content",
  "createdAt": "2025-01-01T10:00:00Z",
  "author": {
    "handle": "username",
    "id": "user-123"
  }
}
```

---

### Folders

#### POST /v1/folders
Create or update folder.

**Request:**
```bash
curl -X POST 'https://your-api-domain.com/v1/folders' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "folder-123-abc",
    "name": "My Folder",
    "color": "#FF5733",
    "deleted": false,
    "createdAt": "2025-01-01T10:00:00Z",
    "updatedAt": "2025-01-01T10:00:00Z"
  }'
```

**Response:**
```json
{
  "data": {
    "id": "folder-123-abc",
    "name": "My Folder"
  },
  "error": null
}
```

---

### Entity Extraction

#### POST /v1/entities/extract
Extract entities from text.

**Request:**
```bash
curl -X POST 'https://your-api-domain.com/v1/entities/extract' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "text": "Meeting with John Doe at Apple headquarters tomorrow at 2pm"
  }'
```

**Response:**
```json
{
  "entities": [
    {
      "type": "PERSON",
      "text": "John Doe",
      "startIndex": 13,
      "endIndex": 21
    },
    {
      "type": "ORGANIZATION",
      "text": "Apple",
      "startIndex": 25,
      "endIndex": 30
    },
    {
      "type": "TIME",
      "text": "tomorrow at 2pm",
      "startIndex": 44,
      "endIndex": 59
    }
  ]
}
```

---

### Transcripts

#### POST /v1/transcripts
Start transcript processing.

**Request:**
```bash
curl -X POST 'https://your-api-domain.com/v1/transcripts' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "audioUrl": "https://example.com/audio.mp3",
    "language": "en"
  }'
```

**Response:**
```json
{
  "requestId": "transcript-request-123",
  "status": "processing"
}
```

#### GET /v1/transcripts/:requestId
Get transcript by request ID.

**Request:**
```bash
curl -X GET 'https://your-api-domain.com/v1/transcripts/transcript-request-123' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN'
```

**Response:**
```json
{
  "requestId": "transcript-request-123",
  "status": "completed",
  "transcript": "This is the transcribed text...",
  "duration": 120
}
```

---

### Files and Media

#### POST /v1/files
Upload file.

**Request:**
```bash
curl -X POST 'https://your-api-domain.com/v1/files' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -F 'file=@/path/to/file.pdf'
```

**Response:**
```json
{
  "fileName": "file-123-abc.pdf",
  "url": "https://storage.example.com/file-123-abc.pdf",
  "size": 1024000
}
```

#### GET /v1/files/:fileName
Get file by name (no auth required).

**Request:**
```bash
curl -X GET 'https://your-api-domain.com/v1/files/file-123-abc.pdf'
```

**Response:**
Binary file data

#### GET /v1/files/:fileName/metadata
Get file metadata (no auth required).

**Request:**
```bash
curl -X GET 'https://your-api-domain.com/v1/files/file-123-abc.pdf/metadata'
```

**Response:**
```json
{
  "fileName": "file-123-abc.pdf",
  "size": 1024000,
  "contentType": "application/pdf",
  "uploadedAt": "2025-01-01T10:00:00Z"
}
```

#### POST /v1/ocr
Extract text from image using OCR.

**Request:**
```bash
curl -X POST 'https://your-api-domain.com/v1/ocr' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "imageUrl": "https://example.com/image.png"
  }'
```

**Response:**
```json
{
  "text": "Extracted text from the image...",
  "confidence": 0.95
}
```

---

### Links

#### POST /v1/links/unfurl
Unfurl/preview link metadata.

**Request:**
```bash
curl -X POST 'https://your-api-domain.com/v1/links/unfurl' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://example.com/article"
  }'
```

**Response:**
```json
{
  "title": "Article Title",
  "description": "Article description...",
  "image": "https://example.com/preview.jpg",
  "url": "https://example.com/article"
}
```

---

### Version

#### GET /v1/versions
Get version information (no auth required).

**Request:**
```bash
curl -X GET 'https://your-api-domain.com/v1/versions'
```

**Response:**
```json
{
  "api": "1.0.0",
  "app": "2.5.0"
}
```

---

### Simon (AI/NLP Service)

#### GET /v1/simon/health
Simon service health check (no auth required).

**Request:**
```bash
curl -X GET 'https://your-api-domain.com/v1/simon/health'
```

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0"
}
```

#### POST /v1/simon/add-note
Add note to Simon index.

**Request:**
```bash
curl -X POST 'https://your-api-domain.com/v1/simon/add-note' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "noteId": "note-123",
    "text": "Note content to index",
    "userId": "user-123"
  }'
```

**Response:**
```json
{
  "status": "success",
  "indexed": true
}
```

#### POST /v1/simon/update-note
Update note in Simon index.

**Request:**
```bash
curl -X POST 'https://your-api-domain.com/v1/simon/update-note' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "noteId": "note-123",
    "text": "Updated note content",
    "userId": "user-123"
  }'
```

**Response:**
```json
{
  "status": "success",
  "updated": true
}
```

#### POST /v1/simon/delete-note
Delete note from Simon index.

**Request:**
```bash
curl -X POST 'https://your-api-domain.com/v1/simon/delete-note' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "noteId": "note-123",
    "userId": "user-123"
  }'
```

**Response:**
```json
{
  "status": "success",
  "deleted": true
}
```

#### POST /v1/simon/search
Search notes using Simon.

**Request:**
```bash
curl -X POST 'https://your-api-domain.com/v1/simon/search' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "meeting notes",
    "limit": 10
  }'
```

**Response:**
```json
{
  "results": [
    {
      "noteId": "note-123",
      "text": "Meeting with team...",
      "score": 0.95
    }
  ],
  "total": 1
}
```

#### POST /v1/simon/query
Query Simon for AI-powered responses.

**Request:**
```bash
curl -X POST 'https://your-api-domain.com/v1/simon/query' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "What were the key points from yesterdays meeting?",
    "context": "user-notes"
  }'
```

**Response:**
```json
{
  "response": "Based on your notes, the key points from yesterday's meeting were...",
  "sources": [
    {
      "noteId": "note-123",
      "relevance": 0.9
    }
  ]
}
```

---

### Analytics

#### POST /v1/analytics
Track analytics events.

**Request:**
```bash
curl -X POST 'https://your-api-domain.com/v1/analytics' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "event": "note_created",
    "properties": {
      "noteId": "note-123",
      "folderId": "folder-456"
    }
  }'
```

**Response:**
```json
{
  "status": "tracked"
}
```

---

### CloudWatch

#### POST /v1/cloudwatch
Upload logs to CloudWatch.

**Request:**
```bash
curl -X POST 'https://your-api-domain.com/v1/cloudwatch' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "logs": [
      {
        "timestamp": "2025-01-01T10:00:00Z",
        "message": "User action logged",
        "level": "info"
      }
    ]
  }'
```

**Response:**
```json
{
  "status": "uploaded",
  "count": 1
}
```

---

### V2 Routes (Non-REST)

#### GET /v1/userDelta
Get user-specific delta.

**Request:**
```bash
curl -X GET 'https://your-api-domain.com/v1/userDelta?checkpoint=1000' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN'
```

**Response:**
```json
{
  "notes": [...],
  "folders": [...],
  "checkpoint": 1050
}
```

#### GET /v1/userSettings
Get user settings.

**Request:**
```bash
curl -X GET 'https://your-api-domain.com/v1/userSettings' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN'
```

**Response:**
```json
{
  "theme": "light",
  "notifications": true,
  "language": "en"
}
```

#### GET /v1/userStats
Get user statistics.

**Request:**
```bash
curl -X GET 'https://your-api-domain.com/v1/userStats?checkpoint=1000' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN'
```

**Response:**
```json
{
  "totalNotes": 150,
  "totalFolders": 10,
  "lastActivity": "2025-01-01T10:00:00Z"
}
```

#### GET /v1/notesByUserId
Get notes by user ID with pagination.

**Request:**
```bash
curl -X GET 'https://your-api-domain.com/v1/notesByUserId?limit=100&offset=0' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN'
```

**Response:**
```json
[
  {
    "id": "note-123",
    "text": "Note content",
    "createdAt": "2025-01-01T10:00:00Z"
  }
]
```

#### GET /v1/foldersByUserId
Get folders by user ID.

**Request:**
```bash
curl -X GET 'https://your-api-domain.com/v1/foldersByUserId' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN'
```

**Response:**
```json
[
  {
    "id": "folder-123",
    "name": "My Folder",
    "color": "#FF5733"
  }
]
```

#### GET /v1/notesAndFoldersDelta
Get combined notes and folders delta.

**Request:**
```bash
curl -X GET 'https://your-api-domain.com/v1/notesAndFoldersDelta?checkpoint=1000' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN'
```

**Response:**
```json
{
  "notes": [...],
  "folders": [...],
  "checkpoint": 1050
}
```

#### POST /v1/notesByNoteIds
Get notes by multiple note IDs.

**Request:**
```bash
curl -X POST 'https://your-api-domain.com/v1/notesByNoteIds' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "noteIds": ["note-123", "note-456", "note-789"]
  }'
```

**Response:**
```json
[
  {
    "id": "note-123",
    "text": "Note content"
  },
  {
    "id": "note-456",
    "text": "Another note"
  }
]
```

#### GET /v1/noteIds
Get all note IDs for authenticated user.

**Request:**
```bash
curl -X GET 'https://your-api-domain.com/v1/noteIds' \
  -H 'Authorization: Bearer YOUR_AUTH_TOKEN'
```

**Response:**
```json
["note-123", "note-456", "note-789"]
```

---

## Error Responses

All endpoints may return error responses in the following format:

```json
{
  "error": "Error message",
  "message": "Detailed error description",
  "status": 400
}
```

Common HTTP status codes:
- 200: Success
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Internal Server Error

## Rate Limiting

API endpoints are rate-limited. Rate limit information is included in response headers:
- `X-RateLimit-Limit`: Request limit per hour
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Time when rate limit resets (Unix timestamp)
