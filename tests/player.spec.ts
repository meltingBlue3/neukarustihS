import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { writeFileSync, mkdirSync, copyFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { PERMISSION_TIMEOUT_MS } from "../src/music/files";

// Grant real local directory access through a browser drop, as a user would.
// This exercises OS-backed permissions and IndexedDB restoration, unlike OPFS
// test handles. The dropped folder also becomes the directory picker's choice.
async function grantFolderAccess(page: Page, folder: string) {
  type GrantWindow = Window & { folderGrants?: number };
  const grants = await page.evaluate(() => {
    document.addEventListener(
      "drop",
      async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const item = event.dataTransfer!.items[0] as DataTransferItem & {
          getAsFileSystemHandle: () => Promise<FileSystemDirectoryHandle>;
        };
        const directory = await item.getAsFileSystemHandle();
        Object.defineProperty(window, "showDirectoryPicker", {
          configurable: true,
          value: async () => directory,
        });
        const target = window as GrantWindow;
        target.folderGrants = (target.folderGrants ?? 0) + 1;
      },
      { capture: true, once: true },
    );
    return (window as GrantWindow).folderGrants ?? 0;
  });
  const cdp = await page.context().newCDPSession(page);
  const data = { items: [], files: [folder], dragOperationsMask: 1 };
  for (const type of ["dragEnter", "drop"] as const)
    await cdp.send("Input.dispatchDragEvent", { type, x: 180, y: 200, data });
  await page.waitForFunction(
    (before) => ((window as GrantWindow).folderGrants ?? 0) > before,
    grants,
  );
  await cdp.detach();
}

function enhancedLine(text: string, translation: string) {
  return JSON.stringify({
    format: "neukarustihs-lyrics",
    version: 1,
    lines: [{ timeMs: 0, text, translation, segments: [{ text }] }],
  });
}

const fixtures = resolve(`tests/fixtures/worker-${process.pid}`);
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

