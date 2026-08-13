"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import * as React from "react";

type ImageSliderProps = React.HTMLAttributes<HTMLDivElement> & {
  images: string[];
  interval?: number;
  initialIndex?: number;
};

const ImageSlider = React.forwardRef<HTMLDivElement, ImageSliderProps>(
  ({ images, interval = 5000, initialIndex = 0, className = "", ...props }, ref) => {
    const [currentIndex, setCurrentIndex] = React.useState(initialIndex);

    React.useEffect(() => {
      setCurrentIndex(initialIndex);
    }, [initialIndex]);

    React.useEffect(() => {
      const timer = window.setInterval(() => {
        setCurrentIndex((current) =>
          current === images.length - 1 ? 0 : current + 1,
        );
      }, interval);

      return () => window.clearInterval(timer);
    }, [images.length, interval]);

    return (
      <div
        ref={ref}
        className={`relative h-full w-full overflow-hidden bg-stone-100 ${className}`}
        {...props}
      >
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 50, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -50, scale: 0.98 }}
            transition={{ duration: 0.55, ease: "easeInOut" }}
            className="absolute inset-0"
          >
            <Image
              src={images[currentIndex]}
              alt={`Project slide ${currentIndex + 1}`}
              fill
              className="object-cover"
              sizes="(min-width: 1024px) 45vw, 100vw"
              priority
            />
          </motion.div>
        </AnimatePresence>

        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
          {images.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setCurrentIndex(index)}
              className={[
                "h-2 w-2 rounded-full transition-colors duration-300",
                currentIndex === index ? "bg-white" : "bg-white/50 hover:bg-white",
              ].join(" ")}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      </div>
    );
  },
);

ImageSlider.displayName = "ImageSlider";

export { ImageSlider };
