import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  InteractionManager,
} from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { useChat } from "../../contexts/ChatContext";
import { Message } from "../../types";
import MessageBubble from "../../components/MessageBubble";
import TypingIndicator from "../../components/TypingIndicator";
import TimestampSeparator from "../../components/TimestampSeparator";
import ChatInput from "../../components/ChatInput";
import { getHealthData, healthDataToMetrics } from "../../services/health";
import { api } from "../../services/api";

type RenderItem =
  | { kind: "msg"; data: Message; key: string }
  | { kind: "ts"; text: string; key: string };

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");

  // Same day: only show time
  if (d.toDateString() === now.toDateString()) {
    return `${h}:${min}`;
  }
  // Different day: show date + time
  return `${m}/${day} ${h}:${min}`;
}

const GAP_MINUTES = 10;

export default function ChatScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const { state, loadMessages, sendMessage, sendSticker, clearError } = useChat();
  const flatListRef = useRef<FlatList>(null);

  const conversation = state.conversations.find((c) => c.id === id);
  const rawMessages = state.messages[id] || [];
  const isStreaming = state.isStreaming[id] || false;
  const streamingContent = state.streamingContent[id] || "";
  const [panelVisible, setPanelVisible] = useState(false);

  // Inject timestamp separators for date changes or long gaps
  const messages = useMemo(() => {
    const out: RenderItem[] = [];
    for (let i = 0; i < rawMessages.length; i++) {
      if (i > 0) {
        const prev = new Date(rawMessages[i - 1].created_at);
        const curr = new Date(rawMessages[i].created_at);
        const diffMs = curr.getTime() - prev.getTime();
        const isNewDay = prev.toDateString() !== curr.toDateString();
        if (isNewDay || diffMs > GAP_MINUTES * 60 * 1000) {
          out.push({
            kind: "ts",
            text: formatDate(rawMessages[i].created_at),
            key: `ts-${i}`,
          });
        }
      } else {
        // First message always shows its date/time
        out.push({
          kind: "ts",
          text: formatDate(rawMessages[i].created_at),
          key: `ts-first`,
        });
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
    const handle = InteractionManager.runAfterInteractions(() => {
      getHealthData().then((data) => {
        const metrics = healthDataToMetrics(data);
        if (metrics.length > 0) {
          api.syncHealth({ metrics }).catch(() => {});
        }
      });
    });
    return () => handle.cancel();
  }, [id]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [rawMessages.length, streamingContent, panelVisible]);

  const handlePanelToggle = useCallback((visible: boolean) => {
    setPanelVisible(visible);
  }, []);

  const handleSend = async (content: string) => {
    if (!content.trim()) return;
    await sendMessage(id!, content);
  };

  const handleSendSticker = async (sticker: { id: string; url: string; label: string }) => {
    await sendSticker(id!, sticker);
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
          headerBackTitle: "",
          headerBackVisible: true,
          headerStyle: { backgroundColor: "#1a1a2e" },
          headerTintColor: "#e0e0e0",
        }}
      />

      {state.error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{state.error}</Text>
          <TouchableOpacity onPress={clearError} style={styles.errorClose}>
            <Text style={styles.errorCloseText}>x</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        extraData={[rawMessages.length, isStreaming, panelVisible]}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        style={styles.list}
        contentContainerStyle={[
          styles.messageList,
          panelVisible && { paddingBottom: 340 },
        ]}
        onContentSizeChange={scrollToBottom}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={
          isStreaming ? (
            <TypingIndicator content={streamingContent} />
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Start chatting</Text>
          </View>
        }
      />

      <ChatInput
        onSend={handleSend}
        onSendSticker={handleSendSticker}
        onPanelToggle={handlePanelToggle}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#16213e",
  },
  list: {
    flex: 1,
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
