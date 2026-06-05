import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error("Missing Supabase environment variables.");
}

const browserStorage = {
  getItem(key: string) {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key);
  },
  setItem(key: string, value: string) {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(key) !== null) window.sessionStorage.setItem(key, value);
    else window.localStorage.setItem(key, value);
  },
  removeItem(key: string) {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(key);
    window.localStorage.removeItem(key);
  }
};

export function keepAuthInSessionOnly() {
  if (typeof window === "undefined") return;
  Object.keys(window.localStorage)
    .filter((key) => key.startsWith("sb-") && key.endsWith("-auth-token"))
    .forEach((key) => {
      const value = window.localStorage.getItem(key);
      if (value) window.sessionStorage.setItem(key, value);
      window.localStorage.removeItem(key);
    });
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: browserStorage
  }
});
