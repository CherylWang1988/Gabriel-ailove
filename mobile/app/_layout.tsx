import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ChatProvider } from "../contexts/ChatContext";
import { registerPushToken } from "../services/notifications";

export default function RootLayout() {
  useEffect(() => {
    registerPushToken();
  }, []);

  return (
    <ChatProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="chat/[id]"
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: "#1a1a2e" },
            headerTintColor: "#e0e0e0",
            headerTitleStyle: { fontWeight: "600" },
          }}
        />
      </Stack>
    </ChatProvider>
  );
}
