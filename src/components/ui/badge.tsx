import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";

export function Badge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted",
        className,
      )}
      {...props}
    />
  );
}
