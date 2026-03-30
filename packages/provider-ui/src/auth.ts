// packages/provider-ui/src/auth.ts
import { useState, useCallback } from "react";
import type { ServiceProvider } from "@x402-gateway-mvp/shared";

const TOKEN_KEY = "x402_provider_token";
const PROVIDER_KEY = "x402_provider_info";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeAuth(token: string, provider: ServiceProvider): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(PROVIDER_KEY, JSON.stringify(provider));
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PROVIDER_KEY);
}

export function getStoredProvider(): ServiceProvider | null {
  const raw = localStorage.getItem(PROVIDER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as ServiceProvider; } catch { return null; }
}

export function useAuth() {
  const [token, setToken] = useState<string | null>(getStoredToken);
  const [provider, setProvider] = useState<ServiceProvider | null>(getStoredProvider);

  const login = useCallback((t: string, p: ServiceProvider) => {
    storeAuth(t, p);
    setToken(t);
    setProvider(p);
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setToken(null);
    setProvider(null);
  }, []);

  const updateProvider = useCallback((p: ServiceProvider) => {
    localStorage.setItem(PROVIDER_KEY, JSON.stringify(p));
    setProvider(p);
  }, []);

  return { token, provider, isLoggedIn: !!token, login, logout, updateProvider };
}
