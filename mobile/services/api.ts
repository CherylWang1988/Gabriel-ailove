import {
  Conversation,
  Message,
  Persona,
  User,
  HealthSyncPayload,
  SendMessageResponse,
} from "../types";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  // ── Personas ──
  getPersonas: () => request<Persona[]>("/api/personas"),
  getPersona: (id: string) => request<Persona>(`/api/personas/${id}`),

  // ── Users ──
  getUser: () => request<User>("/api/users/me"),

  // ── Conversations ──
  getConversations: () => request<Conversation[]>("/api/conversations"),
  createConversation: (personaId: string) =>
    request<Conversation>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ persona_id: personaId }),
    }),
  getConversation: (id: string) => request<Conversation>(`/api/conversations/${id}`),
  deleteConversation: (id: string) =>
    request<void>(`/api/conversations/${id}`, { method: "DELETE" }),

  // ── Messages ──
  getMessages: (conversationId: string, offset = 0, limit = 50) =>
    request<Message[]>(
      `/api/conversations/${conversationId}/messages?offset=${offset}&limit=${limit}`
    ),

  sendMessage: async (
    conversationId: string,
    content: string
  ): Promise<SendMessageResponse> => {
    const res = await fetch(
      `${BASE_URL}/api/conversations/${conversationId}/messages?stream=false`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status}: ${text}`);
    }
    return res.json();
  },

  // ── Health ──
  syncHealth: (payload: HealthSyncPayload) =>
    request<void>("/api/health/sync", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // ── Push ──
  registerPush: (token: string, platform: string = "ios") =>
    request<void>("/api/push/register", {
      method: "POST",
      body: JSON.stringify({ token, platform }),
    }),
};
