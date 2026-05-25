import { createContext, useContext, useReducer, useCallback, useRef, ReactNode } from "react";
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
}

type ChatAction =
  | { type: "SET_PERSONA"; persona: Persona }
  | { type: "SET_CONVERSATIONS"; conversations: Conversation[] }
  | { type: "ADD_CONVERSATION"; conversation: Conversation }
  | { type: "REMOVE_CONVERSATION"; id: string }
  | { type: "SET_MESSAGES"; conversationId: string; messages: Message[] }
  | { type: "ADD_MESSAGE"; conversationId: string; message: Message }
  | { type: "SET_STREAMING"; isStreaming: boolean; content?: string }
  | { type: "SET_LOADING"; isLoading: boolean };

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "SET_PERSONA":
      return { ...state, persona: action.persona };
    case "SET_CONVERSATIONS":
      return { ...state, conversations: action.conversations };
    case "ADD_CONVERSATION": {
      const exists = state.conversations.some((c) => c.id === action.conversation.id);
      if (exists) return state;
      return { ...state, conversations: [action.conversation, ...state.conversations] };
    }
    case "REMOVE_CONVERSATION":
      return {
        ...state,
        conversations: state.conversations.filter((c) => c.id !== action.id),
      };
    case "SET_MESSAGES": {
      const current = state.messages[action.conversationId] || [];
      // Merge: keep any local temp messages that haven't been persisted yet
      const currentIds = new Set(action.messages.map((m) => m.id));
      const tempOnly = current.filter(
        (m) => m.id.startsWith("temp-") && !currentIds.has(m.id)
      );
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.conversationId]: [...tempOnly, ...action.messages],
        },
      };
    }
    case "ADD_MESSAGE": {
      const existing = state.messages[action.conversationId] || [];
      // Hard dedup by id
      if (existing.some((m) => m.id === action.message.id)) {
        return state;
      }
      // Ensure every message has an id
      const safe = { ...action.message, id: action.message.id || uid() };
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.conversationId]: [...existing, safe],
        },
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
};

const ChatContext = createContext<{
  state: ChatState;
  loadPersona: () => Promise<void>;
  loadConversations: () => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  createConversation: () => Promise<Conversation | null>;
  deleteConversation: (id: string) => Promise<void>;
  sendMessage: (conversationId: string, content: string) => Promise<void>;
} | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const sendLockRef = useRef(false);

  const loadPersona = useCallback(async () => {
    try {
      const personas = await api.getPersonas();
      if (personas.length > 0) {
        dispatch({ type: "SET_PERSONA", persona: personas[0] });
      }
    } catch (err) {
      console.warn("loadPersona failed:", err);
    }
  }, []);

  const loadConversations = useCallback(async () => {
    dispatch({ type: "SET_LOADING", isLoading: true });
    try {
      const convs = await api.getConversations();
      dispatch({ type: "SET_CONVERSATIONS", conversations: convs });
    } catch (err) {
      console.warn("loadConversations failed:", err);
    } finally {
      dispatch({ type: "SET_LOADING", isLoading: false });
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const msgs = await api.getMessages(conversationId);
      dispatch({ type: "SET_MESSAGES", conversationId, messages: msgs });
    } catch (err) {
      console.warn("loadMessages failed:", err);
    }
  }, []);

  const createConversation = useCallback(async () => {
    try {
      const personas = await api.getPersonas();
      if (personas.length === 0) return null;
      const conv = await api.createConversation(personas[0].id);
      dispatch({ type: "ADD_CONVERSATION", conversation: conv });
      return conv;
    } catch (err) {
      console.warn("createConversation failed:", err);
      return null;
    }
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    try {
      await api.deleteConversation(id);
      dispatch({ type: "REMOVE_CONVERSATION", id });
    } catch (err) {
      console.warn("deleteConversation failed:", err);
    }
  }, []);

  const sendMessage = useCallback(
    async (conversationId: string, content: string) => {
      // Guard: skip if mid-stream
      if (sendLockRef.current) return;
      sendLockRef.current = true;

      const userMsg: Message = {
        id: uid(),
        conversation_id: conversationId,
        role: "user",
        content,
        created_at: new Date().toISOString(),
      };
      dispatch({ type: "ADD_MESSAGE", conversationId, message: userMsg });
      dispatch({ type: "SET_STREAMING", isStreaming: true, content: "" });

      try {
        const result = await api.sendMessage(conversationId, content);
        const replyMessages = result.messages;

        if (!replyMessages || replyMessages.length === 0) {
          dispatch({ type: "SET_STREAMING", isStreaming: false });
          return;
        }

        await new Promise<void>((resolve) => {
          let idx = 0;

          const playOne = () => {
            if (idx >= replyMessages.length) {
              dispatch({ type: "SET_STREAMING", isStreaming: false });
              resolve();
              return;
            }
            const msg = replyMessages[idx];
            const msgId = msg?.id || uid();
            const text = msg?.content || "";
            let revealed = "";
            let i = 0;

            const tick = () => {
              if (i < text.length) {
                revealed += text[i];
                i++;
                dispatch({ type: "SET_STREAMING", isStreaming: true, content: revealed });
                setTimeout(tick, 30 + Math.random() * 40);
              } else {
                dispatch({
                  type: "ADD_MESSAGE",
                  conversationId,
                  message: {
                    id: msgId,
                    conversation_id: conversationId,
                    role: "assistant" as const,
                    content: text,
                    created_at: new Date().toISOString(),
                  },
                });
                idx++;
                const gap = idx < replyMessages.length ? 1000 + Math.random() * 1500 : 50;
                setTimeout(playOne, gap);
              }
            };
            tick();
          };

          playOne();
        });
      } catch (err) {
        dispatch({ type: "SET_STREAMING", isStreaming: false });
        console.warn("sendMessage failed:", err);
      } finally {
        sendLockRef.current = false;
      }
    },
    []
  );

  return (
    <ChatContext.Provider
      value={{
        state,
        loadPersona,
        loadConversations,
        loadMessages,
        createConversation,
        deleteConversation,
        sendMessage,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
