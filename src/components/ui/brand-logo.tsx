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
          ? "h-auto w-52 max-w-full object-contain"
          : "h-auto w-52 max-w-full object-contain sm:w-72"
      }
    />
  );
}
