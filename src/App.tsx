import { useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { importMusic, initialize } from "./music/library";
import { useMusic } from "./music/store";
import { Modal } from "./ui/common";
import { DialogHost } from "./ui/dialogs/DialogHost";
import { useKeyboardShortcuts, useShownPlaylist } from "./ui/hooks";
import { ImportProvider } from "./ui/ImportProvider";
import { MobileNav, Sidebar, TopBar } from "./ui/layout/Navigation";
import { ImportStatus, Toast } from "./ui/layout/Status";
import { LibraryWelcome } from "./ui/pages/LibraryWelcome";
import { PageHeading } from "./ui/pages/PageHeading";
import { PlaylistsGrid } from "./ui/pages/PlaylistsGrid";
import { SettingsPage } from "./ui/pages/SettingsPage";
import { TrackListSection } from "./ui/pages/TrackListSection";
import { MiniPlayer } from "./ui/player/MiniPlayer";
import { Player } from "./ui/player/Player";
import { setPlayerOpen, useUi } from "./ui/state";
import "./App.css";

function App() {
  const view = useUi((s) => s.view),
    playlistId = useUi((s) => s.playlistId),
    playerOpen = useUi((s) => s.playerOpen);
  const hasTracks = useMusic((s) => s.tracks.length > 0),
    ready = useMusic((s) => s.ready);
  const shownPlaylist = useShownPlaylist();
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    void initialize();
  }, []);
  useKeyboardShortcuts();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view, playlistId]);
  const listVisible =
    (view === "library" && hasTracks) ||
    view === "favorites" ||
    !!shownPlaylist;
  return (
    <ImportProvider>
      <div
        className={`app ${dragging ? "dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node))
            setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (ready)
            void importMusic(
              Array.from(e.dataTransfer.files).map((file) => ({ file })),
            );
        }}
      >
        <Sidebar />
        <main>
          <TopBar />
          <div className="main-content">
            <PageHeading />
            {view === "library" && <LibraryWelcome />}
            {listVisible && (
              <TrackListSection key={`${view}:${playlistId ?? ""}`} />
            )}
            {view === "playlists" && !shownPlaylist && <PlaylistsGrid />}
            {view === "settings" && <SettingsPage />}
          </div>
        </main>
        <Player />
        <MiniPlayer />
        <MobileNav />
        {playerOpen && (
          <Modal title="正在播放" onClose={() => setPlayerOpen(false)}>
            <Player mobile />
          </Modal>
        )}
        <Toast />
        <ImportStatus />
        {dragging && (
          <div className="drop-overlay">
            <Upload size={44} />
            <h2>松开，让音乐进来。</h2>
          </div>
        )}
        <DialogHost />
      </div>
    </ImportProvider>
  );
}
export default App;
