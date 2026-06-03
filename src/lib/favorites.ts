"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "labpage-favorites";

function getSnapshot(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set<string>();
  }
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getServerSnapshot(): Set<string> {
  return new Set();
}

export function useFavorites() {
  const favorites = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggleFavorite = useCallback((serviceId: string) => {
    const current = getSnapshot();
    if (current.has(serviceId)) {
      current.delete(serviceId);
    } else {
      current.add(serviceId);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...current]));
    window.dispatchEvent(new Event("storage"));
  }, []);

  const isFavorite = useCallback(
    (serviceId: string) => favorites.has(serviceId),
    [favorites]
  );

  return { favorites, toggleFavorite, isFavorite };
}
