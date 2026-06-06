import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../../lib/utils";

const variants = {
  default: "bg-zinc-950 text-white shadow-sm hover:bg-zinc-800",
  secondary: "border border-zinc-200 bg-white text-zinc-900 shadow-sm hover:border-zinc-300 hover:bg-zinc-50",
  ghost: "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950",
  danger: "bg-red-600 text-white shadow-sm shadow-red-100 hover:bg-red-700"
};

const sizes = {
  default: "h-9 px-3.5 text-sm",
  sm: "h-8 px-3 text-xs",
  icon: "h-8 w-8"
};

type ButtonStyleProps = {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
};

export function buttonClassName({ variant = "default", size = "default" }: ButtonStyleProps = {}) {
  return cn(
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size]
  );
}

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & ButtonStyleProps) {
  return <button className={cn(buttonClassName({ variant, size }), className)} {...props} />;
}

export function ButtonLink({
  className,
  variant,
  size,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> &
  ButtonStyleProps & {
    href: string;
    children: ReactNode;
  }) {
  return (
    <Link className={cn(buttonClassName({ variant, size }), className)} {...props}>
      {children}
    </Link>
  );
}
