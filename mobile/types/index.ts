export interface User {
  id: string;
  nickname: string;
  timezone: string;
  created_at: string;
}

export interface Persona {
  id: string;
  name: string;
  description: string | null;
  persona_type: string;
  personality_traits: Record<string, string> | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  persona_id: string;
  user_id?: string;
  title: string | null;
  last_message: string | null;
  message_count: number;
  source: string;
  updated_at: string;
  created_at?: string;
}

export interface Message {
  id: string;
  conversation_id: string | null;  // null for proactive messages
  role: "user" | "assistant";
  content: string;
  is_proactive?: boolean;
  source?: string;
  created_at: string;
}

export interface ReplyMessage {
  id: string;
  content: string;
}

export interface SendMessageResponse {
  messages: ReplyMessage[];
}

export interface HealthMetric {
  metric_type: string;
  value: number;
  unit: string;
  logged_at: string;
}

export interface HealthSyncPayload {
  metrics: HealthMetric[];
}
