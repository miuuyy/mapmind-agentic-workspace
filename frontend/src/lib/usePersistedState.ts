import { useEffect } from "react";

export function usePersistedString(key: string, value: string): void {
  useEffect(() => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Ignore localStorage write failures.
    }
  }, [key, value]);
}

export function usePersistedBoolean(key: string, value: boolean): void {
  usePersistedString(key, value ? "1" : "0");
}

export function usePersistedNumber(key: string, value: number): void {
  usePersistedString(key, String(value));
}
