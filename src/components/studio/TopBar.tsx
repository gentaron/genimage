"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { IconBolt, IconGrid, IconMoon, IconRefresh, IconSun } from "@/components/ui/icons";
import { Tooltip } from "@/components/ui/primitives";
import { useStudio } from "./StudioProvider";

/**
 * The `<html data-theme>` attribute is the source of truth — the inline script
 * in the root layout sets it before first paint. Subscribing to it keeps React
 * in sync without duplicating the state.
 */
function subscribeToTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    () => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"),
    () => "dark" as const,
  );

  const flip = useCallback(() => {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("genimage:theme", next);
    } catch {
      /* storage unavailable — the choice just will not persist */
    }
  }, []);

  return (
    <button
      type="button"
      onClick={flip}
      className="btn btn-ghost p-2"
      aria-label={`Switch to the ${theme === "dark" ? "light" : "dark"} theme`}
    >
      {theme === "dark" ? <IconSun size={15} /> : <IconMoon size={15} />}
    </button>
  );
}

export function TopBar() {
  const { catalog, settings, jobs } = useStudio();
  const [refreshing, setRefreshing] = useState(false);

  const chosen =
    settings.provider === "auto"
      ? catalog?.providers.find((p) => p.available)
      : catalog?.providers.find((p) => p.id === settings.provider);

  const inFlight = jobs.filter((j) => j.status === "queued" || j.status === "running").length;

  const refresh = async () => {
    setRefreshing(true);
    await fetch("/api/catalog?refresh=1").catch(() => null);
    setRefreshing(false);
    window.location.reload();
  };

  return (
    <header
      className="flex h-14 shrink-0 items-center gap-3 px-4"
      style={{ background: "var(--panel)", borderBottom: "1px solid var(--border)" }}
    >
      <Link href="/" className="flex items-center gap-2.5">
        <span
          className="grid h-7 w-7 place-items-center rounded-lg"
          style={{ background: "linear-gradient(135deg, #8b5cf6, #f43f5e)" }}
          aria-hidden
        >
          <IconBolt size={15} style={{ color: "#fff" }} />
        </span>
        <span className="text-[14.5px] font-semibold tracking-tight">GenImage Studio</span>
      </Link>

      <Tooltip
        side="bottom"
        width={300}
        content={
          chosen ? (
            <>
              <strong style={{ color: "var(--text)" }}>{chosen.label}</strong>
              <span className="mt-1 block" style={{ color: "var(--text-muted)" }}>
                {chosen.detail}
              </span>
              <span className="mt-1.5 block" style={{ color: chosen.capabilities.loras ? "var(--ok)" : "var(--warn)" }}>
                {chosen.capabilities.loras
                  ? "Loads your LoRA stack."
                  : "Does not load LoRA weights — trigger words only."}
              </span>
            </>
          ) : (
            "Checking which backends are reachable…"
          )
        }
      >
        <span
          className="inline-flex cursor-help items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px]"
          style={{ background: "var(--sunken)", border: "1px solid var(--border)" }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: chosen?.available ? "var(--ok)" : "var(--warn)" }}
            aria-hidden
          />
          {chosen?.label ?? "No backend"}
          {settings.provider === "auto" && (
            <span style={{ color: "var(--text-faint)" }}>auto</span>
          )}
        </span>
      </Tooltip>

      {inFlight > 0 && (
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          {inFlight} in queue
        </span>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="btn btn-ghost p-2"
          aria-label="Re-check the backends"
        >
          <IconRefresh size={15} className={refreshing ? "spin" : undefined} />
        </button>
        <Link href="/gallery" className="btn btn-ghost px-3 py-2">
          <IconGrid size={15} />
          Gallery
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