test("enhanced lyrics import together, seek, preserve settings offline and reject bad replacements", async ({
  page,
  context,
}) => {
  const enhanced = resolve(fixtures, "Midnight Test.lyrics.json");
  writeFileSync(
    enhanced,
    JSON.stringify({
      format: "neukarustihs-lyrics",
      version: 1,
      lines: [
        {
          timeMs: 0,
          text: "夜の歌",
          translation: "夜晚的歌",
          segments: [
            { text: "夜", reading: "よる" },
            { text: "の" },
            { text: "歌", reading: "うた" },
          ],
        },
        {
          timeMs: 3000,
          text: "また明日",
          translation: "明天再见",
          segments: [{ text: "また" }, { text: "明日", reading: "あした" }],
        },
        { timeMs: 8000, text: "", translation: "", segments: [] },
      ],
    }),
  );
  await page.goto("./");
  await page.getByTestId("music-input").setInputFiles([enhanced, lyric, first]);
  await expect(page.locator(".toast")).toContainText("已匹配 1 份翻译与注音");
  await page.locator(".track-main").click();
  await page.locator(".mini-song").click();
  const player = page.locator(".mobile-player");
  await player.getByRole("button", { name: "暂停", exact: true }).click();
  const controls = await player.locator(".play-controls").boundingBox();
  await player.getByRole("button", { name: "歌词", exact: true }).click();
  await expect(player.locator("ruby rt")).toHaveText([
    "よる",
    "うた",
    "あした",
  ]);
  await expect(player.locator(".lyric-translation")).toHaveText([
    "夜晚的歌",
    "明天再见",
  ]);
  await expect(player.locator(".lyric").last()).toHaveText("♪");
  await player.locator(".lyric").nth(1).click();
  await expect(player.getByRole("slider", { name: "播放进度" })).toHaveValue(
    "3",
  );
  await player.getByRole("button", { name: "振り仮名", exact: true }).click();
  await player.getByRole("button", { name: "中文翻译", exact: true }).click();
  await expect(player.locator("ruby")).toHaveCount(0);
  await expect(player.locator(".lyric-translation")).toHaveCount(0);
  expect(await player.locator(".play-controls").boundingBox()).toEqual(
    controls,
  );
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".track-row")).toHaveCount(1);
  await page.locator(".mini-song").click();
  await player.getByRole("button", { name: "歌词", exact: true }).click();
  await expect(
    player.getByRole("button", { name: "中文翻译", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    player.getByRole("button", { name: "振り仮名", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await player.getByRole("button", { name: "中文翻译", exact: true }).click();
  await expect(player.locator(".lyric-translation").first()).toHaveText(
    "夜晚的歌",
  );
  // Use the actual replacement action to set its target.
  const chooserPromise = page.waitForEvent("filechooser");
  await player.getByRole("button", { name: "更换歌词" }).click();
  await (
    await chooserPromise
  ).setFiles({
    name: "broken.lyrics.json",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  await expect(page.locator(".modal-notice")).toContainText("格式不正确");
  await expect(player.locator(".lyric-translation").first()).toHaveText(
    "夜晚的歌",
  );
  await page.getByTestId("lyric-input").setInputFiles(lyric);
  // Re-importing the same LRC preserves an existing enhancement.
  await expect(player.locator(".lyric-translation").first()).toHaveText(
    "夜晚的歌",
  );
  await page.getByTestId("lyric-input").setInputFiles({
    name: "new.lrc",
    mimeType: "text/plain",
    buffer: Buffer.from("[00:00.00]Replacement lyric"),
  });
  await expect(player.locator(".lyric")).toHaveText("Replacement lyric");
  await expect(player.locator(".lyrics-options")).toHaveCount(0);
  // A sidecar can be added later, without re-importing the song or LRC.
  await page.getByTestId("music-input").setInputFiles(enhanced);
  await expect(player.locator(".lyric-translation").first()).toHaveText(
    "夜晚的歌",
  );
});

test("mobile cover and lyrics keep controls fixed and support horizontal touch swipes", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4173/neukarustihS/");
  await page.getByTestId("music-input").setInputFiles(first);
  await expect(page.locator(".track-row")).toHaveCount(1);
  await page.getByTestId("music-input").setInputFiles({
    name: "Midnight Test.lrc",
    mimeType: "text/plain",
    buffer: Buffer.from(
      Array.from(
        { length: 20 },
        (_, i) => `[00:${String(i).padStart(2, "0")}.00]Lyric line ${i}`,
      ).join("\n"),
    ),
  });
  await page.locator(".track-main").first().click();
  await page.locator(".mini-song").click();
  const player = page.locator(".mobile-player");
  await player.getByRole("button", { name: "暂停", exact: true }).click();
  const controls = () => player.locator(".play-controls").boundingBox();
  const original = await controls();
  const touch = await context.newCDPSession(page);
  const swipe = async (x: number, y: number, dx: number, dy: number) => {
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (let step = 1; step <= 8; step++) {
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + (dx * step) / 8, y: y + (dy * step) / 8 }],
      });
      await page.waitForTimeout(20);
    }
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.waitForTimeout(450);
  };
  await swipe(280, 280, -170, 5);
  await expect(player.locator(".lyrics-scroll")).toBeVisible();
  expect(await controls()).toEqual(original);
  const beforeSeek = await player
    .getByRole("slider", { name: "播放进度" })
    .inputValue();
  const beforeScroll = await player
    .locator(".lyrics-scroll")
    .evaluate((el) => el.scrollTop);
  await swipe(190, 380, 5, -160);
  await expect(player.locator(".lyrics-scroll")).toBeVisible();
  expect(
    await player.locator(".lyrics-scroll").evaluate((el) => el.scrollTop),
  ).toBeGreaterThan(beforeScroll);
  // A horizontal swipe at the last tab must not activate a lyric beneath it.
  await swipe(280, 280, -170, 5);
  expect(
    await player.getByRole("slider", { name: "播放进度" }).inputValue(),
  ).toBe(beforeSeek);
  await swipe(90, 280, 180, 5);
  await expect(player.locator(".sleeve")).toBeVisible();
  expect(await controls()).toEqual(original);
  await player.getByRole("button", { name: "歌词", exact: true }).click();
  expect(await controls()).toEqual(original);
  await player
    .getByRole("button", { name: "Lyric line 3", exact: true })
    .click();
  await expect(player.getByRole("slider", { name: "播放进度" })).toHaveValue(
    "3",
  );
  for (const viewport of [
    { width: 320, height: 640 },
    { width: 412, height: 820 },
  ]) {
    await page.setViewportSize(viewport);
    const lyrics = await controls();
    await player.getByRole("button", { name: "封面", exact: true }).click();
    expect(await controls()).toEqual(lyrics);
    expect(lyrics!.y + lyrics!.height).toBeLessThan(viewport.height);
    await player.getByRole("button", { name: "歌词", exact: true }).click();
  }
  await context.close();
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
  await expect(page.locator(".welcome")).toBeVisible();
  await expect(page.locator(".welcome")).toContainText("2 首私藏");
  await expect(page.locator(".welcome button")).toHaveCount(0);
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

test("unified modes control list wrap, single repeat and random track completion", async ({
  page,
}) => {
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
  await page.getByRole("slider", { name: "播放进度" }).fill("19.7");
  await expect(page.locator(".desktop-player h2")).toHaveText("Short Test");
  await expect(page.locator(".desktop-player h2")).toHaveText("Midnight Test");
  await page
    .getByRole("button", { name: "播放模式：列表循环", exact: true })
    .click();
  await page.getByRole("slider", { name: "播放进度" }).fill("19.7");
  await expect
    .poll(async () =>
      Number(await page.getByRole("slider", { name: "播放进度" }).inputValue()),
    )
    .toBeLessThan(3);
  await expect(
    page
      .locator(".desktop-player")
      .getByRole("button", { name: "暂停", exact: true }),
  ).toBeVisible({ timeout: 5000 });
  await expect(page.locator(".desktop-player h2")).toHaveText("Midnight Test");
  await page
    .getByRole("button", { name: "播放模式：单曲循环", exact: true })
    .click();
  await page.getByRole("slider", { name: "播放进度" }).fill("19.7");
  await expect(page.locator(".desktop-player h2")).toHaveText("Short Test");
  await expect(
    page.getByRole("button", { name: "播放模式：随机播放", exact: true }),
  ).toBeVisible();
});

type HandoffWindow = Window &
  typeof globalThis & {
    decks: Set<HTMLMediaElement>;
    handoffs: { event: string; others: number; volume: number }[];
  };

test("songs hand over between two players so the media session never runs empty", async ({
  page,
}) => {
  // Playback can stall for seconds when the whole suite runs in parallel.
  test.setTimeout(70000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Record each player the app starts and, whenever one starts or ends,
  // how many others were still playing at that moment.
  await page.addInitScript(() => {
    const decks = new Set<HTMLMediaElement>();
    const handoffs: HandoffWindow["handoffs"] = [];
    Object.assign(window, { decks, handoffs });
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!decks.has(this)) {
        decks.add(this);
        for (const event of ["playing", "ended"])
          this.addEventListener(event, () =>
            handoffs.push({
              event,
              others: [...decks].filter((d) => d !== this && !d.paused).length,
              volume: this.volume,
            }),
          );
      }
      return play.call(this);
    };
  });
  const decks = () =>
    page.evaluate(() =>
      [...(window as HandoffWindow).decks].map((d) => ({
        paused: d.paused,
        volume: d.volume,
      })),
    );
  const handoffs = () =>
    page.evaluate(() => (window as HandoffWindow).handoffs);
  const playingDecks = async () => (await decks()).filter((d) => !d.paused);
  // Wait in short steps so a brief two-player moment is not missed.
  const quickly = { intervals: [100], timeout: 20000 };
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "导入音乐", exact: true }),
  ).toBeEnabled();
  await page.getByTestId("music-input").setInputFiles([first, second]);
  await expect(page.locator(".track-row")).toHaveCount(2);
  await page
    .getByRole("button", {
      name: "Midnight Test 封面 Midnight Test 未知艺术家",
      exact: true,
    })
    .click();
  const title = page.locator(".desktop-player h2");
  const progress = page.getByRole("slider", { name: "播放进度" });
  const desktop = page.locator(".desktop-player");
  await expect(
    desktop.getByRole("button", { name: "暂停", exact: true }),
  ).toBeVisible();

  // Near the end the next song starts inaudibly while the current one plays,
  // then takes over from its beginning when the current one ends.
  await progress.fill("16.5");
  await expect(title).toHaveText("Blue Hour Test", { timeout: 20000 });
  await expect
    .poll(async () => Number(await progress.inputValue()), quickly)
    .toBeLessThan(1);
  const log = await handoffs();
  const ended = log.findIndex((h) => h.event === "ended");
  expect(log[ended].others).toBe(1);
  expect(
    log
      .slice(0, ended)
      .some((h) => h.event === "playing" && h.others === 1 && h.volume < 0.01),
  ).toBe(true);
  await expect(
    desktop.getByRole("button", { name: "暂停", exact: true }),
  ).toBeVisible();
  expect(await playingDecks()).toEqual([{ paused: false, volume: 1 }]);

  // A manual skip starts the new song before the old one stops.
  const before = log.length;
  await page.getByRole("button", { name: "下一首", exact: true }).click();
  await expect(title).toHaveText("Midnight Test");
  await expect
    .poll(
      async () =>
        (await handoffs())
          .slice(before)
          .some(
            (h) => h.event === "playing" && h.others === 1 && h.volume === 1,
          ),
      quickly,
    )
    .toBe(true);
  await expect
    .poll(playingDecks, quickly)
    .toEqual([{ paused: false, volume: 1 }]);

  // Pausing during the early start stops both players and the switch.
  await progress.fill("18.5");
  await expect.poll(async () => (await playingDecks()).length, quickly).toBe(2);
  await desktop.getByRole("button", { name: "暂停", exact: true }).click();
  await expect.poll(playingDecks, quickly).toEqual([]);
  await page.waitForTimeout(2500);
  await expect(title).toHaveText("Midnight Test");
  expect(await playingDecks()).toEqual([]);
  await desktop.getByRole("button", { name: "播放", exact: true }).click();
  await expect(title).toHaveText("Blue Hour Test", { timeout: 20000 });
  expect(
    (await handoffs()).filter((h) => h.event === "ended").at(-1)?.others,
  ).toBe(1);
  expect(errors).toEqual([]);
});

