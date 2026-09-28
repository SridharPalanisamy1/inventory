/**
 * cn — className merge utility
 * Combines clsx (conditional classes) + tailwind-merge (conflict resolution)
 * Usage: cn("px-4 py-2", isActive && "bg-blue-500", "px-8")
 *        → "py-2 bg-blue-500 px-8"  (px-8 wins over px-4 via tw-merge)
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
