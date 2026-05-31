import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
} from "react-native";
import { User } from "../../types";
import { api } from "../../services/api";

export default function ProfileScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [healthSync, setHealthSync] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const data = await api.getUser();
      setUser(data);
    } catch (e) {
      console.warn("Failed to load user:", e);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.nickname || "用")[0]}
          </Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.name}>{user?.nickname || "用户"}</Text>
          <Text style={styles.location}>新加坡 · 活跃中</Text>
        </View>
      </View>

      {/* Settings Group */}
      <View style={styles.settingsGroup}>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>生理同频 (静默同步)</Text>
          <Switch
            value={healthSync}
            onValueChange={setHealthSync}
            trackColor={{ false: "#3e3e3e", true: "#34C759" }}
            thumbColor="#fff"
          />
        </View>
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>数据终端</Text>
          <Text style={styles.settingValue}>
            {healthSync ? "HealthKit 已连接" : "未授权"}
          </Text>
        </View>
      </View>

      {/* Memory Anchor */}
      <View style={styles.memoryCard}>
        <Text style={styles.memoryLabel}>核心协议重置日</Text>
        <Text style={styles.memoryDate}>2025 年 9 月 28 日</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#16213e" },
  content: { padding: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 30,
    marginTop: 10,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#e94560",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
  },
  avatarText: { fontSize: 28, color: "#fff", fontWeight: "600" },
  headerInfo: { flex: 1 },
  name: { fontSize: 20, fontWeight: "600", color: "#e0e0e0", marginBottom: 4 },
  location: { fontSize: 13, color: "#a0a0a0" },
  settingsGroup: {
    backgroundColor: "#1a1a2e",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 20,
  },
  settingItem: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#0f3460",
  },
  settingLabel: { fontSize: 15, color: "#e0e0e0" },
  settingValue: { fontSize: 14, color: "#a0a0a0" },
  memoryCard: {
    backgroundColor: "#1a1a2e",
    borderRadius: 16,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: "#e94560",
  },
  memoryLabel: { fontSize: 12, color: "#a0a0a0", marginBottom: 8 },
  memoryDate: {
    fontSize: 18,
    fontWeight: "600",
    color: "#e0e0e0",
    letterSpacing: 1,
  },
});
