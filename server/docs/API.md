# Lumina Backend API Documentation

Welcome to the Lumina API documentation. This document serves as the reference guide for client integrations, exposing the backend architecture, authentication schemas, endpoints, response models, and media storage workflows.

---

## 1. Global Specifications

### Base URL
* **Development**: `http://localhost:8000/api/v1`
* **Production**: Set via `API_V1_PREFIX` / environment URL.

### Authentication
Most endpoints enforce authentication using **JSON Web Tokens (JWT)** generated via Supabase GoTrue.
* Header format: `Authorization: Bearer <jwt_access_token>`
* Public routes (no auth needed):
  * `POST /auth/signup` (IP-rate-limited)
  * `POST /auth/login` (IP-rate-limited)
  * `POST /auth/refresh` (IP-rate-limited)
  * `GET /health`
  * `GET /health/ready`

### Common Envelope Format
All successful responses are structured as a standard JSON envelope:
```json
{
  "data": { ... },
  "meta": { ... }
}
```

For paginated collections, the `data` field contains the list of items, and `meta` contains the page info:
```json
{
  "data": [ ... ],
  "meta": {
    "page": 1,
    "page_size": 10,
    "total": 45,
    "total_pages": 5,
    "has_more": true
  }
}
```

### Error Responses
Every handled exception is returned with an `error` body:
```json
{
  "error": {
    "code": "bad_request",
    "message": "Detailed explanation of the error",
    "details": null
  }
}
```
Common error codes:
* `unauthorized` (HTTP 401)
* `not_found` (HTTP 404)
* `bad_request` (HTTP 400)
* `payload_too_large` (HTTP 413)
* `rate_limit_exceeded` (HTTP 429)
* `provider_error` (HTTP 502)
* `service_unavailable` (HTTP 503)

---

## 2. Authentication Router (`/auth`)

### POST `/auth/signup`
Creates a user account and profile.
* **Headers**: `Content-Type: application/json`
* **Request Body**:
  ```json
  {
    "fullName": "Jane Doe",
    "email": "jane@example.com",
    "password": "strongpassword123"
  }
  ```
* **Response (HTTP 201)**:
  ```json
  {
    "data": {
      "access_token": "eyJhbG...",
      "refresh_token": "eXJ...",
      "expires_in": 3600,
      "user": {
        "id": "1111-...",
        "email": "jane@example.com"
      }
    }
  }
  ```

### POST `/auth/login`
Exchanges credentials for JWT access/refresh tokens.
* **Headers**: `Content-Type: application/json`
* **Request Body**:
  ```json
  {
    "email": "jane@example.com",
    "password": "strongpassword123"
  }
  ```
* **Response (HTTP 200)**: Same structure as `/signup`.

### POST `/auth/refresh`
Refreshes an expired session.
* **Request Body**:
  ```json
  {
    "refreshToken": "eXJ..."
  }
  ```
* **Response (HTTP 200)**: Same structure as `/signup`.

### POST `/auth/logout`
Revokes the caller's active session.
* **Headers**: `Authorization: Bearer <token>`
* **Response (HTTP 200)**:
  ```json
  {
    "data": {
      "message": "Session revoked."
    }
  }
  ```

### GET `/auth/me`
Retrieves current session identity and tier.
* **Headers**: `Authorization: Bearer <token>`
* **Response (HTTP 200)**:
  ```json
  {
    "data": {
      "id": "1111-...",
      "email": "jane@example.com",
      "name": "Jane Doe",
      "subscription": "pro",
      "createdAt": "2026-08-25T11:00:00Z"
    }
  }
  ```

---

## 3. Documents Router (`/documents`)

### GET `/documents`
Lists the caller's documents.
* **Headers**: `Authorization: Bearer <token>`
* **Query Params**: `page` (default 1), `page_size` (default 10)
* **Response (HTTP 200)**:
  ```json
  {
    "data": [
      {
        "id": "doc-uuid...",
        "title": "Quantum Mechanics Notes",
        "status": "completed",
        "size": "2.4 MB",
        "date": "2 hours ago",
        "topics": 3,
        "progress": 100,
        "file_type": "application/pdf"
      }
    ],
    "meta": { "page": 1, "page_size": 10, "total": 1 }
  }
  ```

