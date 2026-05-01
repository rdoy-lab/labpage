"use client";

import { create } from "zustand";
import { Config, Service, GroupMeta } from "./types";

interface StoreState {
  config: Config | null;
  loading: boolean;
  error: string | null;

  // Actions
  fetchConfig: () => Promise<void>;
  updateService: (id: string, service: Partial<Service>) => Promise<void>;
  deleteService: (id: string) => Promise<void>;
  addService: (id: string, service: Service) => Promise<void>;
  updateGroup: (name: string, group: Partial<GroupMeta>) => Promise<void>;
  refreshDocker: () => Promise<void>;
  checkHealth: () => Promise<void>;
}

export const useStore = create<StoreState>((set) => ({
  config: null,
  loading: false,
  error: null,

  fetchConfig: async () => {
    set({ loading: true, error: null });
    try {
      const response = await fetch("/api/config");
      if (!response.ok) throw new Error("Failed to fetch config");
      const config = await response.json();
      set({ config, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  updateService: async (id, updates) => {
    try {
      const response = await fetch(`/api/services/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error("Failed to update service");
      const config = await response.json();
      set({ config });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  deleteService: async (id) => {
    try {
      const response = await fetch(`/api/services/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete service");
      const config = await response.json();
      set({ config });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  addService: async (id, service) => {
    try {
      const response = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...service }),
      });
      if (!response.ok) throw new Error("Failed to add service");
      const config = await response.json();
      set({ config });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  updateGroup: async (name, updates) => {
    try {
      const response = await fetch(`/api/groups/${encodeURIComponent(name)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error("Failed to update group");
      const config = await response.json();
      set({ config });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  refreshDocker: async () => {
    set({ loading: true });
    try {
      const response = await fetch("/api/services/refresh", {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to refresh services");
      const config = await response.json();
      set({ config, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  checkHealth: async () => {
    try {
      const response = await fetch("/api/health", { method: "POST" });
      if (!response.ok) throw new Error("Failed to check health");
      const config = await response.json();
      set({ config });
    } catch (error) {
      console.error("Health check failed:", error);
    }
  },
}));
