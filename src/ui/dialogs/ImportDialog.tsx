import { FolderOpen, Music2 } from "lucide-react";
import { useMusic } from "../../music/store";
import { Modal } from "../common";
import { useImport } from "../importContext";
import { closeDialog } from "../state";

export function ImportDialog() {
  const busy = useMusic((s) => !!s.importing || !s.ready);
  const { chooseMusicFolder, chooseMusicFiles } = useImport();
  return (
    <Modal title="导入音乐" onClose={closeDialog}>
      <div className="import-options">
        <button
          className="import-option recommended"
          onClick={() => {
            closeDialog();
            void chooseMusicFolder();
          }}
          disabled={busy}
        >
          <FolderOpen size={27} />
          <span>
            <strong>导入文件夹</strong>
            <small>包含子文件夹里的音乐和同名歌词</small>
          </span>
        </button>
        <button
          className="import-option"
          onClick={() => {
            closeDialog();
            void chooseMusicFiles();
          }}
          disabled={busy}
        >
          <Music2 size={25} />
          <span>
            <strong>选择音乐文件</strong>
            <small>多选歌曲、同名 LRC 和翻译注音文件</small>
          </span>
        </button>
      </div>
      <p className="import-help">
        音乐在几个文件夹里？可以逐个添加，已导入的歌曲不会重复出现。重新选择原文件夹也能连接已有音乐。
      </p>
      <p className="import-help">
        「夜曲.mp3」「夜曲.lrc」和「夜曲.lyrics.json」可一起导入，自动匹配歌词、中文翻译与注音。也可以之后补充导入。
      </p>
    </Modal>
  );
}
