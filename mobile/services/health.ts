import { Platform } from "react-native";
import { HealthMetric } from "../types";

export interface HealthData {
  steps: number | null;
  sleepMinutes: number | null;
  heartRate: number | null;
}

function todayISO(): string {
  return new Date().toISOString();
}

// ── Platform guard ──────────────────────────────────────────

export async function getHealthData(): Promise<HealthData> {
  if (Platform.OS !== "ios") {
    return { steps: null, sleepMinutes: null, heartRate: null };
  }

  try {
    const AppleHealthKit = require("react-native-health");
    if (!AppleHealthKit?.initHealthKit) {
      console.warn("[health] AppleHealthKit not available");
      return { steps: null, sleepMinutes: null, heartRate: null };
    }
    return new Promise((resolve) => {
      const permissions = AppleHealthKit.Constants.Permissions;

      AppleHealthKit.initHealthKit(
        {
          permissions: {
            read: [
              permissions.StepCount,
              permissions.SleepAnalysis,
              permissions.HeartRate,
            ],
            write: [],
          },
        },
        async (err: string) => {
          if (err) {
            console.warn("[health] HealthKit init error:", err);
            resolve({ steps: null, sleepMinutes: null, heartRate: null });
            return;
          }

          // Each query is isolated — single-level nesting
          resolve({
            steps: await fetchSteps(AppleHealthKit),
            sleepMinutes: await fetchSleep(AppleHealthKit),
            heartRate: await fetchHeartRate(AppleHealthKit),
          });
        },
      );
    });
  } catch (e) {
    console.warn("[health] react-native-health not available:", e);
    return { steps: null, sleepMinutes: null, heartRate: null };
  }
}

// ── Individual query helpers (each wraps one callback) ──────

function fetchSteps(AppleHealthKit: any): Promise<number | null> {
  return new Promise((resolve) => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    AppleHealthKit.getStepCount(
      { startDate: startOfDay.toISOString(), endDate: now.toISOString() },
      (err: string, result: { value: number }) => {
        if (err) {
          console.warn("[health] Steps fetch error:", err);
          resolve(null);
        } else {
          resolve(Math.round(result.value));
        }
      },
    );
  });
}

function fetchSleep(AppleHealthKit: any): Promise<number | null> {
  return new Promise((resolve) => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(startOfDay.getTime() - 24 * 3600 * 1000);
    AppleHealthKit.getSleepSamples(
      { startDate: yesterdayStart.toISOString(), endDate: startOfDay.toISOString() },
      (err: string, result: { value: number }[]) => {
        if (err || !result || result.length === 0) {
          resolve(null);
        } else {
          const total = result.reduce((sum, s) => sum + s.value, 0);
          resolve(Math.round(total));
        }
      },
    );
  });
}

function fetchHeartRate(AppleHealthKit: any): Promise<number | null> {
  return new Promise((resolve) => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    AppleHealthKit.getHeartRateSamples(
      { startDate: startOfDay.toISOString(), endDate: now.toISOString() },
      (err: string, result: { value: number }[]) => {
        if (err || !result || result.length === 0) {
          resolve(null);
        } else {
          const avg = result.reduce((sum, h) => sum + h.value, 0) / result.length;
          resolve(Math.round(avg));
        }
      },
    );
  });
}

// ── Data → metrics conversion ───────────────────────────────

export function healthDataToMetrics(data: HealthData): HealthMetric[] {
  const now = todayISO();
  const metrics: HealthMetric[] = [];

  if (data.steps !== null) {
    metrics.push({ metric_type: "steps", value: data.steps, unit: "steps", logged_at: now });
  }
  if (data.sleepMinutes !== null) {
    metrics.push({ metric_type: "sleep", value: data.sleepMinutes, unit: "minutes", logged_at: now });
  }
  if (data.heartRate !== null) {
    metrics.push({ metric_type: "heart_rate", value: data.heartRate, unit: "bpm", logged_at: now });
  }

  return metrics;
}
