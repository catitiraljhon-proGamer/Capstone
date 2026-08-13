import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Button, type ButtonProps } from "@/components/ui/button";

type NextButtonProps = ButtonProps & {
  href?: string;
};

function NextButtonContent() {
  return (
    <>
      <span className="w-16 -translate-x-2 transition-opacity duration-500 group-hover:opacity-0">
        Next
      </span>
      <i className="absolute inset-y-0 right-0 z-10 grid w-1/4 place-items-center bg-white/15 transition-all duration-500 group-hover:w-full">
        <ArrowRight
          className="opacity-80"
          size={16}
          strokeWidth={2}
          aria-hidden="true"
        />
      </i>
    </>
  );
}

export function NextButton({ className, href, ...props }: NextButtonProps) {
  const buttonClassName = [
    "group relative min-w-24 overflow-hidden pl-4",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <Button asChild size="sm" className={buttonClassName} {...props}>
        <Link href={href}>
          <NextButtonContent />
        </Link>
      </Button>
    );
  }

  return (
    <Button size="sm" className={buttonClassName} {...props}>
      <NextButtonContent />
    </Button>
  );
}
