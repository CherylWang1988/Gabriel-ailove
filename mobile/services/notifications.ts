import { Platform } from "react-native";
import { api } from "./api";

export async function registerPushToken(): Promise<void> {
  try {
    const Notifications = require("expo-notifications");

    // Configure notification handler
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    // Request permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.warn("[push] Notification permission not granted");
      return;
    }

    // Get Expo push token
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;

    if (token) {
      await api.registerPush(token, Platform.OS);
      console.log("[push] Token registered:", token.slice(0, 10) + "...");
    }
  } catch (e) {
    console.warn("[push] expo-notifications not available:", e);
  }
}
