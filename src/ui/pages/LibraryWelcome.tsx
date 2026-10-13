import { useMusic } from "../../music/store";
import { Cover } from "../common";

export function LibraryWelcome() {
  const count = useMusic((s) => s.tracks.length);
  return (
    <section className={`welcome ${count ? "compact" : ""}`}>
      <div className="welcome-copy">
        <span className="eyebrow">YOUR MUSIC. YOUR MIDNIGHT.</span>
        <h2>
          把夜晚，
          <br />
          调成你的频率。
        </h2>
        <p>
          {count ? (
            `${count} 首私藏，今夜慢慢听。`
          ) : (
            <>
              点击右上角「导入音乐」，
              <br />
              选择你的音乐文件夹或歌曲。
            </>
          )}
        </p>
        {!count && <p className="welcome-formats">MP3 · FLAC · M4A · WAV</p>}
      </div>
      <div className="welcome-art">
        <Cover />
        <span className="vertical-note">夜は、まだこれから。</span>
      </div>
      <span className="welcome-index">N° 001 / YOUR COLLECTION</span>
    </section>
  );
}