test("one mode button defaults to list loop and preserves each choice across app reopen", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "导入音乐", exact: true }),
  ).toBeEnabled();
  await page.getByTestId("music-input").setInputFiles([first, second]);
  await expect(page.locator(".track-row")).toHaveCount(2);
  await page.getByRole("button", { name: "播放全部", exact: true }).click();
  await page.locator(".mini-song").click();
  const player = page.locator(".mobile-player");
  await expect(player.getByRole("button", { name: /^播放模式：/ })).toHaveCount(
    1,
  );
  await expect(
    player.getByRole("button", { name: "播放模式：列表循环", exact: true }),
  ).toBeVisible();
  for (const [previous, next, value] of [
    ["列表循环", "单曲循环", "one"],
    ["单曲循环", "随机播放", "shuffle"],
    ["随机播放", "列表循环", "all"],
  ]) {
    await player
      .getByRole("button", { name: `播放模式：${previous}`, exact: true })
      .click();
    await expect(
      player.getByRole("button", { name: `播放模式：${next}`, exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("neukarustihs-preferences-v1")!)
              .state.playbackMode,
        ),
      )
      .toBe(value);
    await page.reload();
    await page.locator(".mini-song").click();
    await expect(
      player.getByRole("button", { name: `播放模式：${next}`, exact: true }),
    ).toBeVisible();
    const reopened = await context.newPage();
    await reopened.setViewportSize({ width: 1440, height: 900 });
    await reopened.goto("./");
    await expect(
      reopened.getByRole("button", { name: `播放模式：${next}`, exact: true }),
    ).toBeVisible();
    await reopened.close();
  }
  await player
    .getByRole("button", { name: "播放模式：列表循环", exact: true })
    .click();
  await player
    .getByRole("button", { name: "播放模式：单曲循环", exact: true })
    .click();
  await player.getByRole("button", { name: "收起播放器" }).click();
  await page.close();
  const reopened = await context.newPage();
  await reopened.setViewportSize({ width: 1440, height: 900 });
  await reopened.goto("./");
  await expect(
    reopened.getByRole("button", { name: "播放模式：随机播放", exact: true }),
  ).toBeVisible();
  await reopened.getByTestId("music-input").setInputFiles([first, second]);
  await expect(reopened.locator(".toast")).toContainText("已连接 2 首");
  await reopened.getByRole("button", { name: "播放全部", exact: true }).click();
  await reopened.getByRole("button", { name: "下一首", exact: true }).click();
  await reopened.getByRole("button", { name: "暂停", exact: true }).click();
  await expect(
    reopened.getByRole("button", { name: "播放模式：随机播放", exact: true }),
  ).toBeVisible();
  await reopened.close();
});

