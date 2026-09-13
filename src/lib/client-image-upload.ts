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
