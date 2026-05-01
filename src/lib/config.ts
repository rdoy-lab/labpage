import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";
import { Config, DEFAULT_CONFIG } from "./types";

function getArgValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return undefined;
}

const CONFIG_PATH = path.resolve(
  /*turbopackIgnore: true*/
  getArgValue("--config")
  || process.env.LABPAGE_CONFIG
  || path.join(process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || "/root", ".config"), "labpage", "config.yaml")
);
const CONFIG_DIR = path.dirname(CONFIG_PATH);

export async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

export async function loadConfig(): Promise<Config> {
  try {
    const content = await fs.readFile(CONFIG_PATH, "utf-8");
    const parsed = yaml.load(content) as Partial<Config>;
    return mergeConfig(DEFAULT_CONFIG, parsed);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      await saveConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }
    throw error;
  }
}

export async function saveConfig(config: Config): Promise<void> {
  await ensureConfigDir();
  const content = yaml.dump(config, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  });
  await fs.writeFile(CONFIG_PATH, content, "utf-8");
}

export async function updateConfig(updates: Partial<Config>): Promise<Config> {
  const current = await loadConfig();
  const merged = mergeConfig(current, updates);
  await saveConfig(merged);
  return merged;
}

function mergeConfig(base: Config, override: Partial<Config>): Config {
  return {
    docker: {
      ...base.docker,
      ...override.docker,
      traefik: { ...base.docker.traefik, ...override.docker?.traefik },
    },
    kubernetes: { ...base.kubernetes, ...override.kubernetes },
    groups: { ...base.groups, ...override.groups },
    services: { ...base.services, ...override.services },
  };
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}