for (const [repeat, shuffle, label] of [
  ["all", false, "列表循环"],
  ["one", false, "单曲循环"],
  ["all", true, "随机播放"],
  ["off", false, "列表循环"],
] as const) {
  test(`legacy ${repeat}/${shuffle} preferences migrate to ${label} without losing library preferences`, async ({
    page,
  }) => {
    await page.addInitScript(
      ({ repeat, shuffle }) =>
        localStorage.setItem(
          "neukarustihs-preferences-v1",
          JSON.stringify({
            version: 0,
            state: {
              repeat,
              shuffle,
              favorites: ["saved-track"],
              playlists: [
                {
                  id: "saved-playlist",
                  name: "Saved Mix",
                  tracks: ["saved-track"],
                },
              ],
              volume: 0.42,
            },
          }),
        ),
      { repeat, shuffle },
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("./");
    await expect(
      page.getByRole("button", { name: `播放模式：${label}`, exact: true }),
    ).toBeVisible();
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("neukarustihs-preferences-v1")!),
    );
    expect(saved.version).toBe(1);
    expect(saved.state.favorites).toEqual(["saved-track"]);
    expect(saved.state.playlists[0].name).toBe("Saved Mix");
    // The in-app volume is gone; the device controls volume now.
    expect(saved.state).not.toHaveProperty("volume");
    expect(saved.state).not.toHaveProperty("repeat");
    expect(saved.state).not.toHaveProperty("shuffle");
  });
}

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
  // Sidecar names match case-insensitively, as on most music file systems.
  writeFileSync(resolve(albumA, "same TITLE.lrc"), "[00:00.00]Album A lyrics");
  writeFileSync(resolve(albumB, "Same title.lrc"), "[00:00.00]Album B lyrics");
  writeFileSync(
    resolve(albumA, "Same title.lyrics.json"),
    enhancedLine("Album A lyrics", "专辑甲"),
  );
  writeFileSync(
    resolve(albumB, "Same title.lyrics.json"),
    enhancedLine("Album B lyrics", "专辑乙"),
  );
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
  await expect(page.locator(".mobile-player .lyric-original")).toHaveText(
    "Album A lyrics",
  );
  await expect(page.locator(".mobile-player .lyric-translation")).toHaveText(
    "专辑甲",
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
  await expect(page.locator(".mobile-player .lyric-original")).toHaveText(
    "Album B lyrics",
  );
  await expect(page.locator(".mobile-player .lyric-translation")).toHaveText(
    "专辑乙",
  );
  await page.getByTestId("music-input").setInputFiles({
    name: "Same title.lyrics.json",
    mimeType: "application/json",
    buffer: Buffer.from(enhancedLine("Wrong album", "不要覆盖")),
  });
  await expect(page.locator(".modal-notice")).toContainText(
    "未找到唯一同名歌曲",
  );
  await expect(page.locator(".mobile-player .lyric-translation")).toHaveText(
    "专辑乙",
  );
});

