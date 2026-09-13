import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button, type ButtonProps } from "@/components/ui/button";

type BackButtonProps = ButtonProps & {
  href?: string;
};

function BackButtonContent() {
  return (
    <>
      <span className="w-12 translate-x-2 transition-opacity duration-500 group-hover:opacity-0 sm:w-20">
        Back
      </span>
      <i className="absolute inset-y-0 left-0 z-10 grid w-1/4 place-items-center bg-white/15 transition-all duration-500 group-hover:w-full">
        <ArrowLeft
          className="opacity-80"
          size={16}
          strokeWidth={2}
          aria-hidden="true"
        />
      </i>
    </>
  );
}

export function BackButton({ className, href, ...props }: BackButtonProps) {
  const buttonClassName = [
    "group relative min-h-11 min-w-20 shrink-0 overflow-hidden pr-4 sm:min-w-28",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <Button asChild size="sm" className={buttonClassName} {...props}>
        <Link href={href}>
          <BackButtonContent />
        </Link>
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      className={buttonClassName}
      {...props}
    >
      <BackButtonContent />
    </Button>
  );
}
