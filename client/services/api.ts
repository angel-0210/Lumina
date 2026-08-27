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
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useAppStore } from '../store';

// Helper to resolve the correct host machine API URL dynamically during development
const getApiBaseUrl = (): string => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  
  // Use explicit environment URL if it is set and is not localhost/0.0.0.0
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1') && !envUrl.includes('0.0.0.0')) {
    return envUrl;
  }

  // In Expo development, auto-detect host machine's LAN IP address from Metro server
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
      return `http://${ip}:8000`;
    }
  }

  return envUrl ?? 'http://localhost:8000';
};

const BASE_URL = getApiBaseUrl();
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
  console.log('[Axios Interceptor] URL:', config.url, 'Token:', token ? 'FOUND' : 'MISSING');
  if (token) {
    config.headers = config.headers ?? {};
    if (typeof config.headers.set === 'function') {
      config.headers.set('Authorization', `Bearer ${token}`);
    } else {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return config;
});

// Unwrap the `data` envelope from success responses.
// API shape: { success: true, data: <payload> }
client.interceptors.response.use(
  (resp: AxiosResponse) => {
    if (resp.data && 'data' in resp.data) {
      const originalData = resp.data;
      if (originalData.meta && typeof originalData.meta === 'object' && 'page' in originalData.meta) {
        // Map backend's pagination shape to the format expected by the frontend code
        resp.data = {
          items: originalData.data,
          total: originalData.meta.total ?? 0,
          page: originalData.meta.page ?? 1,
          page_size: originalData.meta.page_size ?? 20,
          total_pages: originalData.meta.total_pages ?? 0,
        };
      } else {
        resp.data = originalData.data;
      }
    }
    return resp;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as any;
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = useAppStore.getState().refreshToken;
      if (refreshToken) {
        try {
          const session = await authApi.refresh(refreshToken);
          useAppStore.getState().setAuth(session.access_token, session.refresh_token ?? null, session.user);
          
          if (originalRequest.headers) {
            if (typeof originalRequest.headers.set === 'function') {
              originalRequest.headers.set('Authorization', `Bearer ${session.access_token}`);
            } else {
              originalRequest.headers['Authorization'] = `Bearer ${session.access_token}`;
            }
          }
          return client(originalRequest);
        } catch (refreshErr) {
          useAppStore.getState().clearAuth();
          return Promise.reject(refreshErr);
        }
      }
      useAppStore.getState().clearAuth();
    }
    return Promise.reject(error);
  }
);

// ─── Helper to extract a human-readable error message ───────────────────────

