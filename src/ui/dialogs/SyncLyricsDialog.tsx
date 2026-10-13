import { FolderOpen } from "lucide-react";
import { useMusic } from "../../music/store";
import { Modal } from "../common";
import { useImport } from "../importContext";
import { closeDialog } from "../state";

// Shown when a song's folder is unknown or no longer accessible.
export function SyncLyricsDialog({ trackId }: { trackId: string }) {
  const importing = useMusic((s) => s.importing);
  const { chooseSyncFolder } = useImport();
  return (
    <Modal title="同步歌词" onClose={closeDialog}>
      <p className="import-help">
        需要访问歌曲所在的文件夹，才能查找同名 LRC
        和增强歌词。选择后会自动匹配，只更新这首歌。
      </p>
      <button
        className="import-option"
        disabled={!!importing}
        onClick={() => void chooseSyncFolder(trackId)}
      >
        <FolderOpen size={25} />
        <span>
          <strong>选择歌曲所在文件夹</strong>
          <small>{importing || "自动查找歌词、中文翻译和注音"}</small>
        </span>
      </button>
      <p className="import-help">
        支持保留目录权限的浏览器会记住选择；其他浏览器每次同步需要重新选择文件夹。
      </p>
    </Modal>
  );
}
