"use client";

import { LogoutButton } from "@/components/ui/logout-button";
import { ChevronDown, User, UserLock, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

const accountLinks = [
  { label: "My Profile", icon: UserRound, href: "/customer/profile" },
  { label: "Security", icon: UserLock, href: "/customer/security" },
];

export function CustomerAccountMenu({ name }: { name: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-label="Open account menu"
        className="flex max-w-56 items-center gap-2 rounded-lg p-1 text-left transition hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 md:gap-3 md:pr-2"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-stone-200 text-stone-500 md:h-12 md:w-12">
          <User aria-hidden="true" className="h-5 w-5 md:h-6 md:w-6" />
        </span>
        <span className="hidden min-w-0 md:block">
          <span className="block truncate text-sm font-semibold" title={name}>{name}</span>
          <span className="block text-xs text-stone-500">Customer</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-stone-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Kept mounted while closed so the logout confirmation dialog survives the menu closing. */}
      <div
        id={menuId}
        className={`absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-stone-200 bg-white p-2 shadow-lg ${isOpen ? "" : "hidden"}`}
      >
        <p className="mb-1 truncate border-b border-stone-200 px-4 pt-2 pb-3 text-xs text-stone-500 md:hidden">
          Signed in as <span className="font-semibold text-stone-950">{name}</span>
        </p>
        <nav aria-label="Account">
          {accountLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-4 rounded-lg px-4 py-3 text-sm font-medium text-stone-600 transition hover:bg-red-50 hover:text-red-800"
            >
              <item.icon aria-hidden="true" className="h-5 w-5" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-1 border-t border-stone-200 pt-1">
          <LogoutButton onLogout={() => setIsOpen(false)} />
        </div>
      </div>
    </div>
  );
}
