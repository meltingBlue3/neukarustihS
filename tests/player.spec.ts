import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync, copyFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseLrc, nextTrack } from "../src/lib";

const fixtures = resolve("tests/fixtures");
mkdirSync(fixtures, { recursive: true });
function wav(name: string, seconds: number) {
  const path = resolve(fixtures, `${name}.wav`);
  const samples = seconds * 8000,
    buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF");
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24);
  buffer.writeUInt32LE(16000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    buffer.writeInt16LE(
      Math.round(Math.sin((i / 8000) * 440 * Math.PI * 2) * 800),
      44 + i * 2,
    );
  writeFileSync(path, buffer);
  return path;
}
const first = wav("Midnight Test", 20),
  second = wav("Blue Hour Test", 20);
const short = wav("Short Test", 1);
const lyric = resolve(fixtures, "Midnight Test.lrc");
writeFileSync(
  lyric,
  "[00:00.00]First line\n[00:03.00]Second line\n[00:08.00]Third line",
);

test("LRC offsets, multiple timestamps, and queue boundaries", () => {
  expect(parseLrc("[offset:-500]\n[00:01.20][00:02.30]hello")).toEqual([
    { time: 0.7, text: "hello" },
    { time: 1.7999999999999998, text: "hello" },
  ]);
  expect(parseLrc("[ar:Someone]\nnot timed")).toEqual([]);
  expect(nextTrack(["a", "b"], "b", 1, "off")).toBeNull();
  expect(nextTrack(["a", "b"], "b", 1, "all")).toBe("a");
  expect(nextTrack([], null, 1, "all")).toBeNull();
});

