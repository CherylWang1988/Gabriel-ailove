export interface Persona {
  id: string;
  name: string;
  description: string | null;
  personality_traits: Record<string, string> | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  persona_id: string;
  title: string | null;
  last_message: string | null;
  message_count: number;
  updated_at: string;
  created_at?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface SSETokenEvent {
  type: "token";
  content: string;
}

export interface SSEDoneEvent {
  type: "done";
  message_id: string;
}

export interface SSEErrorEvent {
  type: "error";
  message: string;
}

export type SSEEvent = SSETokenEvent | SSEDoneEvent | SSEErrorEvent;
