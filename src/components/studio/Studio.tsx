"use client";

import { IconClose, IconWarning } from "@/components/ui/icons";
import { GenerateBar } from "./GenerateBar";
import { ModeTabs } from "./ModeTabs";
import { PromptComposer } from "./PromptComposer";
import { Results } from "./Results";
import { RightRail } from "./RightRail";
import { StudioProvider, useStudio } from "./StudioProvider";
import { TopBar } from "./TopBar";

function ErrorBanner() {
  const { error, dismissError } = useStudio();
  if (!error) return null;

  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-[13px] fade-up"
      style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
    >
      <IconWarning size={15} className="mt-px shrink-0" />
      <span className="flex-1">{error}</span>
      <button type="button" onClick={dismissError} aria-label="Dismiss" className="shrink-0 p-0.5">
        <IconClose size={14} />
      </button>
    </div>
  );
}

function Workspace() {
  return (
    <div className="flex h-dvh flex-col">
      <TopBar />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1000px] px-4 py-4 sm:px-6">
            <ModeTabs />

            <div className="py-4">
              <PromptComposer />
            </div>

            <GenerateBar />

            <div className="mt-6">
              <ErrorBanner />
              <Results />
            </div>
          </div>
        </main>

        <div className="w-full shrink-0 lg:h-full lg:w-[336px]">
          <RightRail />
        </div>
      </div>
    </div>
  );
}

export function Studio() {
  return (
    <StudioProvider>
      <Workspace />
    </StudioProvider>
  );
}
