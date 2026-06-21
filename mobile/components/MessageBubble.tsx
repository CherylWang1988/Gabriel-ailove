import { memo } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { Message } from "../types";

interface Props {
  message: Message;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

const MessageBubble = memo(function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";
  const isImage = message.message_type === "image" || message.message_type === "sticker";
  const time = formatTime(message.created_at);

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.assistantContainer]}>
      {!isUser && (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>G</Text>
        </View>
      )}
      <View style={isUser ? styles.userBubbleWrapper : styles.assistantBubbleWrapper}>
        {isImage && message.media_url ? (
          <Image
            source={{ uri: message.media_url }}
            style={styles.imageBubble}
            resizeMode="contain"
          />
        ) : (
          <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
            <Text style={[styles.text, isUser ? styles.userText : styles.assistantText]}>
              {message.content}
            </Text>
          </View>
        )}
        {/* Timeline timestamp on every message */}
        <Text style={[styles.timestamp, isUser ? styles.userTimestamp : styles.assistantTimestamp]}>
          {time}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    marginVertical: 2,
    maxWidth: "82%",
  },
  userContainer: {
    alignSelf: "flex-end",
  },
  assistantContainer: {
    alignSelf: "flex-start",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#e94560",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
    alignSelf: "flex-end",
  },
  avatarText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  userBubbleWrapper: {
    alignItems: "flex-end",
  },
  assistantBubbleWrapper: {
    alignItems: "flex-start",
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: "#0f3460",
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: "#1a1a2e",
    borderBottomLeftRadius: 4,
  },
  imageBubble: {
    width: 120,
    height: 120,
    borderRadius: 12,
  },
  text: {
    fontSize: 15,
    lineHeight: 21,
  },
  userText: {
    color: "#e0e0e0",
  },
  assistantText: {
    color: "#e0e0e0",
  },
  timestamp: {
    fontSize: 11,
    color: "#555",
    marginTop: 4,
    paddingHorizontal: 6,
  },
  userTimestamp: {
    textAlign: "right",
  },
  assistantTimestamp: {
    textAlign: "left",
  },
});

export default MessageBubble;
