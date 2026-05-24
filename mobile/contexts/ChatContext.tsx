import { createContext, useContext, useReducer, useCallback, ReactNode } from "react";
import { Conversation, Message, Persona, SSEEvent } from "../types";
import { api } from "../services/api";

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
  | { type: "APPEND_STREAM_TOKEN"; token: string }
  | { type: "SET_LOADING"; isLoading: boolean };

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "SET_PERSONA":
      return { ...state, persona: action.persona };
    case "SET_CONVERSATIONS":
      return { ...state, conversations: action.conversations };
    case "ADD_CONVERSATION":
      return { ...state, conversations: [action.conversation, ...state.conversations] };
    case "REMOVE_CONVERSATION":
      return {
        ...state,
        conversations: state.conversations.filter((c) => c.id !== action.id),
      };
    case "SET_MESSAGES":
      return {
        ...state,
        messages: { ...state.messages, [action.conversationId]: action.messages },
      };
    case "ADD_MESSAGE": {
      const existing = state.messages[action.conversationId] || [];
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.conversationId]: [...existing, action.message],
        },
      };
    }
    case "SET_STREAMING":
      return {
        ...state,
        isStreaming: action.isStreaming,
        streamingContent: action.content || "",
      };
    case "APPEND_STREAM_TOKEN":
      return {
        ...state,
        streamingContent: state.streamingContent + action.token,
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

  const loadPersona = useCallback(async () => {
    const personas = await api.getPersonas();
    if (personas.length > 0) {
      dispatch({ type: "SET_PERSONA", persona: personas[0] });
    }
  }, []);

  const loadConversations = useCallback(async () => {
    dispatch({ type: "SET_LOADING", isLoading: true });
    try {
      const convs = await api.getConversations();
      dispatch({ type: "SET_CONVERSATIONS", conversations: convs });
    } finally {
      dispatch({ type: "SET_LOADING", isLoading: false });
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    const msgs = await api.getMessages(conversationId);
    dispatch({ type: "SET_MESSAGES", conversationId, messages: msgs });
  }, []);

  const createConversation = useCallback(async () => {
    if (!state.persona) {
      await loadPersona();
      // Re-get from state won't work, so load directly
      const personas = await api.getPersonas();
      if (personas.length === 0) return null;
      const conv = await api.createConversation(personas[0].id);
      dispatch({ type: "ADD_CONVERSATION", conversation: conv });
      return conv;
    }
    const conv = await api.createConversation(state.persona.id);
    dispatch({ type: "ADD_CONVERSATION", conversation: conv });
    return conv;
  }, [state.persona]);

  const deleteConversation = useCallback(async (id: string) => {
    await api.deleteConversation(id);
    dispatch({ type: "REMOVE_CONVERSATION", id });
  }, []);

  const sendMessage = useCallback(async (conversationId: string, content: string) => {
    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: conversationId,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    dispatch({ type: "ADD_MESSAGE", conversationId, message: userMsg });
    dispatch({ type: "SET_STREAMING", isStreaming: true, content: "" });

    let fullResponse = "";

    try {
      for await (const event of api.sendMessage(conversationId, content)) {
        if (event.type === "token") {
          fullResponse += event.content;
          dispatch({ type: "APPEND_STREAM_TOKEN", token: event.content });
        } else if (event.type === "done") {
          const assistantMsg: Message = {
            id: event.message_id,
            conversation_id: conversationId,
            role: "assistant",
            content: fullResponse,
            created_at: new Date().toISOString(),
          };
          dispatch({ type: "ADD_MESSAGE", conversationId, message: assistantMsg });
          dispatch({ type: "SET_STREAMING", isStreaming: false });
        } else if (event.type === "error") {
          dispatch({ type: "SET_STREAMING", isStreaming: false });
          console.error("Stream error:", event.message);
        }
      }
    } catch (err) {
      dispatch({ type: "SET_STREAMING", isStreaming: false });
      console.error("Send message failed:", err);
    }
  }, []);

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
