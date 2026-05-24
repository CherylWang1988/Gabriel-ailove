import { useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { useChat } from "../../contexts/ChatContext";
import MessageBubble from "../../components/MessageBubble";
import TypingIndicator from "../../components/TypingIndicator";
import ChatInput from "../../components/ChatInput";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, loadMessages, sendMessage } = useChat();
  const flatListRef = useRef<FlatList>(null);

  const conversation = state.conversations.find((c) => c.id === id);
  const messages = state.messages[id] || [];

  useEffect(() => {
    if (id) {
      loadMessages(id);
    }
  }, [id]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, state.streamingContent]);

  const handleSend = async (content: string) => {
    if (!content.trim() || state.isStreaming) return;
    await sendMessage(id!, content);
  };

  const renderItem = ({ item }: { item: (typeof messages)[0] }) => (
    <MessageBubble message={item} />
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <Stack.Screen
        options={{
          title: conversation?.title || "Chat",
          headerStyle: { backgroundColor: "#1a1a2e" },
          headerTintColor: "#e0e0e0",
        }}
      />

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
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
            <Text style={styles.emptyText}>Start a conversation</Text>
          </View>
        }
      />

      <ChatInput onSend={handleSend} disabled={state.isStreaming} />
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
});