export function apiErrorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  // Always log the error to developer console/logs first
  console.warn('[API Error Logged]:', err);

  if (axios.isAxiosError(err)) {
    // 1. If we received a response from the server with an error status code
    if (err.response) {
      const status = err.response.status;
      
      // Map server status codes to safe generic descriptions in production
      if (status >= 500) {
        return 'Something went wrong while processing your request. Please try again.';
      }
      
      const body = err.response.data as Record<string, unknown> | undefined;
      const errorObj = body?.error as Record<string, unknown> | undefined;
      
      // If backend returned a provider error, return a nice provider-specific message
      if (errorObj?.code === 'provider_error') {
        return 'The AI service is temporarily unavailable. Please try again shortly.';
      }
      
      const detail = errorObj?.message ?? errorObj?.code ?? body?.detail ?? body?.message ?? body?.error;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail) && detail.length > 0) {
        const first = detail[0] as Record<string, unknown>;
        return String(first?.msg ?? fallback);
      }
      
      if (status === 404) return 'The requested resource was not found. Please try again.';
      if (status === 403) return 'You do not have permission to perform this action.';
      if (status === 401) return 'Your session has expired. Please sign in again.';
      if (status === 400) return 'The request was invalid. Please try again.';
      
      return fallback;
    }
    
    // 2. If the request was made but no response was received (e.g. network failure, timeout)
    if (err.request) {
      if (err.code === 'ECONNABORTED' || err.message.toLowerCase().includes('timeout')) {
        return 'Unable to connect right now. The request timed out. Please check your internet connection and try again.';
      }
      // Return safe, user-friendly offline message instead of leaking base URLs or host IPs
      return 'Unable to connect right now. Please check your internet connection and try again.';
    }
  }
  
  // 3. For generic JS errors, do not leak raw programming exceptions/stack traces to end-users
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

  upload: (fileUri: string | File, filename: string, mimeType: string): Promise<UploadResponse> => {
    const form = new FormData();
    if (Platform.OS === 'web' && fileUri instanceof File) {
      form.append('file', fileUri);
    } else {
      form.append('file', { uri: fileUri as string, name: filename, type: mimeType } as unknown as Blob);
    }
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

// ─── Dashboard ───────────────────────────────────────────────────────────────

export interface ContinueLearning {
  lessonId: string | null;
  title: string | null;
  subject: string | null;
  progress: number;
  documentId: string | null;
}

export interface DashboardData {
  recentDocuments: DocumentListItem[];
  masterySummary: MasterySummaryItem[];
  continueLearning: ContinueLearning | null;
  documentCount: number;
  topicCount: number;
}

export const dashboardApi = {
  get: (): Promise<DashboardData> =>
    client.get('/dashboard').then((r) => r.data),
};

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface DocumentStats {
  total: number;
  completed: number;
  processing: number;
  failed: number;
  pending: number;
  totalBytes: number;
}

export interface ConceptStats {
  total: number;
  mastered: number;
  reviewing: number;
  locked: number;
}

export interface TopicStats {
  total: number;
  averageMastery: number;
}

export interface UserActivity {
  crucibleSessions: number;
  totalTurns: number;
  averageScore: number;
}

export interface AIUsage {
  totalJobs: number;
  sceneGeneration: number;
  questionGeneration: number;
  grading: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ErrorsFailures {
  processingErrors: number;
  aiErrors: number;
}

export interface AnalyticsData {
  documentStats: DocumentStats;
  conceptStats: ConceptStats;
  topicStats: TopicStats;
  userActivity: UserActivity;
  aiUsage: AIUsage;
  errorsFailures: ErrorsFailures;
}

export const analyticsApi = {
  get: (): Promise<AnalyticsData> =>
    client.get('/analytics').then((r) => r.data),
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
      .get('/topics', { params: { page, page_size: pageSize, document_id: documentId } })
      .then((r) => r.data),

  getTopic: (id: string): Promise<Topic> =>
    client.get(`/topics/${id}`).then((r) => r.data),

  listLessons: (page = 1, pageSize = 20, documentId?: string): Promise<PaginatedResponse<LessonListItem>> =>
    client.get('/lessons', { params: { page, page_size: pageSize, document_id: documentId } }).then((r) => r.data),

  getLesson: (id: string): Promise<Lesson> =>
    client.get(`/lessons/${id}`).then((r) => r.data),

  generateLesson: (documentId: string, sceneCount = 5, focus = ''): Promise<LessonGenerateResponse> =>
    client
      .post('/lessons', { documentId, sceneCount, focus })
      .then((r) => r.data),
};

// ─── Profile ─────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  name: string | null;
  email: string | null;
  subscription: string;
  created_at?: string;
  updated_at?: string;
}

export const profileApi = {
  get: (): Promise<UserProfile> =>
    client.get('/profile').then((r) => r.data),
  update: (name: string): Promise<UserProfile> =>
    client.patch('/profile', { name }).then((r) => r.data),
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

export interface MediaAsset {
  id: string;
  url: string;
  publicId: string;
  kind: 'image' | 'video';
  resourceType: string;
  format: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  bytes: number | null;
  lessonId: string | null;
  prompt: string | null;
}

export interface MediaGenerateResponse {
  job: { job_id: string; status: string; kind: string };
}

export interface JobStatusResponse {
  job_id: string;
  kind: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress_pct: number;
  error_message: string | null;
  result: any;
}

export const mediaApi = {
  list: (lessonId?: string, page = 1, pageSize = 50): Promise<PaginatedResponse<MediaAsset>> =>
    client.get('/media', { params: { lessonId, page, page_size: pageSize } }).then((r) => r.data),

  generateImage: (prompt: string, lessonId?: string): Promise<MediaGenerateResponse> =>
    client.post('/media/images', { prompt, lessonId }).then((r) => r.data),

  generateVideo: (prompt: string, aspectRatio = '16:9', lessonId?: string): Promise<MediaGenerateResponse> =>
    client.post('/media/videos', { prompt, aspectRatio, lessonId }).then((r) => r.data),

  getJobStatus: (jobId: string): Promise<JobStatusResponse> =>
    client.get(`/jobs/${jobId}`).then((r) => r.data),
};

export default client;

