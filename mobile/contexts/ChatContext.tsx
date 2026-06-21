import { createContext, useContext, useReducer, useCallback, useRef, useEffect, ReactNode } from "react";
import { Conversation, Message, Persona } from "../types";
import { api } from "../services/api";

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

interface ChatState {
  persona: Persona | null;
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  streamingContent: Record<string, string>;
  isStreaming: Record<string, boolean>;
  isLoading: boolean;
  error: string | null;
}

type ChatAction =
  | { type: "SET_PERSONA"; persona: Persona }
  | { type: "SET_CONVERSATIONS"; conversations: Conversation[] }
  | { type: "ADD_CONVERSATION"; conversation: Conversation }
  | { type: "REMOVE_CONVERSATION"; id: string }
  | { type: "SET_MESSAGES"; conversationId: string; messages: Message[] }
  | { type: "ADD_MESSAGE"; conversationId: string; message: Message }
  | { type: "SET_STREAMING"; conversationId: string; isStreaming: boolean; content?: string }
  | { type: "SET_LOADING"; isLoading: boolean }
  | { type: "SET_ERROR"; error: string | null };

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "SET_PERSONA":
      return { ...state, persona: action.persona };
    case "SET_CONVERSATIONS":
      return { ...state, conversations: action.conversations };
    case "ADD_CONVERSATION":
      if (state.conversations.some((c) => c.id === action.conversation.id)) return state;
      return { ...state, conversations: [action.conversation, ...state.conversations] };
    case "REMOVE_CONVERSATION":
      return { ...state, conversations: state.conversations.filter((c) => c.id !== action.id) };
    case "SET_MESSAGES": {
      const sorted = [...action.messages].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      return {
        ...state,
        messages: { ...state.messages, [action.conversationId]: sorted },
      };
    }
    case "ADD_MESSAGE": {
      const list = state.messages[action.conversationId] || [];
      if (list.some((m) => m.id === action.message.id)) return state;
      const safe = { ...action.message, id: action.message.id || uid() };
      return {
        ...state,
        messages: { ...state.messages, [action.conversationId]: [...list, safe] },
      };
    }
    case "SET_STREAMING":
      return {
        ...state,
        isStreaming: { ...state.isStreaming, [action.conversationId]: action.isStreaming },
        streamingContent: { ...state.streamingContent, [action.conversationId]: action.content ?? "" },
      };
    case "SET_LOADING":
      return { ...state, isLoading: action.isLoading };
    case "SET_ERROR":
      return { ...state, error: action.error };
    default:
      return state;
  }
}

const initialState: ChatState = {
  persona: null,
  conversations: [],
  messages: {},
  streamingContent: {},
  isStreaming: {},
  isLoading: false,
  error: null,
};

