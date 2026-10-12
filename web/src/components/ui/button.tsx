import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-all duration-150 select-none active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[1.15em] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Orange is reserved for the main call to action
        accent: "bg-accent text-accent-foreground shadow-[0_8px_20px_-6px_rgb(249_115_22/0.55)] hover:bg-accent-hover hover:shadow-[0_12px_28px_-8px_rgb(249_115_22/0.65)] hover:-translate-y-px",
        // Same indigo-to-sky gradient as the PostPilot logo
        brand: "bg-gradient-to-br from-[#3730A3] to-[#0284C7] text-white shadow-[0_8px_20px_-6px_rgb(55_48_163/0.55)] hover:brightness-110 hover:shadow-[0_12px_28px_-8px_rgb(55_48_163/0.65)] hover:-translate-y-px",
        primary: "bg-primary text-primary-foreground shadow-soft hover:brightness-110 hover:-translate-y-px",
        secondary: "bg-card text-foreground border border-border shadow-soft hover:bg-muted hover:-translate-y-px",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        success: "bg-success text-white dark:text-[#04140e] shadow-soft hover:brightness-110 hover:-translate-y-px",
        destructive: "bg-danger-soft text-danger border border-danger/25 hover:bg-danger hover:text-white",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-5 text-base",
        lg: "h-14 px-7 text-lg rounded-2xl",
        xl: "h-16 px-9 text-xl rounded-2xl",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : "button";
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
        {asChild ? children : (
          <>
            {loading && <Loader2 className="animate-spin" aria-hidden />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";
