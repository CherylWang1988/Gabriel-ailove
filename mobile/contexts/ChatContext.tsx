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
  streamingContent: string;
  isStreaming: boolean;
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
  | { type: "SET_STREAMING"; isStreaming: boolean; content?: string }
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
    case "SET_MESSAGES":
      return {
        ...state,
        messages: { ...state.messages, [action.conversationId]: action.messages },
      };
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
        isStreaming: action.isStreaming,
        streamingContent: action.content ?? "",
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
  streamingContent: "",
  isStreaming: false,
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
} | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const genRef = useRef(0);
  // Ref mirror of state.messages — always up-to-date, no stale closure
  const messagesRef = useRef<Record<string, Message[]>>({});
  // ✅ 新增：管理每个对话的自动发送计时器
  const timerRef = useRef<Record<string, NodeJS.Timeout | null>>({});

  // Keep messagesRef in sync with state.messages after every render
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
    // ✅ 清理该对话的计时器
    if (timerRef.current[id]) {
      clearTimeout(timerRef.current[id]!);
      timerRef.current[id] = null;
    }
    
    try {
      await api.deleteConversation(id);
      dispatch({ type: "REMOVE_CONVERSATION", id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to delete conversation";
      dispatch({ type: "SET_ERROR", error: msg });
      console.error("deleteConversation:", e);
    }
  }, []);

  const sendMessage = useCallback(async (conversationId: string, content: string) => {
    const gen = ++genRef.current;
    const isLatest = () => gen === genRef.current;

    // Build accumulated list from ref
    const existing = messagesRef.current[conversationId] || [];
    const seenIds = new Set(existing.map((m) => m.id));

    // ✅ 第1步：立即显示用户消息（本地），并同时保存到后端
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

    // ✅ 第1步：立即保存用户消息到后端（save_only，不触发AI回复）
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
          // Replace local UID with server-assigned ID
          const msgs = messagesRef.current[conversationId] || [];
          const updated = msgs.map((m) => (m.id === userMsg.id ? { ...m, id: serverId } : m));
          messagesRef.current[conversationId] = updated;
          dispatch({ type: "SET_MESSAGES", conversationId, messages: [...updated] });
        }
      }
    } catch (e) {
      console.warn("Failed to save user message:", e);
    }

    // ✅ 第2步：3秒后收集所有未回复的消息，一起发给AI处理
    // 清除旧的计时器（如果存在），启动新的计时器
    if (timerRef.current[conversationId]) {
      clearTimeout(timerRef.current[conversationId]!);
    }

    timerRef.current[conversationId] = setTimeout(async () => {
      if (!isLatest()) return;

      // ✅ 3秒后自动发送所有未回复的消息给AI
      const latestMsgs = messagesRef.current[conversationId] || [];
      const userMessages = latestMsgs.filter(m => m.role === "user");
      
      // 检查是否还有未回复的消息
      const lastAssistantMsg = [...latestMsgs].reverse().find(m => m.role === "assistant");
      const unreplied = lastAssistantMsg 
        ? userMessages.filter(m => new Date(m.created_at) > new Date(lastAssistantMsg.created_at))
        : userMessages;

      if (unreplied.length === 0) {
        timerRef.current[conversationId] = null;
        return;
      }

      // 合并所有待回复消息
      const combinedContent = unreplied.map(m => m.content).join("\n");
      
      dispatch({ type: "SET_STREAMING", isStreaming: true, content: "" });

      try {
        // reply_only: user messages were already saved via save_only above
        const result = await api.replyToMessages(conversationId, combinedContent);
        const replies = result.messages;
        if (!replies || replies.length === 0) {
          if (isLatest()) dispatch({ type: "SET_STREAMING", isStreaming: false });
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
            dispatch({ type: "SET_STREAMING", isStreaming: true, content: text.slice(0, i) });
            await sleep(30 + Math.random() * 40);
          }

          if (!seenIds.has(msgId)) {
            const assistantMsg: Message = {
              id: msgId,
              conversation_id: conversationId,
              role: "assistant" as const,
              content: text,
              created_at: new Date().toISOString(),
            };
            curAccumulated.push(assistantMsg);
            seenIds.add(msgId);
          }

          dispatch({ type: "SET_MESSAGES", conversationId, messages: [...curAccumulated] });

          if (ri < replies.length - 1) {
            if (!isLatest()) return;
            dispatch({ type: "SET_STREAMING", isStreaming: false });
            await sleep(1000 + Math.random() * 1500);
            if (!isLatest()) return;
            dispatch({ type: "SET_STREAMING", isStreaming: true, content: "" });
          }
        }

        if (isLatest()) dispatch({ type: "SET_STREAMING", isStreaming: false });
      } catch (e) {
        const msg = e instanceof TypeError
          ? "Network error — check your connection"
          : e instanceof Error ? e.message : "Failed to send message";
        dispatch({ type: "SET_ERROR", error: msg });
        console.error("sendMessage:", e);
        if (isLatest()) dispatch({ type: "SET_STREAMING", isStreaming: false });
      } finally {
        timerRef.current[conversationId] = null;
      }
    }, 3000); // ✅ 3秒延迟
  }, []);
  // ✅ 清理效果：组件卸载时清理所有计时器
  useEffect(() => {
    return () => {
      Object.values(timerRef.current).forEach(timer => {
        if (timer) clearTimeout(timer);
      });
    };
  }, []);
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
