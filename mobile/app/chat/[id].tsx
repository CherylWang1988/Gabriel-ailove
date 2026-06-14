import { useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { useChat } from "../../contexts/ChatContext";
import { Message } from "../../types";
import MessageBubble from "../../components/MessageBubble";
import TypingIndicator from "../../components/TypingIndicator";
import TimestampSeparator from "../../components/TimestampSeparator";
import ChatInput from "../../components/ChatInput";

type RenderItem =
  | { kind: "msg"; data: Message; key: string }
  | { kind: "ts"; text: string; key: string };

function formatDate(iso: string): string {
  const d = new Date(iso);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${m}月${day}日 ${h}:${min}`;
}

const GAP_MINUTES = 5;

export default function ChatScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const { state, loadMessages, sendMessage, clearError } = useChat();
  const flatListRef = useRef<FlatList>(null);

  const conversation = state.conversations.find((c) => c.id === id);
  const rawMessages = state.messages[id] || [];

  // Inject timestamp separators between messages with gap > 5 min
  const messages = useMemo(() => {
    const out: RenderItem[] = [];
    for (let i = 0; i < rawMessages.length; i++) {
      if (i > 0) {
        const prev = new Date(rawMessages[i - 1].created_at).getTime();
        const curr = new Date(rawMessages[i].created_at).getTime();
        if (curr - prev > GAP_MINUTES * 60 * 1000) {
          out.push({
            kind: "ts",
            text: formatDate(rawMessages[i].created_at),
            key: `ts-${i}`,
          });
        }
      }
      out.push({
        kind: "msg",
        data: rawMessages[i],
        key: rawMessages[i].id || `msg-${i}`,
      });
    }
    return out;
  }, [rawMessages]);

  useEffect(() => {
    if (id) {
      loadMessages(id);
    }
  }, [id]);

  // Sync health data silently on entering chat
  useEffect(() => {
    import("../../services/health").then(({ getHealthData, healthDataToMetrics }) => {
      getHealthData().then((data) => {
        const metrics = healthDataToMetrics(data);
        if (metrics.length > 0) {
          import("../../services/api").then(({ api }) => {
            api.syncHealth({ metrics }).catch(() => {});
          });
        }
      });
    });
  }, [id]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [rawMessages.length, state.streamingContent]);

  const handleSend = async (content: string) => {
    if (!content.trim()) return;
    await sendMessage(id!, content);
  };

  const renderItem = useCallback(({ item }: { item: RenderItem }) => {
    try {
      if (item.kind === "ts") return <TimestampSeparator text={item.text} />;
      return <MessageBubble message={item.data} />;
    } catch {
      return null;
    }
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <Stack.Screen
        options={{
          title: title || conversation?.title || "Chat",
          headerStyle: { backgroundColor: "#1a1a2e" },
          headerTintColor: "#e0e0e0",
        }}
      />

      {/* Error banner */}
      {state.error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{state.error}</Text>
          <TouchableOpacity onPress={clearError} style={styles.errorClose}>
            <Text style={styles.errorCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        extraData={[rawMessages.length, state.isStreaming]}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={scrollToBottom}
        ListFooterComponent={
          state.isStreaming ? (
            <TypingIndicator content={state.streamingContent} />
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>开始聊天吧</Text>
          </View>
        }
      />

      <ChatInput 
        onSend={handleSend}
        disabled={state.isStreaming}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#16213e",
  },
  messageList: {
    padding: 16,
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 16,
    color: "#707070",
  },
  errorBanner: {
    backgroundColor: "#e94560",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  errorText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  errorClose: {
    paddingLeft: 12,
    paddingVertical: 4,
  },
  errorCloseText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