const ChatContext = createContext<{
  state: ChatState;
  clearError: () => void;
  loadPersona: () => Promise<void>;
  loadConversations: () => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  createConversation: () => Promise<Conversation | null>;
  deleteConversation: (id: string) => Promise<void>;
  sendMessage: (conversationId: string, content: string) => Promise<void>;
  sendSticker: (conversationId: string, sticker: { id: string; url: string; label: string }) => Promise<void>;
} | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const genRef = useRef(0);
  const messagesRef = useRef<Record<string, Message[]>>({});

  messagesRef.current = state.messages;

  const clearError = useCallback(() => {
    dispatch({ type: "SET_ERROR", error: null });
  }, []);

  const loadPersona = useCallback(async () => {
    try {
      const personas = await api.getPersonas();
      if (personas.length > 0) dispatch({ type: "SET_PERSONA", persona: personas[0] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load persona";
      dispatch({ type: "SET_ERROR", error: msg });
      console.error("loadPersona:", e);
    }
  }, []);

  const loadConversations = useCallback(async () => {
    dispatch({ type: "SET_LOADING", isLoading: true });
    try {
      dispatch({ type: "SET_CONVERSATIONS", conversations: await api.getConversations() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load conversations";
      dispatch({ type: "SET_ERROR", error: msg });
      console.error("loadConversations:", e);
    } finally {
      dispatch({ type: "SET_LOADING", isLoading: false });
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    ++genRef.current;
    try {
      const msgs = await api.getMessages(conversationId);
      dispatch({ type: "SET_MESSAGES", conversationId, messages: msgs });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load messages";
      dispatch({ type: "SET_ERROR", error: msg });
      console.error("loadMessages:", e);
    }
  }, []);

  const createConversation = useCallback(async () => {
    try {
      const personas = await api.getPersonas();
      if (personas.length === 0) {
        dispatch({ type: "SET_ERROR", error: "No personas available" });
        return null;
      }
      const conv = await api.createConversation(personas[0].id);
      dispatch({ type: "ADD_CONVERSATION", conversation: conv });
      return conv;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create conversation";
      dispatch({ type: "SET_ERROR", error: msg });
      console.error("createConversation:", e);
      return null;
    }
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    try {
      await api.deleteConversation(id);
      dispatch({ type: "REMOVE_CONVERSATION", id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to delete conversation";
      dispatch({ type: "SET_ERROR", error: msg });
      console.error("deleteConversation:", e);
    }
  }, []);

  // Shared AI reply pipeline (used by both sendMessage and sendSticker)
  const handleAIReply = useCallback(async (
    conversationId: string,
    content: string,
    gen: number,
    isLatest: () => boolean,
    seenIds: Set<string>,
  ) => {
    dispatch({ type: "SET_STREAMING", conversationId, isStreaming: true, content: "" });

    try {
      const result = await api.replyToMessages(conversationId, content);
      const replies = result.messages;
      if (!replies || replies.length === 0) {
        if (isLatest()) dispatch({ type: "SET_STREAMING", conversationId, isStreaming: false });
        return;
      }

      const processedMsgIds = new Set<string>();
      const curAccumulated: Message[] = messagesRef.current[conversationId] || [];

      for (let ri = 0; ri < replies.length; ri++) {
        if (!isLatest()) return;

        const msg = replies[ri];
        const text = msg?.content || "";
        const msgId = msg?.id || uid();

        if (processedMsgIds.has(msgId)) continue;
        processedMsgIds.add(msgId);

        // Typewriter animation
        for (let i = 1; i <= text.length; i++) {
          if (!isLatest()) return;
          dispatch({ type: "SET_STREAMING", conversationId, isStreaming: true, content: text.slice(0, i) });
          await sleep(8 + Math.random() * 12);
        }

        if (!seenIds.has(msgId)) {
          const assistantMsg: Message = {
            id: msgId,
            conversation_id: conversationId,
            role: "assistant" as const,
            content: text,
            created_at: msg.created_at || new Date().toISOString(),
          };
          curAccumulated.push(assistantMsg);
          seenIds.add(msgId);
        }

        dispatch({ type: "SET_MESSAGES", conversationId, messages: [...curAccumulated] });

        if (ri < replies.length - 1) {
          if (!isLatest()) return;
          dispatch({ type: "SET_STREAMING", conversationId, isStreaming: false });
          await sleep(800 + Math.random() * 700);
          if (!isLatest()) return;
          dispatch({ type: "SET_STREAMING", conversationId, isStreaming: true, content: "" });
        }
      }

      if (isLatest()) dispatch({ type: "SET_STREAMING", conversationId, isStreaming: false });
    } catch (e) {
      const msg = e instanceof TypeError
        ? "Network error"
        : e instanceof Error ? e.message : "Failed to send message";
      dispatch({ type: "SET_ERROR", error: msg });
      console.error("handleAIReply:", e);
      if (isLatest()) dispatch({ type: "SET_STREAMING", conversationId, isStreaming: false });
    }
  }, []);

  // Timeline mode: each message sends immediately, no batching
  const sendMessage = useCallback(async (conversationId: string, content: string) => {
    const gen = ++genRef.current;
    const isLatest = () => gen === genRef.current;

    dispatch({ type: "SET_STREAMING", conversationId, isStreaming: false });

    const existing = messagesRef.current[conversationId] || [];
    const seenIds = new Set(existing.map((m) => m.id));

    // Step 1: show user message instantly + save to backend
    const userMsg: Message = {
      id: uid(),
      conversation_id: conversationId,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    const accumulated: Message[] = [...existing, userMsg];
    seenIds.add(userMsg.id);
    dispatch({ type: "SET_MESSAGES", conversationId, messages: accumulated });

    try {
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000"}/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, save_only: true }),
      });
      if (res.ok) {
        const data = await res.json();
        const serverId = data?.messages?.[0]?.id;
        if (serverId) {
          const msgs = messagesRef.current[conversationId] || [];
          const updated = msgs.map((m) => (m.id === userMsg.id ? { ...m, id: serverId } : m));
          messagesRef.current[conversationId] = updated;
          dispatch({ type: "SET_MESSAGES", conversationId, messages: [...updated] });
        }
      }
    } catch (e) {
      console.warn("Failed to save user message:", e);
    }

    // Step 2: send immediately (timeline mode, no batching delay)
    await handleAIReply(conversationId, content, gen, isLatest, seenIds);
  }, [handleAIReply]);

  // Sticker sends with AI reply
  const sendSticker = useCallback(async (
    conversationId: string,
    sticker: { id: string; url: string; label: string },
  ) => {
    const gen = ++genRef.current;
    const isLatest = () => gen === genRef.current;

    dispatch({ type: "SET_STREAMING", conversationId, isStreaming: false });

    const existing = messagesRef.current[conversationId] || [];
    const seenIds = new Set(existing.map((m) => m.id));

    const stickerMsg: Message = {
      id: uid(),
      conversation_id: conversationId,
      role: "user",
      content: sticker.label,
      message_type: "sticker",
      media_url: sticker.url,
      created_at: new Date().toISOString(),
    };
    dispatch({ type: "SET_MESSAGES", conversationId, messages: [...existing, stickerMsg] });

    try {
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000"}/api/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: sticker.label,
            message_type: "sticker",
            media_url: sticker.url,
            save_only: true,
          }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        const serverId = data?.messages?.[0]?.id;
        if (serverId) {
          const msgs = messagesRef.current[conversationId] || [];
          const updated = msgs.map((m) =>
            m.id === stickerMsg.id ? { ...m, id: serverId } : m,
          );
          messagesRef.current[conversationId] = updated;
          dispatch({ type: "SET_MESSAGES", conversationId, messages: [...updated] });
        }
      }
    } catch (e) {
      console.warn("Failed to save sticker:", e);
    }

    // Send to AI for reply
    await handleAIReply(conversationId, sticker.label, gen, isLatest, seenIds);
  }, [handleAIReply]);

  return (
    <ChatContext.Provider value={{
      state,
      clearError,
      loadPersona,
      loadConversations,
      loadMessages,
      createConversation,
      deleteConversation,
      sendMessage,
      sendSticker,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
