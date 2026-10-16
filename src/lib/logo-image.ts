/** Remove only a near-uniform background connected to the image border. */
export function removeSolidBackground(pixels: Uint8ClampedArray, width: number, height: number) {
  const corners = [0, width - 1, (height - 1) * width, width * height - 1];
  const distance = (a: number, b: number) => Math.max(...[0, 1, 2].map((c) => Math.abs((pixels[a * 4 + c] ?? 0) - (pixels[b * 4 + c] ?? 0))));
  const reference = corners.find((a) => corners.filter((b) => distance(a, b) <= 24 && (pixels[b * 4 + 3] ?? 0) > 240).length >= 3);
  if (reference === undefined) return false;
  const seen = new Uint8Array(width * height);
  const queue: number[] = [];
  const add = (index: number) => {
    if (seen[index]) return;
    seen[index] = 1;
    if (distance(index, reference) <= 32) queue.push(index);
  };
  for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { add(y * width); add(y * width + width - 1); }
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    if (index === undefined) continue;
    if (index % width > 0) add(index - 1);
    if (index % width < width - 1) add(index + 1);
    if (index >= width) add(index - width);
    if (index < width * (height - 1)) add(index + width);
  }
  for (const index of queue) pixels[index * 4 + 3] = 0;
  return queue.length > 0;
}

/** PNG preserves alpha; never upscale a small original. Keep LAN payloads below 2 MB. */
export async function toLogoDataUrl(file: File, max = 768, removeBackground = false) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tidak bisa memproses gambar");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  if (removeBackground) {
    const image = ctx.getImageData(0, 0, width, height);
    if (!removeSolidBackground(image.data, width, height)) throw new Error("Latar tidak polos. Gunakan PNG transparan.");
    ctx.putImageData(image, 0, 0);
  }
  const data = canvas.toDataURL("image/png");
  if (data.length > 1800000 && max > 256) return toLogoDataUrl(file, Math.floor(max * 0.75), removeBackground);
  return data;
}
