import { Services } from "./types";

let discoveredServices: Services = {};
let discoveredTimestamp: string | null = null;

export function getDiscoveredServices(): Services {
  return discoveredServices;
}

export function setDiscoveredServices(services: Services): void {
  discoveredServices = services;
  discoveredTimestamp = new Date().toISOString();
}

export function getDiscoveredTimestamp(): string | null {
  return discoveredTimestamp;
}

export function clearDiscoveredServices(): void {
  discoveredServices = {};
  discoveredTimestamp = null;
}
