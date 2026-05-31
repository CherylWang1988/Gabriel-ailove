import { useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useChat } from "../../contexts/ChatContext";
import ConversationItem from "../../components/ConversationItem";

export default function ConversationListScreen() {
  const { state, loadPersona, loadConversations, createConversation, deleteConversation } =
    useChat();

  useEffect(() => {
    loadPersona();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadConversations();
    }, [])
  );

  const handleNewChat = async () => {
    try {
      const conv = await createConversation();
      if (conv) {
        router.push(`/chat/${conv.id}`);
      }
    } catch (err) {
      Alert.alert("Error", "Failed to create conversation");
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert("Delete", "Delete this conversation?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteConversation(id),
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={state.conversations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ConversationItem
            conversation={item}
            onPress={() => router.push(`/chat/${item.id}`)}
            onLongPress={() => handleDelete(item.id)}
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={state.isLoading}
            onRefresh={loadConversations}
            tintColor="#e0e0e0"
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No conversations yet</Text>
            <Text style={styles.emptySubtext}>Tap + to start chatting</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={handleNewChat}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#16213e" },
  list: { flexGrow: 1, paddingVertical: 8 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 100 },
  emptyText: { fontSize: 18, color: "#a0a0a0" },
  emptySubtext: { fontSize: 14, color: "#707070", marginTop: 8 },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#e94560",
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    shadowColor: "#e94560",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  fabText: { fontSize: 28, color: "#fff", marginTop: -2 },
});
