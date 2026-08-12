import Image from "next/image";

type BrandLogoProps = {
  compact?: boolean;
};

export function BrandLogo({ compact = false }: BrandLogoProps) {
  return (
    <Image
      src="/G4/image.png"
      alt="G4 Builders Incorporated"
      width={1726}
      height={500}
      priority={compact}
      className={
        compact
          ? "h-12 w-auto max-w-[240px] object-contain sm:h-14 sm:max-w-[300px]"
          : "h-16 w-auto max-w-[300px] object-contain sm:h-20 sm:max-w-[430px]"
      }
    />
  );
}
