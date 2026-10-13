import { useState } from "react";
import {
  Download,
  FolderOpen,
  Headphones,
  RefreshCw,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { pause, setSleep } from "../../music/playback";
import { useMusic } from "../../music/store";
import { notify } from "../../notice";
import { checkForAppUpdate, installApp, updateApp, usePwa } from "../../pwa";
import { openDialog } from "../state";

const updateMessages = {
  latest: "已是最新版本",
  offline: "当前离线，联网后即可检查更新。",
  unavailable: "更新服务尚未就绪，请稍后重试。",
  available: "发现新版本",
};

function UpdateSection() {
  const installed = usePwa((s) => s.installed),
    updateReady = usePwa((s) => s.updateReady);
  const [checking, setChecking] = useState(false),
    [updating, setUpdating] = useState(false),
    [status, setStatus] = useState("");
  return (
    <section>
      <h2>
        <RefreshCw size={20} />
        版本与更新
      </h2>
      <p>
        当前版本 <strong>v{__APP_VERSION__}</strong>
        {installed ? " · 已安装到主屏幕" : ""}
      </p>
      {updateReady ? (
        <>
          <p>新版本已就绪，更新时会短暂中断播放。</p>
          <button
            className="primary"
            disabled={updating}
            onClick={async () => {
              setUpdating(true);
              pause();
              try {
                await updateApp();
              } catch {
                setUpdating(false);
                setStatus("更新失败，请稍后重试。");
              }
            }}
          >
            {updating ? "正在更新…" : "更新并重新打开"}
          </button>
        </>
      ) : (
        <button
          className="secondary"
          disabled={checking}
          onClick={async () => {
            setChecking(true);
            setStatus("");
            try {
              setStatus(updateMessages[await checkForAppUpdate()]);
            } catch {
              setStatus("暂时无法检查更新，请稍后重试。");
            } finally {
              setChecking(false);
            }
          }}
        >
          <RefreshCw size={16} className={checking ? "spin" : ""} />
          {checking ? "正在检查…" : "检查更新"}
        </button>
      )}
      {status && (
        <p className="update-status" role="status">
          {status}
        </p>
      )}
    </section>
  );
}

export function SettingsPage() {
  const installed = usePwa((s) => s.installed);
  const sleepUntil = useMusic((s) => s.sleepUntil),
    busy = useMusic((s) => !!s.importing || !s.ready);
  return (
    <div className="settings-list">
      {!installed && (
        <section>
          <h2>
            <Download size={20} />
            放在主屏幕
          </h2>
          <p>像 App 一样打开，留一盏灯给你的音乐。</p>
          <button className="primary" onClick={() => void installApp()}>
            <Download size={17} />
            安装 neukarustihS
          </button>
        </section>
      )}
      <UpdateSection />
      <section>
        <h2>
          <Timer size={20} />
          睡眠定时
        </h2>
        <p>
          {sleepUntil
            ? `将在 ${new Date(sleepUntil).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 暂停播放`
            : "给深夜的聆听，留一个温柔的句号。"}
        </p>
        <div className="timer-options">
          {[0, 15, 30, 60].map((n) => (
            <button
              className={!n && !sleepUntil ? "secondary active" : "secondary"}
              key={n}
              onClick={() => {
                setSleep(n);
                notify(n ? `${n} 分钟后暂停播放` : "已关闭睡眠定时");
              }}
            >
              {n ? `${n} 分钟` : "关闭"}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2>
          <ShieldCheck size={20} />
          本地音乐，轻量保存
        </h2>
        <p>
          音乐直接从你选择的文件播放，不上传，也不复制整首音频。歌单、收藏、封面和歌词保存在当前浏览器。
        </p>
        <p>
          重新打开后若无法播放，请再次选择原文件或文件夹来连接。清理浏览器网站数据会移除保存的音乐库信息。
        </p>
        <button
          className="secondary"
          onClick={() => openDialog({ kind: "import" })}
          disabled={busy}
        >
          <FolderOpen size={17} />
          重新连接音乐
        </button>
      </section>
      <section>
        <h2>
          <Headphones size={20} />
          一些小默契
        </h2>
        <p>空格：播放 / 暂停　← / →：后退 / 前进 5 秒</p>
        <p>
          支持系统媒体控制。音频格式、后台播放与锁屏控制取决于设备和浏览器。
        </p>
        <div className="about-brand">
          neukarustihS <span>AFTER HOURS</span>
        </div>
      </section>
    </div>
  );
}
