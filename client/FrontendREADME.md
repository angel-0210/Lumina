# Lumina — Frontend Documentation

**Project:** Lumina — AI-Powered Learning Platform  
**Module:** React Native + Expo Mobile Application  
**Version:** 1.0  
**Date:** August 22, 2026  
**Framework:** React Native (Expo SDK) + TypeScript  

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack & Dependencies](#2-tech-stack--dependencies)
3. [Project Structure](#3-project-structure)
4. [Navigation Architecture](#4-navigation-architecture)
5. [State Management](#5-state-management)
6. [Screen Catalog](#6-screen-catalog)
7. [Component Library](#7-component-library)
8. [Services & API Integration](#8-services--api-integration)
9. [Theming & Design System](#9-theming--design-system)
10. [Animation System](#10-animation-system)
11. [Data Flow Patterns](#11-data-flow-patterns)
12. [Error Handling & Loading States](#12-error-handling--loading-states)
13. [Offline Support](#13-offline-support)
14. [Testing Guidelines](#14-testing-guidelines)
15. [Performance Considerations](#15-performance-considerations)
16. [Appendix](#16-appendix)

---

## 1. Project Overview

The Lumina mobile application is the primary user-facing interface of the AI-powered learning platform. It enables students to:

- Upload study materials (PDF, TXT, Markdown)
- Browse processed documents and detected topics
- Learn through interactive animated lessons
- Ask grounded questions about their material
- Test understanding via adaptive Socratic assessment
- Track mastery through the Understanding Map

The frontend follows a **feature-based folder structure** with clear separation of concerns: screens, components, services, stores, types, and utilities.

---

## 2. Tech Stack & Dependencies

### Core Framework

| Package | Version | Purpose |
|---------|---------|---------|
| `react` | ^18.2.0 | UI library |
| `react-native` | ^0.72.0 | Mobile framework |
| `expo` | ~49.0.0 | Expo SDK |
| `expo-router` | ~2.0.0 | File-based navigation |
| `typescript` | ^5.0.0 | Type safety |

### State & Data

| Package | Purpose |
|---------|---------|
| `zustand` | Lightweight global state management |
| `@supabase/supabase-js` | Supabase client (auth + database) |
| `react-query` | Server state caching and synchronization |

### UI & Animation

| Package | Purpose |
|---------|---------|
| `react-native-reanimated` | High-performance animations (lessons) |
| `react-native-gesture-handler` | Touch gestures for lesson navigation |
| `lottie-react-native` | Complex animation sequences |
| `react-native-svg` | SVG diagrams and icons |
| `@gorhom/bottom-sheet` | Bottom sheets for modals |

### Utilities

| Package | Purpose |
|---------|---------|
| `axios` | HTTP client for API calls |
| `zod` | Runtime schema validation |
| `date-fns` | Date formatting |
| `react-native-mmkv` | Fast local storage |

---

## 3. Project Structure

```
app/
├── (auth)/                          # Auth group (no tab bar)
│   ├── login.tsx                    # Login screen
│   ├── signup.tsx                   # Registration screen
│   └── _layout.tsx                  # Auth layout (no tabs)
│
├── (tabs)/                          # Main app group (tab bar)
│   ├── index.tsx                    # Home / Dashboard
│   ├── learn.tsx                    # Learn hub
│   ├── explore.tsx                  # Explore Q&A
│   ├── test.tsx                     # Test / Crucible hub
│   ├── profile.tsx                  # User profile
│   └── _layout.tsx                  # Tab layout with navigation
│
├── documents/
│   ├── upload.tsx                   # Document upload screen
│   └── [id].tsx                     # Document detail screen
│
├── lesson/
│   └── [id].tsx                     # Interactive lesson player
│
├── crucible/
│   └── [sessionId].tsx              # Socratic assessment session
│
├── mastery/
│   └── [topicId].tsx                # Understanding Map view
│
components/
├── ui/                              # Reusable UI primitives
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── Input.tsx
│   ├── Badge.tsx
│   ├── ProgressBar.tsx
│   ├── Skeleton.tsx
│   ├── EmptyState.tsx
│   └── LoadingSpinner.tsx
│
├── learning/                        # Learning-specific components
│   ├── TopicCard.tsx
│   ├── DocumentCard.tsx
│   ├── LessonCard.tsx
│   └── MasteryBadge.tsx
│
├── lesson/                          # Lesson scene renderers
│   ├── LessonPlayer.tsx
│   ├── SceneRenderer.tsx
│   ├── ConceptScene.tsx
│   ├── ProcessScene.tsx
│   ├── ComparisonScene.tsx
│   ├── ExampleScene.tsx
│   ├── DefinitionScene.tsx
│   ├── SceneNavigation.tsx
│   └── NarrationPanel.tsx
│
├── crucible/                        # Socratic assessment components
│   ├── CrucibleChat.tsx
│   ├── QuestionCard.tsx
│   ├── AnswerInput.tsx
│   ├── TurnHistory.tsx
│   ├── DifficultySelector.tsx
│   └── InsightBadge.tsx
│
├── explore/                         # Explore Q&A components
│   ├── ChatBubble.tsx
│   ├── SourceReference.tsx
│   ├── QueryInput.tsx
│   └── EmptyChatState.tsx
│
└── layout/                          # Layout components
    ├── Header.tsx
    ├── TabBar.tsx
    └── SafeAreaWrapper.tsx

store/
├── authStore.ts                     # Authentication state
├── learningStore.ts                 # Learning progress state
├── sessionStore.ts                  # Active session state
└── uiStore.ts                       # UI state (modals, toasts)

services/
├── api.ts                           # Axios instance + interceptors
├── auth.ts                          # Auth API calls
├── documents.ts                     # Document API calls
├── lessons.ts                       # Lesson API calls
├── explore.ts                       # Explore Q&A API calls
├── crucible.ts                      # Crucible API calls
└── storage.ts                       # Local storage helpers

types/
├── index.ts                         # Shared TypeScript types
├── api.ts                           # API response types
├── lesson.ts                        # Lesson JSON types
└── navigation.ts                    # Navigation param types

utils/
├── validation.ts                    # Form validation schemas
├── formatting.ts                    # Text/date formatting
├── constants.ts                     # App constants
└── helpers.ts                       # Utility functions

hooks/
├── useAuth.ts                       # Auth state hook
├── useDocuments.ts                  # Document data hook
├── useLesson.ts                     # Lesson data hook
├── useCrucible.ts                   # Crucible session hook
├── useMastery.ts                    # Mastery data hook
└── useDebounce.ts                   # Debounce utility hook

assets/
├── images/                          # Static images
├── animations/                      # Lottie animation files
└── fonts/                           # Custom fonts (Inter)
```

---

## 4. Navigation Architecture

### 4.1 File-Based Routing (Expo Router)

Expo Router uses the file system to define routes. The structure above maps directly to URLs:

| Route | File | Description |
|-------|------|-------------|
| `/login` | `app/(auth)/login.tsx` | Login screen |
| `/signup` | `app/(auth)/signup.tsx` | Signup screen |
| `/` | `app/(tabs)/index.tsx` | Home dashboard |
| `/learn` | `app/(tabs)/learn.tsx` | Learn hub |
| `/explore` | `app/(tabs)/explore.tsx` | Explore Q&A |
| `/test` | `app/(tabs)/test.tsx` | Test hub |
| `/profile` | `app/(tabs)/profile.tsx` | User profile |
| `/documents/upload` | `app/documents/upload.tsx` | Upload screen |
| `/documents/[id]` | `app/documents/[id].tsx` | Document detail |
| `/lesson/[id]` | `app/lesson/[id].tsx` | Lesson player |
| `/crucible/[sessionId]` | `app/crucible/[sessionId].tsx` | Socratic session |
| `/mastery/[topicId]` | `app/mastery/[topicId].tsx` | Mastery map |

### 4.2 Navigation Groups

```
┌─────────────────────────────────────────────────────────────┐
│                        App Root                              │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │  (auth) Group    │    │         (tabs) Group             │ │
│  │  No tab bar      │    │  Bottom tab navigation           │ │
│  │                  │    │                                  │ │
│  │  • /login        │    │  • / (Home)                      │ │
│  │  • /signup       │    │  • /learn                        │ │
│  │                  │    │  • /explore                      │ │
│  └─────────────────┘    │  • /test                         │ │
│                         │  • /profile                      │ │
│                         └─────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              Stack Screens (push navigation)             ││
│  │  • /documents/upload    • /lesson/[id]                  ││
│  │  • /documents/[id]      • /crucible/[sessionId]         ││
│  │                           • /mastery/[topicId]           ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Auth Flow

```
App Launch
    │
    ▼
┌─────────────┐     ┌─────────────┐
│ Check Auth   │────▶│  No Token   │────▶ /login
│  (Zustand)   │     └─────────────┘
└─────────────┘
       │
       ▼
┌─────────────┐
│ Valid Token  │────▶ / (Home Dashboard)
└─────────────┘
```

### 4.4 Deep Linking

| Deep Link | Action |
|-----------|--------|
| `lumina://lesson/123` | Open lesson 123 |
| `lumina://documents/456` | Open document 456 |
| `lumina://crucible/789` | Resume crucible session 789 |

---

## 5. State Management

### 5.1 Zustand Store Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Global State                            │
├─────────────────┬─────────────────┬─────────────────────────┤
│   authStore     │  learningStore  │      sessionStore       │
│                 │                 │                         │
│ • user          │ • documents     │ • activeLessonId        │
│ • session       │ • topics        │ • activeCrucibleId      │
│ • isLoading     │ • lessons       │ • exploreMessages       │
│ • isAuthenticated│ • mastery      │ • currentSceneIndex     │
│                 │ • isLoading     │                         │
│ Actions:        │                 │ Actions:                │
│ • login()       │ Actions:        │ • setActiveLesson()     │
│ • signup()      │ • fetchDocs()   │ • setSceneIndex()       │
│ • logout()      │ • fetchTopics() │ • addExploreMessage()   │
│ • setSession()  │ • fetchMastery()│ • clearSession()        │
└─────────────────┴─────────────────┴─────────────────────────┘
```

### 5.2 Store Definitions

#### authStore
```typescript
interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  setSession: (session: Session | null) => void;
}
```

#### learningStore
```typescript
interface LearningState {
  documents: Document[];
  topics: Topic[];
  lessons: Lesson[];
  mastery: MasteryMap;
  isLoading: boolean;

  fetchDocuments: () => Promise<void>;
  fetchTopics: (documentId: string) => Promise<void>;
  fetchLesson: (lessonId: string) => Promise<void>;
  fetchMastery: (topicId: string) => Promise<void>;
}
```

#### sessionStore
```typescript
interface SessionState {
  activeLessonId: string | null;
  activeCrucibleId: string | null;
  currentSceneIndex: number;
  exploreMessages: ChatMessage[];

  setActiveLesson: (id: string | null) => void;
  setSceneIndex: (index: number) => void;
  addExploreMessage: (message: ChatMessage) => void;
  clearExploreMessages: () => void;
}
```

### 5.3 React Query Integration

Server state (documents, lessons, mastery) is managed via React Query for caching, background refetching, and optimistic updates:

```typescript
// Example: Fetch documents with caching
const useDocuments = () => {
  return useQuery({
    queryKey: ['documents'],
    queryFn: documentsApi.getAll,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

// Example: Upload document with mutation
const useUploadDocument = () => {
  return useMutation({
    mutationFn: documentsApi.upload,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
};
```

---

## 6. Screen Catalog

### 6.1 Auth Screens

---

#### Login Screen
| Attribute | Value |
|-----------|-------|
| **Route** | `/login` |
| **File** | `app/(auth)/login.tsx` |
| **Group** | (auth) |
| **Purpose** | Authenticate existing users with email and password. Entry point for returning users. |
| **Key Features** | Email/password form, validation, "Remember me" toggle, link to signup, password reset |
| **State** | `authStore.login()` |
| **API** | `POST /auth/login` (via Supabase Auth) |
| **Validation** | Email format, password min 8 chars |
| **Error States** | Invalid credentials, network error, rate limited |
| **Accessibility** | Form labels, error announcements, keyboard navigation |

**Layout:**
```
┌─────────────────────────────┐
│         [Logo]              │
│                             │
│    Welcome back to Lumina   │
│                             │
│  ┌─────────────────────┐   │
│  │ Email               │   │
│  └─────────────────────┘   │
│  ┌─────────────────────┐   │
│  │ Password            │   │
│  └─────────────────────┘   │
│                             │
│  [ ] Remember me            │
│                             │
│  ┌─────────────────────┐   │
│  │     Sign In         │   │
│  └─────────────────────┘   │
│                             │
│  Forgot password?           │
│  Don't have an account?     │
│         Sign Up             │
└─────────────────────────────┘
```

---

#### Signup Screen
| Attribute | Value |
|-----------|-------|
| **Route** | `/signup` |
| **File** | `app/(auth)/signup.tsx` |
| **Group** | (auth) |
| **Purpose** | Register new users with email, password, and name. Create profile in Supabase. |
| **Key Features** | Name, email, password form, password strength indicator, terms agreement, link to login |
| **State** | `authStore.signup()` |
| **API** | `POST /auth/signup` (via Supabase Auth) + profile creation |
| **Validation** | Name required, email format, password 8+ chars with complexity |
| **Error States** | Email taken, weak password, network error |

**Layout:**
```
┌─────────────────────────────┐
│         [Logo]              │
│                             │
│    Create your account      │
│                             │
│  ┌─────────────────────┐   │
│  │ Full Name           │   │
│  └─────────────────────┘   │
│  ┌─────────────────────┐   │
│  │ Email               │   │
│  └─────────────────────┘   │
│  ┌─────────────────────┐   │
│  │ Password            │   │
│  └─────────────────────┘   │
│  [████░░░░░░] Strength     │
│                             │
│  [ ] I agree to Terms       │
│                             │
│  ┌─────────────────────┐   │
│  │    Create Account   │   │
│  └─────────────────────┘   │
│                             │
│  Already have an account?   │
│         Sign In             │
└─────────────────────────────┘
```

---

### 6.2 Tab Screens

---

#### Home / Dashboard Screen
| Attribute | Value |
|-----------|-------|
| **Route** | `/` |
| **File** | `app/(tabs)/index.tsx` |
| **Group** | (tabs) |
| **Purpose** | Central hub showing learning progress, recent documents, quick actions, and journey status. Primary landing screen after login. |
| **Key Features** | Welcome greeting, recent documents carousel, learning journey progress bar, quick action buttons (Upload, Explore, Test), mastery overview |
| **State** | `learningStore.documents`, `learningStore.mastery` |
| **API** | `GET /documents` (recent), `GET /mastery/summary` |
| **Sub-components** | `DocumentCard`, `JourneyProgress`, `QuickActionButton`, `MasteryPreview` |

**Layout:**
```
┌─────────────────────────────┐
│  Good morning, Alex    [⚙️] │
│                             │
│  Your Learning Journey      │
│  [Upload]━[Learn]━[Explore]│
│        \    |    /         │
│         [Test]━[Mastery]   │
│                             │
│  ┌─────────────────────┐   │
│  │  Upload New Material │   │
│  │     [+]              │   │
│  └─────────────────────┘   │
│                             │
│  Recent Documents           │
│  ┌─────┐ ┌─────┐ ┌─────┐  │
│  │PDF 1│ │PDF 2│ │PDF 3│  │
│  └─────┘ └─────┘ └─────┘  │
│                             │
│  Mastery Overview           │
│  Physics    [████████░░] 80%│
│  Chemistry  [██████░░░░] 60%│
└─────────────────────────────┘
```

---

#### Learn Hub Screen
| Attribute | Value |
|-----------|-------|
| **Route** | `/learn` |
| **File** | `app/(tabs)/learn.tsx` |
| **Group** | (tabs) |
| **Purpose** | Browse all available lessons and topics. Entry point to the learning experience. |
| **Key Features** | Topic list grouped by document, lesson cards with progress, search/filter, "Continue Learning" section |
| **State** | `learningStore.topics`, `learningStore.lessons` |
| **API** | `GET /documents`, `GET /documents/:id/topics`, `GET /lessons` |
| **Sub-components** | `TopicCard`, `LessonCard`, `SearchBar`, `FilterChip` |

**Layout:**
```
┌─────────────────────────────┐
│  Learn               [🔍]   │
│                             │
│  Continue Learning          │
│  ┌─────────────────────┐   │
│  │ Newton's Laws       │   │
│  │ Scene 3 of 7        │   │
│  │ [██████░░░░]        │   │
│  └─────────────────────┘   │
│                             │
│  Your Topics                │
│  ┌─────────────────────┐   │
│  │ 📄 Physics Notes     │   │
│  │   • Newton's Laws    │   │
│  │   • Thermodynamics   │   │
│  └─────────────────────┘   │
│  ┌─────────────────────┐   │
│  │ 📄 Chemistry 101     │   │
│  │   • Atomic Structure │   │
│  │   • Chemical Bonds   │   │
│  └─────────────────────┘   │
└─────────────────────────────┘
```

---

#### Explore Screen
| Attribute | Value |
|-----------|-------|
| **Route** | `/explore` |
| **File** | `app/(tabs)/explore.tsx` |
| **Group** | (tabs) |
| **Purpose** | Ask natural-language questions about uploaded material and receive grounded answers with source references. |
| **Key Features** | Chat interface, message history per session, source reference cards, "New Conversation" button, document selector |
| **State** | `sessionStore.exploreMessages`, `learningStore.documents` |
| **API** | `POST /explore/query`, `GET /chat_messages/:sessionId` |
| **Sub-components** | `ChatBubble`, `SourceReference`, `QueryInput`, `EmptyChatState` |

**Layout:**
```
┌─────────────────────────────┐
│  Explore             [+]    │
│  Ask about: [Physics Notes ▼]│
│                             │
│  ┌─────────────────────┐   │
│  │ 🤖 What is Newton's │   │
│  │    Second Law?      │   │
│  └─────────────────────┘   │
│                             │
│  ┌─────────────────────┐   │
│  │ Newton's Second Law │   │
│  │ states that F = ma...│   │
│  │                     │   │
│  │ 📎 Sources:         │   │
│  │ • Page 12, para 3   │   │
│  │ • Page 15, para 1   │   │
│  └─────────────────────┘   │
│                             │
│  ┌─────────────────────┐   │
│  │ How does mass affect│   │
│  │ acceleration?       │   │
│  └─────────────────────┘   │
│                             │
│  ┌────────────────────┐[➤]│
│  │ Ask a question...   │   │
│  └────────────────────┘    │
└─────────────────────────────┘
```

---

#### Test Hub Screen
| Attribute | Value |
|-----------|-------|
| **Route** | `/test` |
| **File** | `app/(tabs)/test.tsx` |
| **Group** | (tabs) |
| **Purpose** | Entry point to Concept Crucible. Browse topics available for Socratic assessment and view recent test sessions. |
| **Key Features** | Topic cards with mastery preview, difficulty selector, recent sessions list, "Start New Test" CTA |
| **State** | `learningStore.topics`, `learningStore.mastery` |
| **API** | `GET /topics`, `GET /mastery/:topicId`, `GET /crucible_sessions` |
| **Sub-components** | `TopicCard`, `DifficultySelector`, `SessionHistoryCard`, `MasteryPreview` |

**Layout:**
```
┌─────────────────────────────┐
│  Test                       │
│                             │
│  Ready to test your         │
│  understanding?             │
│                             │
│  Select a topic:            │
│                             │
│  ┌─────────────────────┐   │
│  │ Newton's Laws       │   │
│  │ Mastery: 60%        │   │
│  │ [Start Test]        │   │
│  └─────────────────────┘   │
│                             │
│  Difficulty: [Curious ▼]    │
│                             │
│  Recent Sessions            │
│  ┌─────────────────────┐   │
│  │ Thermodynamics      │   │
│  │ 12 questions • 85%  │   │
│  │ 2 hours ago         │   │
│  └─────────────────────┘   │
└─────────────────────────────┘
```

---

#### Profile Screen
| Attribute | Value |
|-----------|-------|
| **Route** | `/profile` |
| **File** | `app/(tabs)/profile.tsx` |
| **Group** | (tabs) |
| **Purpose** | User account management, settings, app preferences, and logout. |
| **Key Features** | Profile info display, edit profile, notification settings, theme toggle, about/help, logout, delete account |
| **State** | `authStore.user` |
| **API** | `GET /profiles/:id`, `PATCH /profiles/:id`, `POST /auth/logout` |
| **Sub-components** | `ProfileHeader`, `SettingsRow`, `DangerZone` |

**Layout:**
```
┌─────────────────────────────┐
│  Profile                    │
│                             │
│     [👤]                    │
│    Alex Johnson             │
│    alex@example.com         │
│                             │
│  ┌─────────────────────┐   │
│  │ ✏️ Edit Profile      │   │
│  └─────────────────────┘   │
│                             │
│  Settings                   │
│  ┌─────────────────────┐   │
│  │ 🔔 Notifications  [on]│   │
│  │ 🌙 Dark Mode      [on]│   │
│  │ 📊 Data Usage          │   │
│  └─────────────────────┘   │
│                             │
│  Support                    │
│  ┌─────────────────────┐   │
│  │ ❓ Help Center         │   │
│  │ 📧 Contact Support     │   │
│  └─────────────────────┘   │
│                             │
│  ┌─────────────────────┐   │
│  │    Log Out             │   │
│  └─────────────────────┘   │
└─────────────────────────────┘
```

---

### 6.3 Stack Screens

---

#### Document Upload Screen
| Attribute | Value |
|-----------|-------|
| **Route** | `/documents/upload` |
| **File** | `app/documents/upload.tsx` |
| **Group** | Stack (pushed from Home or Learn) |
| **Purpose** | Upload new study material (PDF, TXT, Markdown) to Cloudflare R2. Initiates document processing pipeline. |
| **Key Features** | File picker (DocumentPicker), drag-and-drop zone, file validation (type, size <50MB), upload progress bar, processing status indicator, cancel upload |
| **State** | Local upload progress, `useUploadDocument` mutation |
| **API** | `POST /documents/upload` (presigned URL → R2 → metadata) |
| **Validation** | File type: PDF, TXT, MD; Size: <50MB |
| **Error States** | Invalid file type, size exceeded, network failure, R2 error |
| **Sub-components** | `FilePicker`, `UploadProgress`, `ValidationMessage` |

**Layout:**
```
┌─────────────────────────────┐
│  ← Upload Material          │
│                             │
│  Drop your files here       │
│  or tap to browse           │
│                             │
│      ┌─────────┐            │
│      │   📄    │            │
│      │   +     │            │
│      └─────────┘            │
│                             │
│  Supported: PDF, TXT, MD    │
│  Max size: 50MB             │
│                             │
│  Selected:                  │
│  ┌─────────────────────┐   │
│  │ 📄 physics_notes.pdf │   │
│  │ 2.4 MB              │   │
│  │ [████████░░] 80%    │   │
│  └─────────────────────┘   │
│                             │
│  ┌─────────────────────┐   │
│  │    Upload & Process  │   │
│  └─────────────────────┘   │
└─────────────────────────────┘
```

---

#### Document Detail Screen
| Attribute | Value |
|-----------|-------|
| **Route** | `/documents/[id]` |
| **File** | `app/documents/[id].tsx` |
| **Group** | Stack |
| **Purpose** | View document metadata, processing status, and detected topics. Entry point to lessons and tests for this document. |
| **Key Features** | Document info (title, size, date), processing status badge, detected topics list, action buttons (Learn, Explore, Test), delete document |
| **State** | `learningStore` document by ID, topics |
| **API** | `GET /documents/:id`, `GET /documents/:id/topics`, `DELETE /documents/:id` |
| **Sub-components** | `DocumentHeader`, `StatusBadge`, `TopicList`, `ActionButtonGroup` |

**Layout:**
```
┌─────────────────────────────┐
│  ← Physics Notes.pdf        │
│                             │
│  📄 Physics Notes.pdf       │
│  2.4 MB • Uploaded Aug 22   │
│  [✅ Processed]             │
│                             │
│  Detected Topics            │
│  ┌─────────────────────┐   │
│  │ 1. Newton's Laws    │   │
│  │    [Learn] [Test]   │   │
│  └─────────────────────┘   │
│  ┌─────────────────────┐   │
│  │ 2. Thermodynamics   │   │
│  │    [Learn] [Test]   │   │
│  └─────────────────────┘   │
│  ┌─────────────────────┐   │
│  │ 3. Fluid Mechanics  │   │
│  │    [Learn] [Test]   │   │
│  └─────────────────────┘   │
│                             │
│  ┌─────────────────────┐   │
│  │  Explore Document    │   │
│  └─────────────────────┘   │
│                             │
│  [🗑️ Delete Document]      │
└─────────────────────────────┘
```

---

#### Lesson Player Screen
| Attribute | Value |
|-----------|-------|
| **Route** | `/lesson/[id]` |
| **File** | `app/lesson/[id].tsx` |
| **Group** | Stack (full-screen immersive) |
| **Purpose** | Render interactive animated lessons. The core teaching experience with progressive scene navigation and narration. |
| **Key Features** | Full-screen scene renderer, progressive element animation, narration panel, previous/next navigation, scene progress indicator, lesson completion celebration |
| **State** | `sessionStore.activeLessonId`, `sessionStore.currentSceneIndex`, `learningStore.lessons` |
| **API** | `GET /lessons/:id` |
| **Sub-components** | `LessonPlayer`, `SceneRenderer`, `ConceptScene`, `ProcessScene`, `ComparisonScene`, `SceneNavigation`, `NarrationPanel` |
| **Animation** | React Native Reanimated (native thread) |

**Layout:**
```
┌─────────────────────────────┐
│  ← Newton's Second Law   3/7 │
│  [██████░░░░░░░░░░]         │
│                             │
│  ┌─────────────────────┐   │
│  │                     │   │
│  │   [Animated Scene]  │   │
│  │                     │   │
│  │   • Force →         │   │
│  │   • Mass →          │   │
│  │   • Acceleration →  │   │
│  │                     │   │
│  └─────────────────────┘   │
│                             │
│  "Force causes an object   │
│   to accelerate. The       │
│   greater the force..."    │
│                             │
│  [← Previous]    [Next →]  │
└─────────────────────────────┘
```

**Scene Types:**

| Type | Visual | Animation |
|------|--------|-----------|
| **Concept** | Diagram with labeled elements | Elements fade/slide in sequentially |
| **Process** | Step-by-step flowchart | Steps highlight one by one |
| **Comparison** | Side-by-side cards | Cards slide in from edges |
| **Example** | Scenario illustration | Characters/objects animate |
| **Definition** | Term card with visual | Card flips or expands |

---

#### Concept Crucible Session Screen
| Attribute | Value |
|-----------|-------|
| **Route** | `/crucible/[sessionId]` |
| **File** | `app/crucible/[sessionId].tsx` |
| **Group** | Stack (full-screen immersive) |
| **Purpose** | Conduct adaptive Socratic assessment. AI asks questions, analyzes responses, and targets weaknesses without revealing answers. |
| **Key Features** | Question display, text input for answers, submit button, turn history, insight badges, difficulty indicator, session timer, exit/resume |
| **State** | `sessionStore.activeCrucibleId`, local turn history |
| **API** | `POST /crucible/start`, `POST /crucible/:id/respond`, `GET /crucible/:id` |
| **Sub-components** | `CrucibleChat`, `QuestionCard`, `AnswerInput`, `TurnHistory`, `InsightBadge`, `DifficultyIndicator` |
| **Rules** | AI never reveals answer during session; one question per turn; session continues until mastery or user exits |

**Layout:**
```
┌─────────────────────────────┐
│  ← Concept Crucible    [?]  │
│  Newton's Laws • Student    │
│                             │
│  ┌─────────────────────┐   │
│  │ 🤖 Question 3 of ?  │   │
│  │                     │   │
│  │ "You mentioned force│   │
│  │  causes acceleration│   │
│  │  — but what happens │   │
│  │  if the mass is     │   │
│  │  doubled?"          │   │
│  └─────────────────────┘   │
│                             │
│  Your previous answer:      │
│  ┌─────────────────────┐   │
│  │ "F = ma, so if you  │   │
│  │  increase force..." │   │
│  │ [💡 Missing: mass   │   │
│  │  relationship]      │   │
│  └─────────────────────┘   │
│                             │
│  ┌─────────────────────┐   │
│  │ Type your answer... │   │
│  │                     │   │
│  └─────────────────────┘   │
│  [Submit Answer]            │
│                             │
│  [Exit Session]             │
└─────────────────────────────┘
```

---

#### Understanding Map Screen
| Attribute | Value |
|-----------|-------|
| **Route** | `/mastery/[topicId]` |
| **File** | `app/mastery/[topicId].tsx` |
| **Group** | Stack |
| **Purpose** | Visualize evidence-based mastery of sub-concepts. Shows which concepts are mastered and which need work. |
| **Key Features** | Sub-concept grid/list, mastery score per concept (0–100), color-coded status (red/yellow/green), evidence snippets, overall topic mastery, "Test Again" CTA |
| **State** | `learningStore.mastery` |
| **API** | `GET /mastery/:topicId` |
| **Sub-components** | `MasteryGrid`, `SubConceptCard`, `MasteryScoreRing`, `EvidencePanel` |

**Layout:**
```
┌─────────────────────────────┐
│  ← Understanding Map        │
│                             │
│  Newton's Laws              │
│  Overall: 75% Mastery       │
│  [████████████░░░░]         │
│                             │
│  Sub-Concepts               │
│  ┌─────────────────────┐   │
│  │ First Law           │   │
│  │ [██████████] 100% ✅│   │
│  │ "Demonstrated clear │   │
│  │  understanding..."  │   │
│  └─────────────────────┘   │
│  ┌─────────────────────┐   │
│  │ Second Law          │   │
│  │ [████████░░░░] 80%  │   │
│  │ "Good grasp but     │   │
│  │  missed edge case"  │   │
│  └─────────────────────┘   │
│  ┌─────────────────────┐   │
│  │ Third Law           │   │
│  │ [██████░░░░░░] 50%  │   │
│  │ "Needs more practice│   │
│  │  with examples"     │   │
│  └─────────────────────┘   │
│                             │
│  [🎯 Test This Topic Again] │
└─────────────────────────────┘
```

---

## 7. Component Library

### 7.1 UI Primitives (components/ui/)

| Component | Props | Purpose |
|-----------|-------|---------|
| **Button** | `variant`, `size`, `loading`, `disabled`, `onPress` | Primary, secondary, ghost, danger variants |
| **Card** | `children`, `padding`, `elevation` | Consistent card container |
| **Input** | `label`, `error`, `secure`, `multiline`, `onChangeText` | Form input with validation state |
| **Badge** | `variant`, `children` | Status indicators (success, warning, error, info) |
| **ProgressBar** | `progress`, `color`, `height` | Linear progress indicator |
| **Skeleton** | `width`, `height`, `circle` | Loading placeholder |
| **EmptyState** | `icon`, `title`, `description`, `action` | No data state |
| **LoadingSpinner** | `size`, `color` | Centered loading indicator |

### 7.2 Learning Components (components/learning/)

| Component | Props | Purpose |
|-----------|-------|---------|
| **TopicCard** | `topic`, `onLearn`, `onTest`, `mastery` | Topic with action buttons |
| **DocumentCard** | `document`, `onPress`, `onDelete` | Document preview card |
| **LessonCard** | `lesson`, `progress`, `onPress` | Lesson with progress indicator |
| **MasteryBadge** | `score`, `size` | Circular mastery score display |

### 7.3 Lesson Components (components/lesson/)

| Component | Props | Purpose |
|-----------|-------|---------|
| **LessonPlayer** | `lesson`, `onComplete`, `onExit` | Orchestrates scene rendering |
| **SceneRenderer** | `scene`, `onElementVisible` | Dispatches to correct scene type |
| **ConceptScene** | `elements`, `relations`, `onAnimationComplete` | Diagram with animated elements |
| **ProcessScene** | `steps`, `currentStep`, `onStepComplete` | Step-by-step flow |
| **ComparisonScene** | `items`, `onReveal` | Side-by-side comparison |
| **SceneNavigation** | `currentIndex`, `total`, `onPrevious`, `onNext` | Prev/next controls |
| **NarrationPanel** | `text`, `highlightedTerms` | Scrollable narration with highlights |

### 7.4 Crucible Components (components/crucible/)

| Component | Props | Purpose |
|-----------|-------|---------|
| **CrucibleChat** | `turns`, `onSubmit` | Main chat container |
| **QuestionCard** | `question`, `difficulty`, `turnNumber` | AI question display |
| **AnswerInput** | `onSubmit`, `maxLength`, `disabled` | Student answer text input |
| **TurnHistory** | `turns` | Collapsible previous turns |
| **DifficultySelector** | `selected`, `onSelect` | Curious / Student / Expert |
| **InsightBadge** | `type`, `message` | Gap/misconception indicator |

### 7.5 Explore Components (components/explore/)

| Component | Props | Purpose |
|-----------|-------|---------|
| **ChatBubble** | `message`, `role`, `sources` | User or AI message |
| **SourceReference** | `chunks`, `onPress` | Expandable source cards |
| **QueryInput** | `onSubmit`, `disabled` | Question input with send button |
| **EmptyChatState** | `onSuggestionPress` | Initial state with suggestions |

---

## 8. Services & API Integration

### 8.1 API Client (services/api.ts)

```typescript
// Axios instance with auth interceptors
const api = axios.create({
  baseURL: Constants.expoConfig?.extra?.apiUrl,
  timeout: 30000,
});

// Request interceptor: attach Supabase JWT
api.interceptors.request.use(async (config) => {
  const session = await supabase.auth.getSession();
  if (session.data.session) {
    config.headers.Authorization = `Bearer ${session.data.session.access_token}`;
  }
  return config;
});

// Response interceptor: handle auth errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await authStore.getState().logout();
      router.replace('/login');
    }
    return Promise.reject(error);
  }
);
```

### 8.2 Service Modules

| Service | Methods | Purpose |
|---------|---------|---------|
| **auth.ts** | `login()`, `signup()`, `logout()`, `resetPassword()` | Supabase Auth operations |
| **documents.ts** | `getAll()`, `getById()`, `upload()`, `delete()` | Document CRUD |
| **lessons.ts** | `getById()`, `generate()` | Lesson retrieval and generation |
| **explore.ts** | `query()`, `getHistory()` | RAG Q&A operations |
| **crucible.ts** | `start()`, `respond()`, `getSession()` | Socratic session operations |
| **storage.ts** | `getItem()`, `setItem()`, `removeItem()` | MMKV local storage |

---

## 9. Theming & Design System

### 9.1 Color Palette

```typescript
const colors = {
  // Foundation
  navy: {
    900: '#0A1628',  // Background
    800: '#0F1D32',
    700: '#152440',
  },

  // Interactive AI
  indigo: {
    500: '#6366F1',  // Primary action
    400: '#818CF8',
    300: '#A5B4FC',
  },

  // Focus / Mastery
  amber: {
    500: '#F59E0B',  // Accent, mastery
    400: '#FBBF24',
    300: '#FCD34D',
  },

  // Semantic
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  // Text
  text: {
    primary: '#F8FAFC',
    secondary: '#94A3B8',
    muted: '#64748B',
  },
};
```

### 9.2 Typography

| Style | Font | Size | Weight | Usage |
|-------|------|------|--------|-------|
| H1 | Inter | 32px | 700 | Screen titles |
| H2 | Inter | 24px | 600 | Section headers |
| H3 | Inter | 20px | 600 | Card titles |
| Body | Inter | 16px | 400 | Paragraphs |
| Caption | Inter | 14px | 400 | Labels, metadata |
| Small | Inter | 12px | 500 | Badges, timestamps |

### 9.3 Spacing Scale

```typescript
const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
};
```

### 9.4 Border Radius

```typescript
const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};
```

---

## 10. Animation System

### 10.1 Reanimated Configuration

All lesson animations use React Native Reanimated for 60fps performance on the native thread.

### 10.2 Animation Patterns

| Pattern | Use Case | Implementation |
|---------|----------|----------------|
| **Fade In** | Scene elements appearing | `useSharedValue(0)` → `withTiming(1)` |
| **Slide In** | Cards, panels entering | `useSharedValue(-100)` → `withSpring(0)` |
| **Scale** | Important elements emphasis | `useSharedValue(1)` → `withSpring(1.2)` |
| **Stagger** | Sequential element reveal | `withDelay(index * 200, animation)` |
| **Progress** | Progress bars, timers | `useSharedValue(0)` → `withTiming(target)` |

### 10.3 Lesson Scene Animations

```typescript
// Example: Concept scene element animation
const elementAnimations = elements.map((_, index) => {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    opacity.value = withDelay(
      index * 400,
      withTiming(1, { duration: 500 })
    );
    translateY.value = withDelay(
      index * 400,
      withTiming(0, { duration: 500 })
    );
  }, []);

  return { opacity, translateY };
});
```

---

## 11. Data Flow Patterns

### 11.1 Upload Flow

```
User selects file
    │
    ▼
┌─────────────┐    ┌─────────────┐
│ Validate    │───▶│ Show error  │ (if invalid)
│ (client)    │    │ (type/size) │
└─────────────┘    └─────────────┘
       │
       ▼
┌─────────────┐
│ Request     │
│ presigned   │
│ URL (API)   │
└─────────────┘
       │
       ▼
┌─────────────┐
│ Upload to   │
│ R2 directly │
│ (progress)  │
└─────────────┘
       │
       ▼
┌─────────────┐    ┌─────────────┐
│ Confirm     │───▶│ Create      │
│ upload      │    │ metadata    │
│ complete    │    │ (Supabase)  │
└─────────────┘    └─────────────┘
       │
       ▼
┌─────────────┐
│ Poll status │◀── processing
│ until done  │    (extraction,
└─────────────┘    chunking,
       │           embedding)
       ▼
┌─────────────┐
│ Show topics │
│ & lessons   │
└─────────────┘
```

### 11.2 Explore Q&A Flow

```
User types question
    │
    ▼
┌─────────────┐
│ Optimistic  │
│ UI update   │
│ (chat bubble)│
└─────────────┘
    │
    ▼
┌─────────────┐
│ POST /explore│
│ /query      │
│ (loading)   │
└─────────────┘
    │
    ▼
┌─────────────┐
│ Backend:    │
│ RAG retrieval│
│ + LLM prompt│
└─────────────┘
    │
    ▼
┌─────────────┐
│ Receive     │
│ answer +    │
│ sources     │
└─────────────┘
    │
    ▼
┌─────────────┐
│ Update chat │
│ with real   │
│ response    │
└─────────────┘
```

### 11.3 Crucible Flow

```
User selects topic + difficulty
    │
    ▼
┌─────────────┐
│ POST /crucible│
│ /start      │
└─────────────┘
    │
    ▼
┌─────────────┐
│ Receive     │
│ first       │
│ question    │
└─────────────┘
    │
    ▼
┌─────────────┐
│ User types  │
│ answer      │
└─────────────┘
    │
    ▼
┌─────────────┐
│ POST /crucible│
│ /:id/respond│
└─────────────┘
    │
    ▼
┌─────────────┐
│ Backend:    │
│ Analyze     │
│ response    │
│ (gaps,      │
│ misconceptions)│
└─────────────┘
    │
    ▼
┌─────────────┐
│ Receive     │
│ next        │
│ question    │
│ + insights  │
└─────────────┘
    │
    ▼
┌─────────────┐
│ Loop until  │
│ mastery or  │
│ user exits  │
└─────────────┘
    │
    ▼
┌─────────────┐
│ Update      │
│ Understanding│
│ Map         │
└─────────────┘
```

---

## 12. Error Handling & Loading States

### 12.1 Global Error Strategy

| Error Type | Handling |
|------------|----------|
| **Network failure** | Retry 3x with backoff; show offline banner; queue unsent input |
| **API 4xx** | Show specific error message; log for debugging |
| **API 5xx** | Generic "Something went wrong"; retry button; report option |
| **Auth 401** | Auto-logout; redirect to login |
| **Validation error** | Inline field errors; prevent submission |
| **AI timeout** | "Taking longer than expected..."; cancel option; retry |

### 12.2 Loading State Patterns

| Context | Pattern |
|---------|---------|
| **Screen initial load** | Full-screen skeleton |
| **List loading** | Inline skeleton cards |
| **Button action** | Button spinner + disabled state |
| **Chat message** | Typing indicator (pulsing dots) |
| **Upload** | Progress bar with percentage |
| **AI generation** | Indeterminate progress + cancel |

### 12.3 Empty States

| Screen | Empty State |
|--------|-------------|
| Home (no documents) | "Upload your first study material" CTA |
| Learn (no lessons) | "Process a document to generate lessons" |
| Explore (no history) | Suggested starter questions |
| Test (no sessions) | "Select a topic to start testing" |
| Mastery (no data) | "Complete a test to see your mastery" |

---

## 13. Offline Support

### 13.1 Offline Capabilities

| Feature | Offline Behavior |
|---------|-----------------|
| **Browse documents** | Cached list from last fetch |
| **View lessons** | Cached lesson JSON |
| **Explore Q&A** | Queue questions; sync when online |
| **Crucible answers** | Queue answers; sync when online |
| **Upload** | Queue file; upload when online |

### 13.2 Queue Implementation

```typescript
// Offline queue using MMKV
interface QueuedAction {
  id: string;
  type: 'explore_query' | 'crucible_response' | 'document_upload';
  payload: unknown;
  timestamp: number;
  retries: number;
}

// Process queue when back online
const processOfflineQueue = async () => {
  const queue = storage.getItem<QueuedAction[]>('offline_queue') || [];
  for (const action of queue) {
    try {
      await executeAction(action);
      removeFromQueue(action.id);
    } catch {
      incrementRetry(action.id);
    }
  }
};
```

---

## 14. Testing Guidelines

### 14.1 Test File Locations

```
__tests__/
├── components/
│   ├── ui/Button.test.tsx
│   ├── lesson/SceneRenderer.test.tsx
│   └── crucible/AnswerInput.test.tsx
├── screens/
│   ├── Login.test.tsx
│   ├── LessonPlayer.test.tsx
│   └── Explore.test.tsx
├── hooks/
│   ├── useAuth.test.ts
│   └── useDocuments.test.ts
├── services/
│   ├── api.test.ts
│   └── documents.test.ts
└── store/
    └── authStore.test.ts
```

### 14.2 Testing Priorities

| Priority | Test Type | Coverage Target |
|----------|-----------|-----------------|
| P0 | Auth flows, API integration | 100% |
| P1 | Lesson rendering, Crucible chat | 80% |
| P2 | UI components, utilities | 60% |
| P3 | Animations, edge cases | 40% |

### 14.3 Mock Strategy

```typescript
// Mock Supabase Auth
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      signIn: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      getSession: jest.fn(),
    },
  })),
}));

// Mock API
jest.mock('../services/api', () => ({
  get: jest.fn(),
  post: jest.fn(),
}));
```

---

## 15. Performance Considerations

### 15.1 Optimization Checklist

| Area | Strategy |
|------|----------|
| **Bundle size** | Code splitting by route; lazy load lesson scenes |
| **Images** | Use Expo Image with caching; compress uploads |
| **Lists** | Use FlashList for document/topic lists |
| **Animations** | Run on native thread (Reanimated); avoid JS-driven |
| **API calls** | React Query caching; debounce search inputs |
| **Memory** | Unload off-screen lesson scenes; limit chat history |
| **Startup** | Preload critical data; splash screen during init |

### 15.2 Performance Targets

| Metric | Target |
|--------|--------|
| App launch (cold) | < 3 seconds |
| Screen transition | < 300ms |
| API response | < 2 seconds |
| Lesson scene render | < 500ms |
| Chat message send | < 100ms (optimistic) |
| Animation frame rate | 60fps |

---

## 16. Appendix

### A. Environment Variables

```bash
# .env
EXPO_PUBLIC_API_URL=https://api.lumina.app
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=xxx
```

### B. Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Components | PascalCase | `LessonPlayer.tsx` |
| Screens | PascalCase + Screen suffix | `LoginScreen.tsx` (file: `login.tsx`) |
| Hooks | camelCase + use prefix | `useDocuments.ts` |
| Stores | camelCase + Store suffix | `authStore.ts` |
| Services | camelCase | `documents.ts` |
| Types | PascalCase | `LessonScene.ts` |
| Constants | UPPER_SNAKE_CASE | `MAX_FILE_SIZE` |

### C. File Size Limits

| Resource | Limit |
|----------|-------|
| Upload file | 50 MB |
| Lesson JSON | 1 MB |
| Chat history per session | 100 messages |
| Cached documents | 50 |
| Image assets | 500 KB each |

### D. Accessibility Checklist

- [ ] All interactive elements have minimum 44x44pt touch target
- [ ] Screen reader labels on all icons and images
- [ ] Color contrast ratio ≥ 4.5:1 for text
- [ ] Focus indicators on all focusable elements
- [ ] Error messages announced to screen readers
- [ ] Reduced motion support for animations
- [ ] Dynamic type support (scalable fonts)

---

*End of Frontend Documentation*
