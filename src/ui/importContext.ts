import { createContext, useContext } from "react";

// Choosing files to import, provided by <ImportProvider>.
export interface ImportActions {
  chooseMusicFiles: () => Promise<void>;
  chooseMusicFolder: () => Promise<void>;
  // Replace one song's lyrics with a chosen LRC, TXT or enhanced file.
  chooseLyricsFor: (trackId: string) => void;
  // Choose a song's folder to sync its lyric sidecars from.
  chooseSyncFolder: (trackId: string) => Promise<void>;
}

export const ImportContext = createContext<ImportActions | null>(null);

export function useImport() {
  const actions = useContext(ImportContext);
  if (!actions) throw new Error("useImport needs an <ImportProvider>");
  return actions;
}
