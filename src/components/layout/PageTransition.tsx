"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="flex min-w-0 flex-1 flex-col animate-fade-in-up">
      {children}
    </div>
  );
}
