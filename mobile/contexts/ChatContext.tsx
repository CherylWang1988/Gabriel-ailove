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
  const genRef = useRef(0);

  const loadPersona = useCallback(async () => {
    try {
      const personas = await api.getPersonas();
      if (personas.length > 0) dispatch({ type: "SET_PERSONA", persona: personas[0] });
    } catch (e) { console.warn(e); }
  }, []);

  const loadConversations = useCallback(async () => {
    dispatch({ type: "SET_LOADING", isLoading: true });
    try {
      dispatch({ type: "SET_CONVERSATIONS", conversations: await api.getConversations() });
    } catch (e) { console.warn(e); }
    finally { dispatch({ type: "SET_LOADING", isLoading: false }); }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const msgs = await api.getMessages(conversationId);
      dispatch({ type: "SET_MESSAGES", conversationId, messages: msgs });
    } catch (e) { console.warn(e); }
  }, []);

  const createConversation = useCallback(async () => {
    try {
      const personas = await api.getPersonas();
      if (personas.length === 0) return null;
      const conv = await api.createConversation(personas[0].id);
      dispatch({ type: "ADD_CONVERSATION", conversation: conv });
      return conv;
    } catch (e) { console.warn(e); return null; }
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    try {
      await api.deleteConversation(id);
      dispatch({ type: "REMOVE_CONVERSATION", id });
    } catch (e) { console.warn(e); }
  }, []);

  const sendMessage = useCallback(async (conversationId: string, content: string) => {
    const gen = ++genRef.current;

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
      if (gen !== genRef.current) return; // newer sendMessage started, cancel this one
      const replies = result.messages;
      if (!replies || replies.length === 0) {
        if (gen === genRef.current) dispatch({ type: "SET_STREAMING", isStreaming: false });
        return;
      }

      for (let ri = 0; ri < replies.length; ri++) {
        if (gen !== genRef.current) return;
        const msg = replies[ri];
        const text = msg?.content || "";
        const msgId = msg?.id || uid();

        for (let i = 1; i <= text.length; i++) {
          if (gen !== genRef.current) return;
          dispatch({ type: "SET_STREAMING", isStreaming: true, content: text.slice(0, i) });
          await sleep(30 + Math.random() * 40);
        }

        if (gen !== genRef.current) return;
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

        if (ri < replies.length - 1) {
          dispatch({ type: "SET_STREAMING", isStreaming: false });
          await sleep(1000 + Math.random() * 1500);
          if (gen !== genRef.current) return;
          dispatch({ type: "SET_STREAMING", isStreaming: true, content: "" });
        }
      }

      if (gen === genRef.current) dispatch({ type: "SET_STREAMING", isStreaming: false });
    } catch (e) {
      console.warn("sendMessage failed:", e);
      if (gen === genRef.current) dispatch({ type: "SET_STREAMING", isStreaming: false });
    }
  }, []);

  return (
    <ChatContext.Provider value={{ state, loadPersona, loadConversations, loadMessages, createConversation, deleteConversation, sendMessage }}>
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
