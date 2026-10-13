import { useMemo, useRef } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { pickFolder, pickMusicFiles } from "../music/files";
import {
  importFolder,
  importMusic,
  replaceLyrics,
  syncLyricsFromFolder,
  syncTrackLyrics,
} from "../music/library";
import { useMusic } from "../music/store";
import { notify } from "../notice";
import { ImportContext } from "./importContext";
import type { ImportActions } from "./importContext";
import { closeAllDialogs } from "./state";

const canImport = () => {
  const { ready, importing } = useMusic.getState();
  return ready && !importing;
};
const takeFiles = (event: ChangeEvent<HTMLInputElement>) => {
  const files = Array.from(event.currentTarget.files || []);
  event.currentTarget.value = "";
  return files;
};

// Prefer the browser pickers, which keep file handles for playback and lyric
// sync after a reload. Where they are missing or fail, these hidden inputs
// take over: they still work, but every visit needs a fresh selection.
export function ImportProvider({ children }: { children: ReactNode }) {
  const musicInput = useRef<HTMLInputElement>(null),
    folderInput = useRef<HTMLInputElement>(null),
    syncFolderInput = useRef<HTMLInputElement>(null),
    lyricInput = useRef<HTMLInputElement>(null);
  const syncTarget = useRef<string | null>(null),
    lyricTarget = useRef<string | null>(null);
  const actions = useMemo<ImportActions>(
    () => ({
      async chooseMusicFiles() {
        if (!canImport()) return;
        try {
          const picked = await pickMusicFiles();
          if (picked === "cancelled") return;
          if (picked !== "unavailable") return await importMusic(picked);
        } catch {
          /* Fall back to the file input. */
        }
        musicInput.current?.click();
      },
      async chooseMusicFolder() {
        if (!canImport()) return;
        try {
          const directory = await pickFolder();
          if (directory === "cancelled") return;
          if (directory !== "unavailable") return await importFolder(directory);
        } catch {
          /* Fall back to the folder upload input. */
        }
        folderInput.current?.click();
      },
      chooseLyricsFor(trackId) {
        lyricTarget.current = trackId;
        lyricInput.current?.click();
      },
      async chooseSyncFolder(trackId) {
        if (useMusic.getState().importing) return;
        let directory: Awaited<ReturnType<typeof pickFolder>>;
        try {
          directory = await pickFolder();
        } catch {
          notify("无法读取文件夹，请重新选择；已有歌词未修改");
          return;
        }
        if (directory === "cancelled") return;
        if (directory === "unavailable") {
          syncTarget.current = trackId;
          syncFolderInput.current?.click();
        } else if (await syncLyricsFromFolder(trackId, directory))
          closeAllDialogs();
      },
    }),
    [],
  );
  return (
    <ImportContext value={actions}>
      <input
        ref={musicInput}
        data-testid="music-input"
        type="file"
        multiple
        accept="audio/*,.flac,.m4a,.opus,.lrc,.json"
        hidden
        onChange={(e) =>
          void importMusic(takeFiles(e).map((file) => ({ file })))
        }
      />
      <input
        ref={folderInput}
        data-testid="folder-input"
        type="file"
        multiple
        {...{ webkitdirectory: "" }}
        hidden
        onChange={(e) =>
          void importMusic(takeFiles(e).map((file) => ({ file })))
        }
      />
      <input
        ref={syncFolderInput}
        data-testid="sync-folder-input"
        type="file"
        multiple
        {...{ webkitdirectory: "" }}
        hidden
        onChange={(e) => {
          const incoming = takeFiles(e).map((file) => ({ file }));
          const target = syncTarget.current;
          syncTarget.current = null;
          if (target && incoming.length) {
            closeAllDialogs();
            void syncTrackLyrics(target, incoming);
          }
        }}
      />
      <input
        ref={lyricInput}
        data-testid="lyric-input"
        type="file"
        accept=".lrc,.txt,.json,text/plain,application/json"
        hidden
        onChange={(e) => {
          const [file] = takeFiles(e);
          if (file && lyricTarget.current)
            void replaceLyrics(lyricTarget.current, file);
        }}
      />
      {children}
    </ImportContext>
  );
}
