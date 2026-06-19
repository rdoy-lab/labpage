import http from "http";
import https from "https";
import { Service, Services } from "./types";
import logger from "./logger";

const log = logger.child({ module: "health" });

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
          const status = (code >= 200 && code < 400) || code === 401 ? "online" : "offline";
          log.debug({ url: checkUrl, statusCode: code, status }, "Health check response");
          resolve(status);
        }
      );

      req.on("error", (err) => {
        log.debug({ url: checkUrl, err }, "Health check error");
        resolve("offline");
      });
      req.on("timeout", () => {
        log.debug({ url: checkUrl }, "Health check timed out");
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
    log.info({ serviceId: id, status }, "Health check completed");
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
  log.info({ count: Object.keys(services).length, intervalMs }, "Starting periodic health checks");
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
  log.info("Stopping health checks");
  for (const interval of checks.values()) {
    clearInterval(interval);
  }
  checks.clear();
}
