export const embeddedImageAccept = "image/jpeg,image/png,image/webp";
export const maxEmbeddedImageBytes = 750_000;

const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function readEmbeddedImage(file: File) {
  if (!acceptedImageTypes.has(file.type)) {
    throw new Error("Upload a JPG, PNG, or WebP image.");
  }
  if (file.size > maxEmbeddedImageBytes) {
    throw new Error("The image is larger than 750 KB. Compress it and try again.");
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.readAsDataURL(file);
  });
}

/**
 * Shrinks a photo so its longer side is at most `maxSide` pixels and saves it as WebP (JPEG where the browser cannot),
 * keeping its shape. Phone photos of a problem in the house end up a few hundred KB, so several fit in one upload.
 */
export async function readResizedPhoto(file: File, maxSide = 1280, maxBytes = 15_000_000) {
  if (!acceptedImageTypes.has(file.type)) {
    throw new Error("Upload a JPG, PNG, or WebP image.");
  }
  if (file.size > maxBytes) {
    throw new Error(`The photo is larger than ${Math.round(maxBytes / 1_000_000)} MB. Choose a smaller one.`);
  }

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("The photo could not be read.");
  });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The photo could not be read.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const webp = canvas.toDataURL("image/webp", 0.8);
  const photo = webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.8);
  if (photo.length > 1_000_000) throw new Error("The photo is still too large after resizing. Choose a smaller one.");
  return photo;
}

/**
 * Crops a photo to a centered square no larger than `size` pixels and saves it as WebP (JPEG where the browser
 * cannot), so even a large phone photo ends up small.
 */
export async function readSquarePhoto(file: File, size: number, maxBytes: number) {
  if (!acceptedImageTypes.has(file.type)) {
    throw new Error("Upload a JPG, PNG, or WebP image.");
  }
  if (file.size > maxBytes) {
    throw new Error(`The photo is larger than ${Math.round(maxBytes / 1_000_000)} MB. Choose a smaller one.`);
  }

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("The photo could not be read.");
  });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(size, side);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The photo could not be read.");
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const webp = canvas.toDataURL("image/webp", 0.85);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.85);
}
