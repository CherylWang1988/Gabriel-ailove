import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ChatProvider } from "../contexts/ChatContext";

export default function RootLayout() {
  return (
    <ChatProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#1a1a2e" },
          headerTintColor: "#e0e0e0",
          headerTitleStyle: { fontWeight: "600" },
          contentStyle: { backgroundColor: "#16213e" },
        }}
      >
        <Stack.Screen
          name="index"
          options={{ title: "Gabriel", headerShown: false }}
        />
        <Stack.Screen
          name="chat/[id]"
          options={{ title: "Chat", headerBackTitle: "Back" }}
        />
      </Stack>
    </ChatProvider>
  );
}
