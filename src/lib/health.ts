import http from "http";
import https from "https";
import { Service, Services } from "./types";

type StatusCallback = (id: string, status: Service["status"]) => void;

const checks = new Map<string, ReturnType<typeof setInterval>>();

export async function checkServiceHealth(
  service: Service
): Promise<"online" | "offline"> {
  if (!service.url) return "offline";

  try {
    const checkUrl = new URL(service.checkPath || "/", service.url).toString();
    const parsed = new URL(checkUrl);
    const mod = parsed.protocol === "https:" ? https : http;

    return await new Promise((resolve) => {
      const req = mod.get(
        checkUrl,
        {
          rejectUnauthorized: false,
          timeout: 5000,
        },
        (res) => {
          const code = res.statusCode ?? 0;
          resolve(code >= 200 && code < 400 ? "online" : "offline");
        }
      );

      req.on("error", () => resolve("offline"));
      req.on("timeout", () => {
        req.destroy();
        resolve("offline");
      });
    });
  } catch {
    return "offline";
  }
}

export async function checkAllServices(
  services: Services
): Promise<Map<string, "online" | "offline">> {
  const results = new Map<string, "online" | "offline">();

  const checks = Object.entries(services).map(async ([id, service]) => {
    const status = await checkServiceHealth(service);
    results.set(id, status);
  });

  await Promise.allSettled(checks);
  return results;
}

export function startHealthChecks(
  services: Services,
  intervalMs: number,
  callback: StatusCallback
): void {
  // Clear existing checks
  stopHealthChecks();

  for (const [id, service] of Object.entries(services)) {
    if (!service.url) continue;

    const check = async () => {
      const status = await checkServiceHealth(service);
      callback(id, status);
    };

    // Initial check
    check();

    // Periodic checks
    const interval = setInterval(check, intervalMs);
    checks.set(id, interval);
  }
}

export function stopHealthChecks(): void {
  for (const interval of checks.values()) {
    clearInterval(interval);
  }
  checks.clear();
}
