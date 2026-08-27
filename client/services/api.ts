/**
 * Lumina API client.
 *
 * A typed Axios instance that:
 *  - Always sends Authorization: Bearer <token> from the Zustand store.
 *  - Returns the inner `data` payload from all success responses (the API
 *    wraps everything as { success: true, data: { ... } }).
 *  - On 401 responses, clears the auth store and lets the root layout redirect.
 */
import axios, { AxiosError, AxiosInstance, AxiosResponse } from 'axios';
import { useAppStore } from '../store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.1.6:8000';
const API_PREFIX = '/api/v1';

// ─── Axios instance ─────────────────────────────────────────────────────────

const client: AxiosInstance = axios.create({
  baseURL: BASE_URL + API_PREFIX,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach auth token to every request.
client.interceptors.request.use((config) => {
  const token = useAppStore.getState().accessToken;
  if (token) {
    config.headers = config.headers ?? {};
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// Unwrap the `data` envelope from success responses.
// API shape: { success: true, data: <payload> }
client.interceptors.response.use(
  (resp: AxiosResponse) => {
    if (resp.data && 'data' in resp.data) {
      resp.data = resp.data.data;
    }
    return resp;
  },
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      useAppStore.getState().clearAuth();
    }
    return Promise.reject(error);
  }
);

// ─── Helper to extract a human-readable error message ───────────────────────

export function apiErrorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as Record<string, unknown> | undefined;
    const detail = body?.detail ?? body?.message ?? body?.error;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as Record<string, unknown>;
      return String(first?.msg ?? fallback);
    }
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  subscription: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string | null;
  expires_in: number | null;
  token_type: string;
  user: AuthUser;
}

export const authApi = {
  signup: (fullName: string, email: string, password: string): Promise<AuthResponse> =>
    client.post('/auth/signup', { fullName, email, password }).then((r) => r.data),

  login: (email: string, password: string): Promise<AuthResponse> =>
    client.post('/auth/login', { email, password }).then((r) => r.data),

  refresh: (refreshToken: string): Promise<AuthResponse> =>
    client.post('/auth/refresh', { refreshToken }).then((r) => r.data),

  logout: (): Promise<void> =>
    client.post('/auth/logout').then(() => undefined),

  me: (): Promise<AuthUser> =>
    client.get('/auth/me').then((r) => r.data),
};

// ─── Documents ───────────────────────────────────────────────────────────────

export interface DocumentListItem {
  id: string;
  title: string;
  status: string;
  size: string;
  date: string;
  topics: number;
  progress: number;
  file_type: string | null;
  file_size: number | null;
  chunk_count: number;
}

export interface DocumentTopicRef {
  id: string;
  name: string;
  desc: string;
}

export interface DocumentDetail extends DocumentListItem {
  uploaded: string;
  topicsList: DocumentTopicRef[];
}

export interface ProcessingStatus {
  document_id: string;
  status: string;
  progress_pct: number;
  chunk_count: number;
  error_message: string | null;
}

export interface UploadResponse {
  document: DocumentListItem;
  job: { job_id: string; status: string; kind: string };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export const documentsApi = {
  list: (page = 1, pageSize = 20): Promise<PaginatedResponse<DocumentListItem>> =>
    client.get('/documents', { params: { page, page_size: pageSize } }).then((r) => r.data),

  get: (id: string): Promise<DocumentDetail> =>
    client.get(`/documents/${id}`).then((r) => r.data),

  upload: (fileUri: string, filename: string, mimeType: string): Promise<UploadResponse> => {
    const form = new FormData();
    form.append('file', { uri: fileUri, name: filename, type: mimeType } as unknown as Blob);
    return client
      .post('/documents', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data);
  },

  status: (id: string): Promise<ProcessingStatus> =>
    client.get(`/documents/${id}/status`).then((r) => r.data),

  delete: (id: string): Promise<void> =>
    client.delete(`/documents/${id}`).then(() => undefined),
};

// ─── Mastery ─────────────────────────────────────────────────────────────────

export interface MasterySummaryItem {
  subject: string;
  progress: number;
  color: string;
  topicId: string | null;
}

export interface ConceptNode {
  id: string;
  name: string;
  status: 'Mastered' | 'Reviewing' | 'Locked';
  progress: number;
  prerequisite: string | null;
}

export interface MasteryMap {
  topicName: string;
  topicId: string;
  overallMastery: number;
  concepts: ConceptNode[];
}

export const masteryApi = {
  summary: (): Promise<MasterySummaryItem[]> =>
    client.get('/mastery/summary').then((r) => r.data),

  map: (topicId: string): Promise<MasteryMap> =>
    client.get(`/mastery/${topicId}`).then((r) => r.data),
};

// ─── Learning (Topics & Lessons) ─────────────────────────────────────────────

export interface Topic {
  id: string;
  name: string;
  subject: string;
  desc: string;
  lessonsCount: number;
  mastery: number;
  documentId: string;
  documentTitle: string;
  totalScenes: number;
  status: string;
}

export interface Scene {
  id: string;
  concept: string;
  explanation: string;
  visualHint: string;
  visualType: string;
  visualData: Record<string, unknown> | null;
  index: number;
}

export interface Lesson {
  id: string;
  title: string;
  subject: string;
  documentId: string;
  scenes: Scene[];
  currentScene: number;
  totalScenes: number;
  progress: number;
  status: string;
}

export interface LessonListItem {
  id: string;
  title: string;
  subject: string;
  currentScene: number;
  totalScenes: number;
  progress: number;
  documentId: string;
}

export interface LessonGenerateResponse {
  lessonId: string;
  job: { job_id: string; status: string; kind: string };
}

export const learningApi = {
  listTopics: (page = 1, pageSize = 50, documentId?: string): Promise<PaginatedResponse<Topic>> =>
    client
      .get('/learning/topics', { params: { page, page_size: pageSize, document_id: documentId } })
      .then((r) => r.data),

  getTopic: (id: string): Promise<Topic> =>
    client.get(`/learning/topics/${id}`).then((r) => r.data),

  listLessons: (page = 1, pageSize = 20): Promise<PaginatedResponse<LessonListItem>> =>
    client.get('/learning/lessons', { params: { page, page_size: pageSize } }).then((r) => r.data),

  getLesson: (id: string): Promise<Lesson> =>
    client.get(`/learning/lessons/${id}`).then((r) => r.data),

  generateLesson: (documentId: string, sceneCount = 5, focus = ''): Promise<LessonGenerateResponse> =>
    client
      .post('/learning/lessons/generate', { documentId, sceneCount, focus })
      .then((r) => r.data),
};

// ─── Explore ─────────────────────────────────────────────────────────────────

export interface Citation {
  id: string;
  chunkId: string;
  documentId: string | null;
  documentTitle: string | null;
  label: string;
  score: number | null;
  snippet: string | null;
  rank: number | null;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  sources: string[] | null;
  citations: Citation[] | null;
  createdAt: string | null;
}

export interface ExploreQueryResponse {
  sessionId: string;
  userMessageId: string;
  message: ChatMessage;
}

export interface ConversationResponse {
  items: ChatMessage[];
  total: number;
}

export const exploreApi = {
  query: (
    query: string,
    documentId?: string,
    sessionId?: string
  ): Promise<ExploreQueryResponse> =>
    client.post('/explore/query', { query, documentId, sessionId }).then((r) => r.data),

  getConversation: (sessionId: string, page = 1): Promise<ConversationResponse> =>
    client.get(`/explore/conversations/${sessionId}`, { params: { page } }).then((r) => r.data),
};

// ─── Crucible ────────────────────────────────────────────────────────────────

export interface DialogueTurn {
  id: string;
  role: 'examiner' | 'student';
  text: string;
}

export interface ConceptScoreOut {
  id?: string;
  name: string;
  score: number;
  mastery: number;
  evidence: string | null;
}

export interface CrucibleStartResponse {
  sessionId: string;
  topic: string;
  difficulty: string;
  question: DialogueTurn;
  turnsUsed: number;
  maxTurns: number;
}

export interface CrucibleRespondResponse {
  sessionId: string;
  done: boolean;
  nextQuestion: DialogueTurn | null;
  turnsUsed: number;
  maxTurns: number;
  score?: number;
  mastery?: number;
  concepts?: ConceptScoreOut[];
}

export interface CrucibleSessionListItem {
  id: string;
  topic: string;
  score: number;
  turns: number;
  date: string;
  status: string;
}

export interface CrucibleSessionDetail {
  id: string;
  topic: string;
  difficulty: string;
  status: string;
  score: number;
  date: string;
  turns: DialogueTurn[];
  mastery: number;
  concepts: ConceptScoreOut[];
}

export const crucibleApi = {
  start: (topicId: string, difficulty: string): Promise<CrucibleStartResponse> =>
    client.post('/crucible/start', { topicId, difficulty }).then((r) => r.data),

  respond: (sessionId: string, answer: string): Promise<CrucibleRespondResponse> =>
    client.post(`/crucible/${sessionId}/respond`, { answer }).then((r) => r.data),

  listSessions: (page = 1): Promise<PaginatedResponse<CrucibleSessionListItem>> =>
    client.get('/crucible/sessions', { params: { page } }).then((r) => r.data),

  getSession: (sessionId: string): Promise<CrucibleSessionDetail> =>
    client.get(`/crucible/sessions/${sessionId}`).then((r) => r.data),
};

export default client;
