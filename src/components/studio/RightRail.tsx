"use client";

import { useState } from "react";
import { IconBook, IconRefresh } from "@/components/ui/icons";
import { AdvancedPanel } from "./AdvancedPanel";
import { CanvasPanel } from "./CanvasPanel";
import { LoraPanel } from "./LoraPanel";
import { ModelPanel } from "./ModelPanel";
import { NotesDrawer } from "./NotesDrawer";
import { ReferencePanel } from "./ReferencePanel";
import { useStudio } from "./StudioProvider";

export function RightRail() {
  const { reset } = useStudio();
  const [notesOpen, setNotesOpen] = useState(false);

  return (
    <>
      <aside
        className="flex flex-col lg:h-full"
        style={{ background: "var(--panel)", borderLeft: "1px solid var(--border)" }}
        aria-label="Generation settings"
      >
        <div className="min-h-0 flex-1 lg:overflow-y-auto">
          <ReferencePanel />
          <ModelPanel />
          <LoraPanel />
          <CanvasPanel />
          <AdvancedPanel />
        </div>

        <footer
          className="grid shrink-0 grid-cols-2 gap-2 p-3"
          style={{ borderTop: "1px solid var(--border)", background: "var(--panel)" }}
        >
          <button type="button" onClick={() => setNotesOpen(true)} className="btn btn-ghost py-2">
            <IconBook size={15} />
            Notes
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Reset every setting back to its default?")) reset();
            }}
            className="btn btn-ghost py-2"
          >
            <IconRefresh size={15} />
            Reset
          </button>
        </footer>
      </aside>

      <NotesDrawer open={notesOpen} onClose={() => setNotesOpen(false)} />
    </>
  );
}
