import sharp from "sharp";
import { fileURLToPath } from "node:url";

// The note and play flag fit within the Android maskable icon safe zone.
const source = fileURLToPath(new URL("../public/favicon.svg", import.meta.url));
for (const size of [192, 512]) {
  await sharp(source)
    .resize(size, size)
    .png()
    .toFile(
      fileURLToPath(
        new URL(`../public/icon-music-${size}.png`, import.meta.url),
      ),
    );
}
await sharp(source)
  .resize(512, 512)
  .flatten({ background: "#151925" })
  .png()
  .toFile(
    fileURLToPath(
      new URL("../public/icon-music-maskable.png", import.meta.url),
    ),
  );