### POST `/documents`
Uploads a new document (PDF, TXT, or MD) to Cloudinary raw storage and enqueues RAG ingestion.
* **Headers**: `Authorization: Bearer <token>`, `Content-Type: multipart/form-data`
* **Form-data**: `file: File`
* **Response (HTTP 202 Accepted)**:
  ```json
  {
    "data": {
      "document": {
        "id": "doc-uuid...",
        "title": "Quantum Mechanics Notes",
        "status": "pending",
        "size": "2.4 MB",
        "date": "Just now",
        "topics": 0,
        "progress": 0
      },
      "job": {
        "job_id": "job_123...",
        "status": "pending",
        "kind": "document_processing"
      }
    }
  }
  ```

### GET `/documents/{document_id}`
Returns details for one document including its generated study topics.
* **Headers**: `Authorization: Bearer <token>`
* **Response (HTTP 200)**:
  ```json
  {
    "data": {
      "id": "doc-uuid...",
      "title": "Quantum Mechanics Notes",
      "status": "completed",
      "size": "2.4 MB",
      "date": "2 hours ago",
      "topics": 1,
      "progress": 100,
      "uploaded": "2026-08-25 15:30",
      "topicsList": [
        {
          "id": "topic-uuid...",
          "name": "Schrodinger Equation",
          "desc": ""
        }
      ]
    }
  }
  ```

### GET `/documents/{document_id}/status`
Retrieves ingestion progress.
* **Headers**: `Authorization: Bearer <token>`
* **Response (HTTP 200)**:
  ```json
  {
    "data": {
      "document_id": "doc-uuid...",
      "status": "processing",
      "progress_pct": 45,
      "chunk_count": 0,
      "error_message": null
    }
  }
  ```

### DELETE `/documents/{document_id}`
Soft-deletes a document and triggers background deletion of the Cloudinary raw asset.
* **Headers**: `Authorization: Bearer <token>`
* **Response (HTTP 200)**:
  ```json
  {
    "data": {
      "message": "Document deleted."
    }
  }
  ```

---

## 4. Explore Router (`/explore`)

### POST `/explore/query`
Runs a grounded RAG query scoped to the selected document (or globally) and generates citations.
* **Headers**: `Authorization: Bearer <token>`, `Content-Type: application/json`
* **Request Body**:
  ```json
  {
    "query": "What is the Schrodinger equation?",
    "documentId": "doc-uuid...",
    "sessionId": null
  }
  ```
  *(Pass `sessionId` to continue an existing chat conversation)*
* **Response (HTTP 200)**:
  ```json
  {
    "data": {
      "sessionId": "chat-session-uuid...",
      "message": {
        "role": "assistant",
        "text": "The Schrodinger equation describes how the wave function of a quantum system evolves over time.",
        "sources": [
          "Quantum Mechanics Notes · section 2"
        ]
      }
    }
  }
  ```

### GET `/explore/conversations/{session_id}`
Retrieves chat history for a conversation.
* **Headers**: `Authorization: Bearer <token>`
* **Response (HTTP 200)**:
  ```json
  {
    "data": [
      {
        "id": "msg-1...",
        "role": "user",
        "content": "What is the Schrodinger equation?",
        "created_at": "2026-08-25T16:00:00Z"
      },
      {
        "id": "msg-2...",
        "role": "assistant",
        "content": "The Schrodinger equation...",
        "created_at": "2026-08-25T16:00:02Z"
      }
    ],
    "meta": { "page": 1, "page_size": 20, "total": 2 }
  }
  ```

---

## 5. Learning Routers (`/topics` & `/lessons`)

### GET `/topics`
Lists active study units (topics).
* **Headers**: `Authorization: Bearer <token>`
* **Response (HTTP 200)**:
  ```json
  {
    "data": [
      {
        "id": "topic-uuid...",
        "name": "Schrodinger Equation",
        "subject": "Quantum Mechanics Notes",
        "desc": "",
        "scenesCount": 3
      }
    ],
    "meta": { "page": 1, "page_size": 10, "total": 1 }
  }
  ```

### GET `/topics/{topic_id}`
Returns details for one topic.
* **Headers**: `Authorization: Bearer <token>`
* **Response (HTTP 200)**: Same structure as single topic in list.

