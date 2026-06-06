import type { HTMLAttributes } from "react";
import { cn } from "../../../lib/utils";

export function PageHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-6 flex items-start justify-between gap-4", className)} {...props} />;
}

export function PageTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={cn("text-3xl font-semibold tracking-tight text-zinc-950 max-sm:text-2xl", className)} {...props} />;
}

export function PageDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-2 text-sm leading-6 text-slate-600", className)} {...props} />;
}

export function PageStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("grid gap-5", className)} {...props} />;
}
