import { LoaderCircle, Plus } from "lucide-react";
import { useMusic } from "../../music/store";
import { usePageTitle } from "../hooks";
import { openDialog, useUi } from "../state";
import type { View } from "../state";

const eyebrows: Record<View, string> = {
  library: "SOUNDS LIKE YOUR NIGHT",
  favorites: "ON REPEAT, IN YOUR HEART",
  playlists: "A MIX OF YOUR OWN",
  settings: "MAKE YOURSELF AT HOME",
};

export function PageHeading() {
  const view = useUi((s) => s.view);
  const title = usePageTitle();
  const importing = useMusic((s) => s.importing),
    ready = useMusic((s) => s.ready);
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow accent">{eyebrows[view]}</span>
        <h1>
          {title}
          <span className="title-dot">.</span>
        </h1>
      </div>
      {view === "library" && (
        <button
          className="primary import-top"
          onClick={() => openDialog({ kind: "import" })}
          disabled={!!importing || !ready}
        >
          {importing ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <Plus size={18} />
          )}
          <span>{importing ? "导入中" : "导入音乐"}</span>
        </button>
      )}
    </div>
  );
}