### GET `/lessons`
Lists generated lessons.
* **Headers**: `Authorization: Bearer <token>`
* **Response (HTTP 200)**: Same structure as `/topics`.

### POST `/lessons`
Enqueues background generation of Socratic lesson scenes.
* **Headers**: `Authorization: Bearer <token>`, `Content-Type: application/json`
* **Request Body**:
  ```json
  {
    "documentId": "doc-uuid...",
    "sceneCount": 3,
    "focus": "Schrodinger equation derivation"
  }
  ```
* **Response (HTTP 202 Accepted)**:
  ```json
  {
    "data": {
      "lessonId": "lesson-uuid...",
      "job": {
        "job_id": "job_999...",
        "status": "pending",
        "kind": "lesson_generation"
      }
    }
  }
  ```

### GET `/lessons/{lesson_id}`
Retrieves a lesson with its generated scenes.
* **Headers**: `Authorization: Bearer <token>`
* **Response (HTTP 200)**:
  ```json
  {
    "data": {
      "id": "lesson-uuid...",
      "title": "Schrodinger Equation",
      "scenes": [
        {
          "id": "scene-1...",
          "title": "Introduction to Wave Functions",
          "content": "The wave function is a mathematical description of a quantum state...",
          "visualPrompt": "A graph showing a sinusoidal wave packet localized in space",
          "visualUrl": "https://res.cloudinary.com/...",
          "visualKind": "image",
          "sceneIndex": 0
        }
      ]
    }
  }
  ```

---

## 6. Socratic Crucible Router (`/crucible`)

### POST `/crucible/start`
Starts a fresh examiner assessment dialogue.
* **Headers**: `Authorization: Bearer <token>`, `Content-Type: application/json`
* **Request Body**:
  ```json
  {
    "topicId": "topic-uuid...",
    "difficulty": "Curious"
  }
  ```
  *(Difficulties: `Curious`, `Student`, `Expert`)*
* **Response (HTTP 200)**:
  ```json
  {
    "data": {
      "sessionId": "assessment-session-uuid...",
      "done": false,
      "turnsUsed": 0,
      "maxTurns": 5,
      "question": {
        "text": "What does a wave function represent?"
      }
    }
  }
  ```

### POST `/crucible/{session_id}/respond`
Submits student's response. Returns the next question, or the final scorecard if turns reach the limit.
* **Headers**: `Authorization: Bearer <token>`, `Content-Type: application/json`
* **Request Body**:
  ```json
  {
    "answer": "It represents the probability amplitude of finding a particle in a state."
  }
  ```
* **Response (HTTP 200)**:
  ```json
  {
    "data": {
      "done": false,
      "turnsUsed": 1,
      "maxTurns": 5,
      "nextQuestion": {
        "text": "Correct. How is this probability calculated from the wave function?"
      }
    }
  }
  ```

* **Response on final turn (`done` is true)**:
  ```json
  {
    "data": {
      "done": true,
      "turnsUsed": 5,
      "maxTurns": 5,
      "scorecard": {
        "overallFeedback": "Excellent understanding of probability densities, though physical boundaries need care.",
        "concepts": [
          {
            "name": "Probability Amplitude",
            "mastery": 90,
            "evidence": "Perfect explanation of Born's rule."
          }
        ]
      }
    }
  }
  ```

### GET `/crucible/sessions`
Lists caller's past assessments, paginated.
* **Headers**: `Authorization: Bearer <token>`
* **Response (HTTP 200)**:
  ```json
  {
    "data": [
      {
        "id": "session-uuid...",
        "topicId": "topic-uuid...",
        "topicName": "Schrodinger Equation",
        "difficulty": "Curious",
        "score": 85,
        "date": "Yesterday"
      }
    ],
    "meta": { "page": 1, "page_size": 10, "total": 1 }
  }
  ```

### GET `/crucible/sessions/{session_id}`
Returns details of a completed assessment session with entire dialogue transcripts.
* **Headers**: `Authorization: Bearer <token>`
* **Response (HTTP 200)**:
  ```json
  {
    "data": {
      "id": "session-uuid...",
      "topicName": "Schrodinger Equation",
      "difficulty": "Curious",
      "score": 85,
      "feedback": "...",
      "turns": [
        { "id": "t-1", "role": "examiner", "text": "..." },
        { "id": "t-2", "role": "student", "text": "..." }
      ],
      "concepts": [
        { "name": "Probability Amplitude", "mastery": 90, "evidence": "..." }
      ]
    }
  }
  ```

