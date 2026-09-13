import { z } from "zod";

/** Keeps twelve possible request/result images safely below MongoDB's 16 MB document limit. */
export const embeddedImageSchema = z
  .string()
  .min(1, "Select an image to upload.")
  .max(1_050_000, "The image is too large. Use an image smaller than 750 KB.")
  .regex(
    /^data:image\/(?:jpeg|png|webp);base64,/,
    "Upload a JPG, PNG, or WebP image.",
  );

export const embeddedImagesSchema = z
  .array(embeddedImageSchema)
  .min(1, "Upload at least one image.")
  .max(6, "You can upload up to 6 images.");
