import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Conversation } from "../types";

interface Props {
  conversation: Conversation;
  onPress: () => void;
  onLongPress: () => void;
}

export default function ConversationItem({ conversation, onPress, onLongPress }: Props) {
  const time = formatTime(conversation.updated_at);

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} onLongPress={onLongPress}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>G</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.title} numberOfLines={1}>
            {conversation.title || "New conversation"}
          </Text>
          <Text style={styles.time}>{time}</Text>
        </View>
        <Text style={styles.preview} numberOfLines={1}>
          {conversation.last_message || "No messages yet"}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else if (days === 1) {
    return "Yesterday";
  } else if (days < 7) {
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
  }
  return date.toLocaleDateString();
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#e94560",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    borderBottomWidth: 0.5,
    borderBottomColor: "#1a1a2e",
    paddingBottom: 12,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#e0e0e0",
    flex: 1,
    marginRight: 8,
  },
  time: {
    fontSize: 12,
    color: "#707070",
  },
  preview: {
    fontSize: 14,
    color: "#909090",
    marginTop: 4,
  },
});
