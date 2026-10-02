import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
const { version } = JSON.parse(readFileSync("package.json", "utf8"));

test("mobile pages expose only relevant actions and installed apps hide installation", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "导入音乐", exact: true }),
  ).toHaveCount(1);
  await expect(page.locator(".topbar button")).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: /^(导入文件夹|添加文件夹|选择文件夹|选择文件)$/,
    }),
  ).toHaveCount(0);
  await expect(page.locator(".empty-library")).toHaveCount(0);
  await page.screenshot({ path: "test-results/library-clean-mobile.png" });
  const nav = page.getByRole("navigation", { name: "手机导航" });
  for (const label of ["我喜欢", "歌单", "设置"]) {
    await nav.getByRole("button", { name: label, exact: true }).click();
    await expect(
      page.getByRole("button", { name: "导入音乐", exact: true }),
    ).toHaveCount(0);
  }
  await expect(page.getByText(`v${version}`, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "安装 neukarustihS", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(
    page.getByRole("button", { name: "安装 neukarustihS", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.getByRole("button", { name: "检查更新", exact: true }).click();
  await expect(page.locator(".update-status")).toHaveText("已是最新版本");
  await context.setOffline(true);
  await page.getByRole("button", { name: "检查更新", exact: true }).click();
  await expect(page.locator(".update-status")).toContainText("当前离线");
  await context.setOffline(false);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await nav.getByRole("button", { name: "歌单", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(
    page.getByRole("button", { name: "新建歌单", exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "新建歌单", exact: true }).click();
  await page
    .getByRole("textbox", { name: "给这段心情起个名字" })
    .fill("Quiet Hours");
  await page.getByRole("button", { name: "保存歌单", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Quiet Hours", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "导入音乐", exact: true }),
  ).toHaveCount(0);
});

test("standalone launch hides install promotion but keeps update tools", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const result = original(query);
      if (query === "(display-mode: standalone)")
        Object.defineProperty(result, "matches", { value: true });
      return result;
    };
  });
  await page.goto("./");
  await page
    .getByRole("navigation", { name: "手机导航" })
    .getByRole("button", { name: "设置", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "放在主屏幕" })).toHaveCount(
    0,
  );
  await expect(page.getByText(/已安装到主屏幕/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "检查更新", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/settings-installed-mobile.png",
    fullPage: true,
  });
});

test("manual update finds a new service worker and preserves preferences after user accepts", async ({
  page,
}) => {
  let revision = 1;
  const root = resolve("dist");
  const mime: Record<string, string> = {
    ".js": "text/javascript",
    ".html": "text/html",
    ".css": "text/css",
    ".webmanifest": "application/manifest+json",
    ".png": "image/png",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  };
  const server = createServer((request, response) => {
    const pathname = new URL(request.url || "/", "http://localhost").pathname;
    const file = resolve(
      root,
      pathname.replace(/^\/neukarustihS\//, "") || "index.html",
    );
    if (!file.startsWith(root + sep)) {
      response.writeHead(404).end();
      return;
    }
    try {
      let content = readFileSync(file);
      if (pathname.endsWith("/sw.js"))
        content = Buffer.concat([
          content,
          Buffer.from(`\n// update test revision ${revision}\n`),
        ]);
      response
        .writeHead(200, {
          "Content-Type": mime[extname(file)] || "application/octet-stream",
          "Cache-Control": "no-store",
        })
        .end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server unavailable");
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`http://127.0.0.1:${address.port}/neukarustihS/`);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page
      .getByRole("button", { name: "播放模式：列表循环", exact: true })
      .click();
    await page
      .getByRole("button", { name: "播放模式：单曲循环", exact: true })
      .click();
    await page
      .getByRole("button", { name: "设置", exact: true })
      .filter({ visible: true })
      .click();
    await page.getByRole("button", { name: "检查更新", exact: true }).click();
    await expect(page.locator(".update-status")).toHaveText("已是最新版本");
    revision = 2;
    await page.getByRole("button", { name: "检查更新", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "更新并重新打开", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "聆听偏好",
    );
    await Promise.all([
      page.waitForEvent("load"),
      page.getByRole("button", { name: "更新并重新打开", exact: true }).click(),
    ]);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "音乐库",
    );
    await expect(
      page.getByRole("button", { name: "播放模式：随机播放", exact: true }),
    ).toBeVisible();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
