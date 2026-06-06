import { cn } from "@/lib/utils";

const sizes = {
  md: "h-11 w-40",
  lg: "h-14 w-48",
  xl: "h-24 w-80"
} as const;

type PeekabooLogoProps = {
  size?: keyof typeof sizes;
  className?: string;
};

export function PeekabooLogo({ size = "lg", className }: PeekabooLogoProps) {
  return (
    <div className={cn("overflow-hidden", sizes[size], className)}>
      <img src="/peekaboo_logo.jpg" alt="Peekaboo" className="h-full w-full object-cover object-center" />
    </div>
  );
}