test("directory picker saves real directory access and syncs updated lyrics after reopening", async ({
  page,
}) => {
  const folder = resolve(fixtures, "Native folder"),
    nested = resolve(folder, "Nested album");
  mkdirSync(nested, { recursive: true });
  copyFileSync(first, resolve(nested, "Handle song.wav"));
  const lrc = resolve(nested, "Handle song.lrc"),
    enhanced = resolve(nested, "Handle song.lyrics.json");
  writeFileSync(lrc, "[00:00.00]Native folder lyrics");
  writeFileSync(enhanced, enhancedLine("Native folder lyrics", "文件夹译文"));
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "导入音乐", exact: true }),
  ).toBeEnabled();
  await grantFolderAccess(page, folder);
  await page.getByRole("button", { name: "导入音乐", exact: true }).click();
  await page
    .getByRole("dialog", { name: "导入音乐" })
    .getByRole("button", { name: /^导入文件夹/ })
    .click();
  await expect(page.locator(".track-row")).toHaveCount(1);
  await expect(page.locator(".toast")).toContainText("已匹配 1 份翻译与注音");
  await page.getByRole("button", { name: "导入音乐", exact: true }).click();
  await page
    .getByRole("dialog", { name: "导入音乐" })
    .getByRole("button", { name: /^导入文件夹/ })
    .click();
  await expect(page.locator(".toast")).toContainText("已连接 1 首");
  writeFileSync(lrc, "[00:00.00]Updated native lyrics");
  writeFileSync(
    enhanced,
    enhancedLine("Updated native lyrics", "同步后的译文"),
  );
  // Chrome keeps folder access across reloads but drops it once no tab of the
  // app is open, so reopen the app as on a later visit. The restored handle
  // comes back as "prompt".
  const reopened = await page.context().newPage();
  await page.close();
  page = reopened;
  await page.goto("./");
  // Chrome's own prompt would block the page until answered, which a test
  // cannot do, so stand in for a prompt nobody answers: it never settles. The
  // app must stop waiting and ask for the folder.
  await page.evaluate(() =>
    Object.defineProperty(FileSystemHandle.prototype, "requestPermission", {
      configurable: true,
      value: () => new Promise(() => {}),
    }),
  );
  await page.clock.install();
  await page
    .getByRole("button", { name: "Handle song 更多操作", exact: true })
    .click();
  await page.getByRole("button", { name: "同步歌词", exact: true }).click();
  const syncDialog = page.getByRole("dialog", {
    name: "同步歌词",
    exact: true,
  });
  // The timeout starts after an async permission query; keep advancing until
  // it has been scheduled and fired.
  await expect(async () => {
    await page.clock.runFor(PERMISSION_TIMEOUT_MS);
    await expect(syncDialog).toBeVisible({ timeout: 500 });
  }).toPass();
  await expect(page.locator(".import-status")).toHaveCount(0);
  await syncDialog.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "导入音乐", exact: true }),
  ).toBeEnabled();
  // Once the browser grants the folder again, the restored handle syncs the
  // updated sidecars directly, without asking for the folder.
  await grantFolderAccess(page, folder);
  await page
    .getByRole("button", { name: "Handle song 更多操作", exact: true })
    .click();
  await page.getByRole("button", { name: "同步歌词", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("已同步歌词、翻译与注音");
  await expect(syncDialog).toHaveCount(0);
  await page.locator(".track-main").click();
  await page.locator(".mini-song").click();
  const player = page.locator(".mobile-player");
  await player.getByRole("button", { name: "暂停", exact: true }).click();
  await player.getByRole("button", { name: "歌词", exact: true }).click();
  await expect(player.locator(".lyric-original")).toHaveText(
    "Updated native lyrics",
  );
  await expect(player.locator(".lyric-translation")).toHaveText("同步后的译文");
  await player.getByRole("button", { name: "收起播放器", exact: true }).click();
  writeFileSync(lrc, "[00:00.00]Do not apply");
  writeFileSync(enhanced, "{");
  await page
    .getByRole("button", { name: "Handle song 更多操作", exact: true })
    .click();
  await page.getByRole("button", { name: "同步歌词", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("未修改已有歌词");
  const saved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("neukarustihs-v1");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tracks = await new Promise<{ lyrics: string }[]>(
      (resolve, reject) => {
        const request = db.transaction("tracks").objectStore("tracks").getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    db.close();
    return tracks[0].lyrics;
  });
  expect(saved).toBe("[00:00.00]Updated native lyrics");
  unlinkSync(lrc);
  unlinkSync(enhanced);
  await page
    .getByRole("button", { name: "Handle song 更多操作", exact: true })
    .click();
  await page.getByRole("button", { name: "同步歌词", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("未找到同名");
  await page.locator(".mini-song").click();
  await player.getByRole("button", { name: "歌词", exact: true }).click();
  await expect(player.locator(".lyric-translation")).toHaveText("同步后的译文");
  await player.getByRole("button", { name: "收起播放器", exact: true }).click();
  await page.evaluate(() => {
    Object.defineProperty(
      FileSystemDirectoryHandle.prototype,
      "queryPermission",
      { configurable: true, value: async () => "denied" },
    );
    Object.defineProperty(
      FileSystemDirectoryHandle.prototype,
      "requestPermission",
      { configurable: true, value: async () => "denied" },
    );
  });
  await page
    .getByRole("button", { name: "Handle song 更多操作", exact: true })
    .click();
  await page.getByRole("button", { name: "同步歌词", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "同步歌词", exact: true }),
  ).toBeVisible();
});

test("lyric sync folder fallback finds only the original song's siblings", async ({
  page,
}) => {
  const folder = resolve(fixtures, "Sync collection"),
    albumA = resolve(folder, "A"),
    albumB = resolve(folder, "B");
  mkdirSync(albumA, { recursive: true });
  mkdirSync(albumB, { recursive: true });
  const target = resolve(albumA, "Same title.wav");
  copyFileSync(first, target);
  copyFileSync(short, resolve(albumB, "Same title.wav"));
  writeFileSync(resolve(albumA, "Same title.lrc"), "[00:00.00]Correct song");
  writeFileSync(
    resolve(albumA, "Same title.lyrics.json"),
    enhancedLine("Correct song", "正确译文"),
  );
  writeFileSync(
    resolve(albumB, "Same title.lyrics.json"),
    enhancedLine("Wrong song", "错误译文"),
  );
  await page.addInitScript(() =>
    Object.defineProperty(window, "showDirectoryPicker", { value: undefined }),
  );
  await page.goto("./");
  await page.getByTestId("music-input").setInputFiles(target);
  await expect(page.locator(".track-row")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Same title 更多操作", exact: true })
    .click();
  await page.getByRole("button", { name: "同步歌词", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /选择歌曲所在文件夹/ }).click();
  await (await chooser).setFiles(folder);
  await expect(page.locator(".toast")).toContainText("已同步歌词、翻译与注音");
  await expect(page.locator(".track-row")).toHaveCount(1);
  await page.locator(".track-main").click();
  await page.locator(".mini-song").click();
  const player = page.locator(".mobile-player");
  await player.getByRole("button", { name: "暂停", exact: true }).click();
  await player.getByRole("button", { name: "歌词", exact: true }).click();
  await expect(player.locator(".lyric-translation")).toHaveText("正确译文");
  await player.getByRole("button", { name: "收起播放器", exact: true }).click();
  await page
    .getByRole("button", { name: "Same title 更多操作", exact: true })
    .click();
  await page.getByRole("button", { name: "同步歌词", exact: true }).click();
  const wrongChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /选择歌曲所在文件夹/ }).click();
  await (await wrongChooser).setFiles(albumB);
  await expect(page.locator(".toast")).toContainText("未找到这首歌");
  await page.locator(".mini-song").click();
  await player.getByRole("button", { name: "歌词", exact: true }).click();
  await expect(player.locator(".lyric-translation")).toHaveText("正确译文");
});

test("large libraries render only nearby rows yet stay fully browsable", async ({
  page,
}) => {
  const count = 3000;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "导入音乐", exact: true }),
  ).toBeEnabled();
  // Seed the stored library directly; importing thousands of files would
  // only test metadata parsing.
  await page.evaluate(async (count) => {
    const ids = Array.from({ length: count }, (_, i) => `track-${i}`);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("neukarustihs-v1");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("tracks", "readwrite");
      ids.forEach((id, i) =>
        transaction.objectStore("tracks").put(
          {
            id,
            name: `Song ${i}.mp3`,
            title: `Song ${String(i).padStart(4, "0")}`,
            artist: `Artist ${i % 40}`,
            album: "Seeded",
            size: 1,
            modified: 1,
            duration: 180,
            added: i,
          },
          id,
        ),
      );
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
    localStorage.setItem(
      "neukarustihs-preferences-v1",
      JSON.stringify({ version: 1, state: { queue: ids } }),
    );
  }, count);
  await page.reload();
  await expect(page.getByText(`${count} 首私藏`)).toBeVisible();
  const rows = page.locator(".track-list .track-row");
  await expect(rows.first()).toContainText("Song 2999");
  expect(await rows.count()).toBeLessThan(60);
  // The page still scrolls through every song, newest first.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(rows.last()).toContainText("Song 0000");
  await expect(rows.last().locator(".track-number")).toHaveText("3000");
  expect(await rows.count()).toBeLessThan(60);
  const search = page.getByRole("textbox", { name: "搜索音乐" });
  await search.fill("Song 1234");
  await expect(rows).toHaveCount(1);
  await search.fill("");
  await page.getByRole("combobox", { name: "歌曲排序" }).selectOption("title");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(rows.first()).toContainText("Song 0000");
  // "Play all" queues the whole library; the queue dialog scrolls it too.
  await page
    .locator(".desktop-player")
    .getByRole("button", { name: "播放队列", exact: true })
    .click();
  const queue = page.getByRole("dialog", { name: `播放队列 · ${count}` });
  const queueRows = queue.locator(".queue-row");
  await expect(queueRows.first()).toContainText("Song 0000");
  expect(await queueRows.count()).toBeLessThan(60);
  await queue.evaluate((dialog) => dialog.scrollTo(0, dialog.scrollHeight));
  await expect(queueRows.last()).toContainText("Song 2999");
  expect(await queueRows.count()).toBeLessThan(60);
});

