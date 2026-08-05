import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Helper estándar de shadcn/ui — combina clases condicionales (clsx) y
// resuelve conflictos de utilidades de Tailwind (twMerge).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
