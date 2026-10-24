"use client";

let redirecting = false;

function expireBrowserSession() {
  if (redirecting) return;
  redirecting = true;
  void (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2500);
    try {
      await fetch("/api/v1/auth/session-expired", {
        method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
      });
    } catch {
      // An expired account must reach login even if cookie cleanup is unavailable.
    } finally {
      window.clearTimeout(timeout);
      // A full navigation also discards all account-scoped in-memory page caches.
      window.location.replace("/login?notice=expired");
    }
  })();
}

export async function sessionFetch(url: string, options?: RequestInit): Promise<Response> {
  const response = await fetch(url, options);
  if (response.status === 401 || response.status === 403) {
    const payload: unknown = await response.clone().json().catch(() => null);
    const error = typeof payload === "object" && payload !== null && "error" in payload ? payload.error : null;
    if (typeof error === "object" && error !== null && "code" in error && error.code === "SESSION_EXPIRED") {
      expireBrowserSession();
    }
  }
  return response;
}