test("playback progress does not rewrite saved preferences", async ({
  page,
}) => {
  type Counted = Window & { preferenceWrites?: number };
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    const counted = window as Counted;
    counted.preferenceWrites = 0;
    Storage.prototype.setItem = function (key, value) {
      if (key === "neukarustihs-preferences-v1")
        counted.preferenceWrites = (counted.preferenceWrites ?? 0) + 1;
      return setItem.call(this, key, value);
    };
  });
  await page.goto("./");
  await page.getByTestId("music-input").setInputFiles(first);
  await expect(page.locator(".track-row")).toHaveCount(1);
  await page.locator(".track-main").click();
  const progress = page.locator(".desktop-player input[type=range]");
  await expect
    .poll(async () => Number(await progress.inputValue()))
    .toBeGreaterThan(0);
  const writes = () =>
    page.evaluate(() => (window as Counted).preferenceWrites);
  const before = await writes();
  // Several position updates later, nothing saved has changed.
  await expect
    .poll(async () => Number(await progress.inputValue()))
    .toBeGreaterThan(1.5);
  expect(await writes()).toBe(before);
});

test("a song whose file changed keeps its entry, favorite and lyrics", async ({
  page,
}) => {
  const folder = resolve(fixtures, "Changing album");
  mkdirSync(folder, { recursive: true });
  const song = resolve(folder, "Changing song.wav"),
    lyrics = resolve(folder, "Changing song.lrc");
  copyFileSync(first, song);
  writeFileSync(lyrics, "[00:00.00]Kept lyrics");
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "导入音乐", exact: true }),
  ).toBeEnabled();
  await grantFolderAccess(page, folder);
  const importFolder = async () => {
    await page.getByRole("button", { name: "导入音乐", exact: true }).click();
    await page
      .getByRole("dialog", { name: "导入音乐" })
      .getByRole("button", { name: /^导入文件夹/ })
      .click();
  };
  await importFolder();
  const duration = page.locator(".track-row .track-duration");
  await expect(duration).toHaveText("0:20");
  await page
    .getByRole("button", { name: "Changing song 更多操作", exact: true })
    .click();
  await page.getByRole("button", { name: "加入我喜欢", exact: true }).click();
  unlinkSync(lyrics);
  // Rewrite the file in place, as a tag editor would: new size and time.
  copyFileSync(short, song);
  await importFolder();
  await expect(page.locator(".toast")).toContainText("已更新 1 首");
  await expect(page.locator(".track-row")).toHaveCount(1);
  await expect(duration).toHaveText("0:01");
  // A folder upload has no file handles; its path identifies the song.
  copyFileSync(first, song);
  await page.getByTestId("folder-input").setInputFiles(folder);
  await expect(page.locator(".toast")).toContainText("已更新 1 首");
  await expect(page.locator(".track-row")).toHaveCount(1);
  await expect(duration).toHaveText("0:20");
  await page
    .getByRole("navigation", { name: "手机导航" })
    .getByRole("button", { name: "我喜欢", exact: true })
    .click();
  await expect(page.locator(".track-row")).toHaveCount(1);
  await page.locator(".track-main").click();
  await page.locator(".mini-song").click();
  const player = page.locator(".mobile-player");
  await player.getByRole("button", { name: "暂停", exact: true }).click();
  await player.getByRole("button", { name: "歌词", exact: true }).click();
  await expect(player.locator(".lyric-original")).toHaveText("Kept lyrics");
});
