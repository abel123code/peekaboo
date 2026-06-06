import type { HTMLAttributes } from "react";
import { cn } from "../../../lib/utils";

const variants = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  success: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  warning: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  danger: "bg-red-50 text-red-700 ring-red-100",
  info: "bg-zinc-100 text-zinc-700 ring-zinc-200"
};

export function Badge({
  className,
  variant = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof variants }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium capitalize ring-1", variants[variant], className)}
      {...props}
    />
  );
}
