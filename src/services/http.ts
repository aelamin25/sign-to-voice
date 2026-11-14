import { API_BASE } from "../app/config";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** JSON POST/GET to our own server (/api/*). Keys never live in the browser. */
export async function api<T>(path: string, body?: unknown, timeoutMs = 20000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* not json */ }
      throw new ApiError(msg, res.status);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
