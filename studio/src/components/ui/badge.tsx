import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide",
  {
    variants: {
      tone: {
        muted: "bg-elevated text-muted border border-border",
        accent: "bg-accent/15 text-accent border border-accent/30",
        ok: "bg-ok/15 text-ok border border-ok/30",
        warn: "bg-paper/10 text-paper border border-paper/20",
        danger: "bg-danger/15 text-danger border border-danger/30",
      },
    },
    defaultVariants: { tone: "muted" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
