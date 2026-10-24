/** The home page slideshow shows at most this many design photos, one per design. */
export const homeSlideshowLimit = 4;

/** One slide: a Published design's cover photo. */
export type HomeSlide = { designId: string; name: string; image: string };

/**
 * Admin view (Maintenance > Home Page Slideshow). `chosen` lists the picked designs in order; when it is empty the
 * home page shows the newest Published designs.
 */
export type HomeSlideshowView = {
  chosen: string[];
  /** Published designs with a photo, newest first: the ones that can be picked. */
  designs: HomeSlide[];
  changedBy: string | null;
  changedAt: string | null;
};
