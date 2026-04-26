import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium tracking-wide",
  {
    variants: {
      variant: {
        default: "bg-[var(--badge-neutral-bg)] text-[var(--badge-neutral-text)]",
        success: "bg-[var(--badge-success-bg)] text-[var(--badge-success-text)]",
        warning: "bg-[var(--badge-warning-bg)] text-[var(--badge-warning-text)]",
        danger: "bg-[var(--badge-danger-bg)] text-[var(--badge-danger-text)]",
        info: "bg-[var(--badge-info-bg)] text-[var(--badge-info-text)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type BadgeProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
