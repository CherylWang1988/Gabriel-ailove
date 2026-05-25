import { Conversation, Message, Persona, SendMessageResponse } from "../types";

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
  getPersonas: () => request<Persona[]>("/api/personas"),

  getPersona: (id: string) => request<Persona>(`/api/personas/${id}`),

  getConversations: () => request<Conversation[]>("/api/conversations"),

  createConversation: (personaId: string) =>
    request<Conversation>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ persona_id: personaId }),
    }),

  getConversation: (id: string) =>
    request<Conversation>(`/api/conversations/${id}`),

  getMessages: (conversationId: string, offset = 0, limit = 50) =>
    request<Message[]>(
      `/api/conversations/${conversationId}/messages?offset=${offset}&limit=${limit}`
    ),

  deleteConversation: (id: string) =>
    request<void>(`/api/conversations/${id}`, { method: "DELETE" }),

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
};
