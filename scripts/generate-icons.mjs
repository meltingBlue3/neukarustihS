import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const publicFile = (name) =>
  fileURLToPath(new URL(`../public/${name}`, import.meta.url));

// favicon.svg is the rounded tile. Without its #tile clip it becomes the
// full-bleed artwork that Android (maskable) and iOS crop themselves; the moon
// and record stay inside the maskable safe zone.
const tile = readFileSync(publicFile("favicon.svg"));
const fullBleed = Buffer.from(
  tile.toString().replace(' clip-path="url(#tile)"', ""),
);
if (fullBleed.equals(tile)) {
  throw new Error('favicon.svg must wrap its artwork in clip-path="url(#tile)"');
}

for (const size of [192, 512]) {
  await sharp(tile)
    .resize(size, size)
    .png()
    .toFile(publicFile(`icon-eclipse-${size}.png`));
}
await sharp(fullBleed)
  .resize(512, 512)
  .png()
  .toFile(publicFile("icon-eclipse-maskable.png"));
// iOS shows transparent pixels as black, so the touch icon carries no alpha.
await sharp(fullBleed)
  .resize(180, 180)
  .flatten({ background: "#101116" })
  .png()
  .toFile(publicFile("icon-eclipse-apple-180.png"));
