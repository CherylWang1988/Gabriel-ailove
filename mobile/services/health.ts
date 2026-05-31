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

export async function getHealthData(): Promise<HealthData> {
  if (Platform.OS !== "ios") {
    return { steps: null, sleepMinutes: null, heartRate: null };
  }

  try {
    // Dynamic import — react-native-health may not be installed yet
    const AppleHealthKit = require("react-native-health").default;

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
        (err: string) => {
          if (err) {
            console.warn("[health] HealthKit init error:", err);
            resolve({ steps: null, sleepMinutes: null, heartRate: null });
            return;
          }

          // Fetch today's steps
          const now = new Date();
          const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

          AppleHealthKit.getStepCount(
            { startDate: startOfDay.toISOString(), endDate: now.toISOString() },
            (stepErr: string, stepResult: { value: number }) => {
              const steps = stepErr ? null : Math.round(stepResult.value);

              // Fetch sleep (yesterday's sleep)
              const yesterdayStart = new Date(startOfDay.getTime() - 24 * 3600 * 1000);
              AppleHealthKit.getSleepSamples(
                { startDate: yesterdayStart.toISOString(), endDate: startOfDay.toISOString() },
                (sleepErr: string, sleepResult: { value: number }[]) => {
                  let sleepMinutes: number | null = null;
                  if (!sleepErr && sleepResult && sleepResult.length > 0) {
                    const totalSleep = sleepResult.reduce((sum, s) => sum + s.value, 0);
                    sleepMinutes = Math.round(totalSleep);
                  }

                  // Fetch resting heart rate
                  AppleHealthKit.getHeartRateSamples(
                    { startDate: startOfDay.toISOString(), endDate: now.toISOString() },
                    (hrErr: string, hrResult: { value: number }[]) => {
                      let heartRate: number | null = null;
                      if (!hrErr && hrResult && hrResult.length > 0) {
                        const avgHR = hrResult.reduce((sum, h) => sum + h.value, 0) / hrResult.length;
                        heartRate = Math.round(avgHR);
                      }

                      resolve({ steps, sleepMinutes, heartRate });
                    }
                  );
                }
              );
            }
          );
        }
      );
    });
  } catch (e) {
    console.warn("[health] react-native-health not available:", e);
    return { steps: null, sleepMinutes: null, heartRate: null };
  }
}

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
