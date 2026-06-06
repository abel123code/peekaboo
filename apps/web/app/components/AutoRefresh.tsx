"use client";

import { useEffect } from "react";

export function AutoRefresh({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      window.location.reload();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  return null;
}
