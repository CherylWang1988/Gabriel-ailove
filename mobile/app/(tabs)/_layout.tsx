import { Tabs } from "expo-router";
import { Text, StyleSheet } from "react-native";

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <Text style={[styles.icon, focused && styles.iconFocused]}>{emoji}</Text>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#1a1a2e" },
        headerTintColor: "#e0e0e0",
        headerTitleStyle: { fontWeight: "600" },
        tabBarStyle: {
          backgroundColor: "rgba(26,26,46,0.95)",
          borderTopColor: "#0f3460",
          borderTopWidth: 1,
          paddingBottom: 20,
          paddingTop: 8,
          height: 80,
        },
        tabBarActiveTintColor: "#e94560",
        tabBarInactiveTintColor: "#707070",
        tabBarLabelStyle: { fontSize: 11, marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="chat"
        options={{
          title: "对话",
          headerTitle: "顾然",
          headerRight: () => (
            <Text style={styles.status}>● 守护中</Text>
          ),
          tabBarIcon: ({ focused }) => <TabIcon emoji="💬" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="scenarios"
        options={{
          title: "场景",
          headerTitle: "专属场景",
          tabBarIcon: ({ focused }) => <TabIcon emoji="✨" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "我",
          headerTitle: "我",
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  icon: { fontSize: 20, opacity: 0.5 },
  iconFocused: { opacity: 1 },
  status: {
    color: "#34C759",
    fontSize: 12,
    fontWeight: "500",
    marginRight: 16,
  },
});
