import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines multiple class values into a single className string,
 * with Tailwind CSS class merging capabilities
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
