// =====================================================================
// KNOWLEDGE BRAIN — PWA CONTROLS & OFFLINE INDICATOR
// Install prompt banner, offline network detector & service worker lifecycle
// =====================================================================

import { useState, useEffect, useCallback } from "react";
import { Download, WifiOff, Wifi, X, Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function PWAControls() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [justReconnected, setJustReconnected] = useState(false);

  // 1. Service Worker Registration
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      window.location.protocol.startsWith("http")
    ) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // Service worker active
          reg.onupdatefound = () => {
            const installing = reg.installing;
            if (installing) {
              installing.onstatechange = () => {
                if (installing.state === "installed" && navigator.serviceWorker.controller) {
                  toast.info("A new version of Knowledge Brain is available. Reload to update.", {
                    action: {
                      label: "Reload",
                      onClick: () => window.location.reload(),
                    },
                  });
                }
              };
            }
          };
        })
        .catch((err) => {
          console.warn("[PWA] SW registration:", err);
        });
    }
  }, []);

  // 2. Install Banner Listener (beforeinstallprompt)
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowInstallBanner(true);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setShowInstallBanner(false);
      toast.success("Knowledge Brain installed successfully!");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  // 3. Online/Offline Network Status
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOffline = () => {
      setIsOffline(true);
      setJustReconnected(false);
      toast.warning("Network connection lost. Knowledge Brain is running offline.");
    };

    const handleOnline = () => {
      setIsOffline(false);
      setJustReconnected(true);
      toast.success("Network connection restored. Knowledge Brain synchronized.");
      setTimeout(() => setJustReconnected(false), 4000);
    };

    setIsOffline(!navigator.onLine);

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  const handleInstallClick = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowInstallBanner(false);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  return (
    <>
      {/* Offline Status Floating Banner */}
      {isOffline && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-950/90 px-4 py-1.5 text-xs text-amber-200 shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-2">
          <WifiOff className="size-3.5 text-amber-400 animate-pulse" />
          <span>Offline Mode — operating with cached brain intelligence</span>
        </div>
      )}

      {/* Just Reconnected Banner */}
      {!isOffline && justReconnected && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-950/90 px-4 py-1.5 text-xs text-emerald-200 shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-2">
          <Wifi className="size-3.5 text-emerald-400" />
          <span>Reconnected — synced with Knowledge Brain cloud</span>
        </div>
      )}

      {/* In-App Floating Install Banner */}
      {showInstallBanner && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border border-primary/30 bg-card/95 p-4 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="size-5" />
              </span>
              <div>
                <h4 className="text-xs font-semibold text-foreground">Install Knowledge Brain</h4>
                <p className="text-[11px] text-muted-foreground">Fast, offline-ready desktop and mobile app</p>
              </div>
            </div>
            <button
              onClick={() => setShowInstallBanner(false)}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded"
              aria-label="Dismiss install banner"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowInstallBanner(false)}
            >
              Later
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={handleInstallClick}
            >
              <Download className="size-3.5" />
              Install App
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
