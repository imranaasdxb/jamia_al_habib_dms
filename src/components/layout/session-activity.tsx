"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { usePageDataCache } from "@/components/page-data-provider";

export function SessionActivity({ timeoutMinutes, accountId }: { timeoutMinutes: number; accountId: string }) {
  const router = useRouter();
  const cache = usePageDataCache();
  const timeoutKey = `${accountId}:settings:session-timeout`;

  useEffect(() => {
    let lastActivity = Date.now();
    let lastSentActivity = lastActivity;
    let stopped = false;
    let inFlight = false;
    const recordActivity = () => { lastActivity = Date.now(); };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((event) => window.addEventListener(event, recordActivity, { passive: true }));

    const interval = window.setInterval(async () => {
      if (inFlight || stopped) return;
      if (Date.now() - lastActivity >= cache.read(timeoutKey, timeoutMinutes) * 60000) {
        stopped = true;
        try {
          await authClient.signOut();
        } catch {
          // The server independently rejects an idle session even if sign-out is unreachable.
        } finally {
          router.replace("/login?notice=expired");
          router.refresh();
        }
        return;
      }
      if (lastActivity <= lastSentActivity) return;
      inFlight = true;
      const activityBeingSent = lastActivity;
      try {
        const response = await fetch("/api/v1/session", { method: "POST" });
        if (response.status === 401) {
          stopped = true;
          router.replace("/login?notice=expired");
          router.refresh();
        } else if (response.ok) {
          lastSentActivity = activityBeingSent;
          const result: unknown = await response.json();
          if (typeof result === "object" && result !== null && "data" in result
            && typeof result.data === "object" && result.data !== null && "sessionTimeoutMinutes" in result.data) {
            const minutes = result.data.sessionTimeoutMinutes;
            if (typeof minutes === "number" && Number.isInteger(minutes) && minutes >= 5 && minutes <= 480) {
              cache.write(timeoutKey, minutes);
            }
          }
        }
      } catch {
        // A transient connection failure does not extend the server-side session.
        // Keep the activity unsent so the next interval can try again.
      } finally {
        inFlight = false;
      }
    }, 60000);

    return () => {
      stopped = true;
      window.clearInterval(interval);
      events.forEach((event) => window.removeEventListener(event, recordActivity));
    };
  }, [router, timeoutMinutes, cache, timeoutKey]);

  return null;
}
