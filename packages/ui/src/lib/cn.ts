import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn/ui convention — merge conditional classes, last Tailwind class wins. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
