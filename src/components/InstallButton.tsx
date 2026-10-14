"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/** Chrome / Edge / Android fire this before showing their own install prompt. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac, so also check for touch.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

const noSubscribe = () => () => {};

export default function InstallButton() {
  // Read on the client only; the server render assumes "installed" and shows nothing.
  const standalone = useSyncExternalStore(noSubscribe, isStandalone, () => true);
  const ios = useSyncExternalStore(noSubscribe, isIos, () => false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [justInstalled, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const installed = standalone || justInstalled;

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || (!deferred && !ios)) return null;

  return (
    <>
      <button
        type="button"
        className="min-h-9 rounded-full bg-[var(--accent)] px-3 text-xs font-black text-black active:brightness-90"
        onClick={async () => {
          if (deferred) {
            await deferred.prompt();
            await deferred.userChoice;
            setDeferred(null);
          } else {
            setShowHelp(true);
          }
        }}
      >
        アプリにする
      </button>
      {showHelp && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/60"
          role="dialog"
          aria-modal="true"
          aria-label="ホーム画面に追加"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="pb-safe w-full rounded-t-3xl border-t border-[var(--border)] bg-[var(--panel)] px-5 pt-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-black">ホーム画面に追加してアプリにする</p>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[var(--text)]">
              <li>Safari の下にある共有ボタン(□に↑)をタップ</li>
              <li>「ホーム画面に追加」を選ぶ</li>
              <li>右上の「追加」をタップ</li>
            </ol>
            <p className="mt-3 text-xs text-[var(--muted)]">Safari 以外のブラウザだと出ないことがあるよ。</p>
            <button
              type="button"
              className="mt-4 mb-2 min-h-12 w-full rounded-2xl bg-white font-black text-black"
              onClick={() => setShowHelp(false)}
            >
              わかった
            </button>
          </div>
        </div>
      )}
    </>
  );
}