test("mobile import, playback, seek, favorite, lyrics, playlist, persistence and reconnect", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "导入音乐", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: "test-results/mobile-empty.png",
    fullPage: true,
  });
  await page.getByTestId("music-input").setInputFiles([first, second, lyric]);
  await expect(page.locator(".track-row")).toHaveCount(2);
  await expect(page.locator(".toast")).toContainText("已导入 2 首");
  await page
    .getByRole("main")
    .getByRole("button", {
      name: "Midnight Test 封面 Midnight Test 未知艺术家",
      exact: true,
    })
    .click();
  await expect(
    page
      .locator(".mini-player")
      .getByRole("button", { name: "暂停", exact: true }),
  ).toBeVisible();
  await page.locator(".mini-song").click();
  const player = page.locator(".mobile-player");
  await expect(
    player.getByRole("slider", { name: "播放进度" }),
  ).toHaveAttribute("max", "20");
  await player.getByRole("button", { name: "收藏歌曲", exact: true }).click();
  await player.getByRole("button", { name: "歌词", exact: true }).click();
  await expect(
    player.getByRole("button", { name: "First line", exact: true }),
  ).toBeVisible();
  await player.getByRole("button", { name: "Third line", exact: true }).click();
  await expect(player.locator(".lyric.active")).toHaveText("Third line");
  await player.getByRole("button", { name: "暂停", exact: true }).click();
  await player.getByRole("button", { name: "封面", exact: true }).click();
  await page.screenshot({
    path: "test-results/mobile-player.png",
    fullPage: true,
  });
  await player.getByRole("button", { name: "收起播放器" }).click();
  await page
    .getByRole("button", { name: "Midnight Test 更多操作", exact: true })
    .click();
  await page.getByRole("button", { name: "新建歌单并加入" }).click();
  await page
    .getByRole("textbox", { name: "给这段心情起个名字" })
    .fill("Late Night");
  await page.getByRole("button", { name: "保存歌单" }).click();
  await expect(
    page.getByRole("heading", { name: "Late Night", level: 1 }),
  ).toBeVisible();
  await expect(page.locator(".track-row")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".track-row")).toHaveCount(2);
  await page
    .getByRole("navigation", { name: "手机导航" })
    .getByRole("button", { name: "我喜欢" })
    .click();
  await expect(page.locator(".track-row")).toHaveCount(1);
  await page
    .getByRole("main")
    .getByRole("button", {
      name: "Midnight Test 封面 Midnight Test 未知艺术家",
      exact: true,
    })
    .click();
  await expect(page.locator(".toast")).toContainText("需要重新连接文件");
  await page.getByTestId("music-input").setInputFiles([first, second]);
  await expect(page.locator(".toast")).toContainText("已连接 2 首");
  await page
    .getByRole("main")
    .getByRole("button", {
      name: "Midnight Test 封面 Midnight Test 未知艺术家",
      exact: true,
    })
    .click();
  await expect(
    page
      .locator(".mini-player")
      .getByRole("button", { name: "暂停", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("desktop search, sort, queue, deletion and responsive layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "导入音乐", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: "test-results/desktop-empty.png",
    fullPage: true,
  });
  await page.getByTestId("music-input").setInputFiles([first, second]);
  await expect(page.locator(".track-row")).toHaveCount(2);
  await page.getByRole("textbox", { name: "搜索音乐" }).fill("midnight");
  await expect(page.locator(".track-row")).toHaveCount(1);
  await page.getByRole("button", { name: "清除搜索" }).click();
  await page.getByRole("combobox", { name: "歌曲排序" }).selectOption("title");
  await expect(page.locator(".track-row").first()).toContainText(
    "Blue Hour Test",
  );
  await page.getByRole("button", { name: "播放全部", exact: true }).click();
  await expect(
    page
      .locator(".desktop-player")
      .getByRole("button", { name: "暂停", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "播放队列", exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.locator(".queue-row")).toHaveCount(2);
  await page.getByRole("button", { name: "Blue Hour Test 下移" }).click();
  await expect(page.locator(".queue-row").first()).toContainText(
    "Midnight Test",
  );
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "Blue Hour Test 更多操作" }).click();
  await page.getByRole("button", { name: "从音乐库移除" }).click();
  await page.getByRole("button", { name: "确认移除" }).click();
  await expect(page.locator(".track-row")).toHaveCount(1);
  await page.screenshot({
    path: "test-results/desktop-loaded.png",
    fullPage: true,
  });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test("track end advances and sequential mode stops", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "导入音乐", exact: true }),
  ).toBeEnabled();
  await page.getByTestId("music-input").setInputFiles([first, short]);
  await expect(page.locator(".track-row")).toHaveCount(2);
  await page
    .getByRole("button", {
      name: "Short Test 封面 Short Test 未知艺术家",
      exact: true,
    })
    .click();
  await expect(page.locator(".desktop-player h2")).toHaveText("Midnight Test", {
    timeout: 5000,
  });
  await page.getByRole("button", { name: "循环模式：列表循环" }).click();
  await page.getByRole("button", { name: "循环模式：单曲循环" }).click();
  await page.getByRole("slider", { name: "播放进度" }).fill("19.7");
  await expect(
    page
      .locator(".desktop-player")
      .getByRole("button", { name: "播放", exact: true }),
  ).toBeVisible({ timeout: 5000 });
  await expect(page.locator(".desktop-player h2")).toHaveText("Midnight Test");
});

test("PWA manifest, offline reload and offline import", async ({
  page,
  context,
}) => {
  await page.goto("./");
  const manifest = await (
    await page.request.get("manifest.webmanifest")
  ).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/neukarustihS/");
  expect(manifest.icons).toHaveLength(3);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("音乐库");
  await page.getByTestId("music-input").setInputFiles(first);
  await expect(page.locator(".track-row")).toHaveCount(1);
  await page
    .getByRole("main")
    .getByRole("button", {
      name: "Midnight Test 封面 Midnight Test 未知艺术家",
      exact: true,
    })
    .click();
  await expect(
    page
      .locator(".mini-player")
      .getByRole("button", { name: "暂停", exact: true }),
  ).toBeVisible();
});