---

## 7. Mastery Router (`/mastery`)

### GET `/mastery/summary`
Retrieves caller's average mastery per subject.
* **Headers**: `Authorization: Bearer <token>`
* **Response (HTTP 200)**:
  ```json
  {
    "data": [
      {
        "subject": "Quantum Mechanics Notes.pdf",
        "mastery": 72
      }
    ]
  }
  ```

### GET `/mastery/map/{topic_id}`
Retrieves a detailed prerequisite map of concept understandings for a topic.
* **Headers**: `Authorization: Bearer <token>`
* **Response (HTTP 200)**:
  ```json
  {
    "data": {
      "topicId": "topic-uuid...",
      "topicName": "Schrodinger Equation",
      "concepts": [
        {
          "id": "c-1",
          "name": "Probability Amplitude",
          "mastery": 90,
          "prerequisites": []
        },
        {
          "id": "c-2",
          "name": "Wave Function Collapse",
          "mastery": 40,
          "prerequisites": ["c-1"]
        }
      ]
    }
  }
  ```

---

## 8. Media Router (`/media`)

### POST `/media/images`
Enqueues AI image generation via Imagen model.
* **Headers**: `Authorization: Bearer <token>`, `Content-Type: application/json`
* **Request Body**:
  ```json
  {
    "prompt": "A crystal structure showing copper atoms in fcc configuration",
    "lessonId": "lesson-uuid..."
  }
  ```
* **Response (HTTP 202 Accepted)**:
  ```json
  {
    "data": {
      "job": {
        "job_id": "job_img_123...",
        "status": "pending",
        "kind": "image_generation"
      }
    }
  }
  ```

### POST `/media/videos`
Enqueues AI video generation via VEO model.
* **Headers**: `Authorization: Bearer <token>`, `Content-Type: application/json`
* **Request Body**:
  ```json
  {
    "prompt": "An animation demonstrating electron probability orbitals",
    "lessonId": "lesson-uuid...",
    "aspectRatio": "16:9"
  }
  ```
* **Response (HTTP 202 Accepted)**: Same structure as `/images`.

### GET `/media`
Lists caller's generated assets.
* **Headers**: `Authorization: Bearer <token>`
* **Response (HTTP 200)**:
  ```json
  {
    "data": [
      {
        "id": "asset-uuid...",
        "url": "https://res.cloudinary.com/...",
        "publicId": "lumina/generated/...",
        "kind": "image",
        "format": "png",
        "width": 1024,
        "height": 1024,
        "prompt": "..."
      }
    ],
    "meta": { "page": 1, "page_size": 10, "total": 1 }
  }
  ```

### DELETE `/media/{asset_id}`
Deletes an asset and its Cloudinary media files.
* **Headers**: `Authorization: Bearer <token>`
* **Response (HTTP 200)**:
  ```json
  {
    "data": {
      "message": "Media deleted."
    }
  }
  ```

---

## 9. Realtime WebSocket (`/realtime/ws`)
Pushes live job completion status updates to the client (e.g. document parsed, lesson ready).
* **Connection URL**: `ws://localhost:8000/realtime/ws?token=<jwt_access_token>`
* **Data Flow**: Server-to-client unidirectional JSON event broadcast.
* **Inbound events**: Ignored. Connection closed if token is invalid or expires.
* **Outbound events**:
  ```json
  {
    "event": "job_status",
    "job_id": "job_123...",
    "status": "completed",
    "progress_pct": 100,
    "result": { ... }
  }
  ```

---

## 10. Health check Routers (`/health`)

### GET `/health`
* **Response**:
  ```json
  {
    "data": {
      "status": "ok",
      "service": "Lumina API",
      "version": "1.0.0"
    }
  }
  ```

### GET `/health/ready`
* **Response**:
  ```json
  {
    "data": {
      "status": "ready",
      "database": true,
      "providers": {
        "supabase": true,
        "gemini": true,
        "cloudinary": true,
        "veo": true
      }
    }
  }
  ```
