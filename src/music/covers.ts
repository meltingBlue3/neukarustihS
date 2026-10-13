// One object URL per cover image, shared by list rows, the player and the
// system media controls, so scrolling a long list never re-creates them. The
// image itself stays with its track either way; release the URL when the
// track leaves the library.
const urls = new WeakMap<Blob, string>();

export function coverUrl(cover: Blob) {
  let url = urls.get(cover);
  if (!url) {
    url = URL.createObjectURL(cover);
    urls.set(cover, url);
  }
  return url;
}

export function releaseCover(cover?: Blob) {
  const url = cover && urls.get(cover);
  if (!url) return;
  URL.revokeObjectURL(url);
  urls.delete(cover);
}