test("folder fallback imports nested albums, scopes lyrics, deduplicates and reconnects", async ({
  page,
}) => {
  const folder = resolve(fixtures, "Folder collection");
  const albumA = resolve(folder, "Album A");
  const albumB = resolve(folder, "Album B", "Disc 1");
  mkdirSync(albumA, { recursive: true });
  mkdirSync(albumB, { recursive: true });
  copyFileSync(first, resolve(albumA, "Same title.wav"));
  copyFileSync(short, resolve(albumB, "Same title.wav"));
  writeFileSync(resolve(albumA, "Same title.lrc"), "[00:00.00]Album A lyrics");
  writeFileSync(resolve(albumB, "Same title.lrc"), "[00:00.00]Album B lyrics");
  writeFileSync(resolve(folder, "notes.txt"), "Ignore this file");
  await page.addInitScript(() =>
    Object.defineProperty(window, "showDirectoryPicker", {
      value: undefined,
      configurable: true,
    }),
  );
  await page.goto("./");
  await page.getByRole("button", { name: "导入音乐", exact: true }).click();
  const chooserPromise = page.waitForEvent("filechooser");
  await page
    .getByRole("dialog", { name: "导入音乐" })
    .getByRole("button", { name: /^导入文件夹/ })
    .click();
  await (await chooserPromise).setFiles(folder);
  await expect(page.locator(".track-row")).toHaveCount(2);
  await expect(page.locator(".toast")).toContainText("已匹配 2 份歌词");
  const longTrack = page
    .locator(".track-row")
    .filter({ has: page.locator(".track-duration", { hasText: "0:20" }) });
  await longTrack.locator(".track-main").click();
  await page.locator(".mini-song").click();
  await page
    .locator(".mobile-player")
    .getByRole("button", { name: "歌词", exact: true })
    .click();
  await expect(page.locator(".mobile-player .lyric")).toHaveText(
    "Album A lyrics",
  );
  await page
    .locator(".mobile-player")
    .getByRole("button", { name: "收起播放器" })
    .click();
  await page.getByTestId("folder-input").setInputFiles(folder);
  await expect(page.locator(".toast")).toContainText("已连接 2 首");
  await expect(page.locator(".track-row")).toHaveCount(2);
  await page.getByTestId("music-input").setInputFiles(second);
  await expect(page.locator(".track-row")).toHaveCount(3);
  await page.reload();
  await expect(page.locator(".track-row")).toHaveCount(3);
  await page.getByTestId("folder-input").setInputFiles(folder);
  await expect(page.locator(".toast")).toContainText("已连接 2 首");
  await expect(page.locator(".track-row")).toHaveCount(3);
  await page
    .locator(".track-row")
    .filter({ has: page.locator(".track-duration", { hasText: "0:01" }) })
    .locator(".track-main")
    .click();
  await page
    .locator(".mini-player")
    .getByRole("button", { name: "暂停", exact: true })
    .click();
  await page.locator(".mini-song").click();
  await page
    .locator(".mobile-player")
    .getByRole("button", { name: "歌词", exact: true })
    .click();
  await expect(page.locator(".mobile-player .lyric")).toHaveText(
    "Album B lyrics",
  );
});

test("directory picker reads nested file handles and repeated folders", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "导入音乐", exact: true }),
  ).toBeEnabled();
  await page.evaluate(async (base64) => {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle("Native folder", {
      create: true,
    });
    const nested = await directory.getDirectoryHandle("Nested album", {
      create: true,
    });
    const song = await nested.getFileHandle("Handle song.wav", {
      create: true,
    });
    const output = await song.createWritable();
    await output.write(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
    await output.close();
    const lrc = await nested.getFileHandle("Handle song.lrc", { create: true });
    const text = await lrc.createWritable();
    await text.write("[00:00.00]Native folder lyrics");
    await text.close();
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: async () => directory,
    });
  }, readFileSync(first).toString("base64"));
  await page.getByRole("button", { name: "导入文件夹", exact: true }).click();
  await expect(page.locator(".track-row")).toHaveCount(1);
  await expect(page.locator(".toast")).toContainText("已匹配 1 份歌词");
  await page.getByRole("button", { name: "添加文件夹", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("已连接 1 首");
  await expect(page.locator(".track-row")).toHaveCount(1);
});
