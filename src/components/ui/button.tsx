import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Base — Space Mono uppercase pill, with a real hover/press animation
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-full",
    "font-mono text-[11px] font-normal uppercase tracking-[0.08em]",
    "cursor-pointer",
    "transition-[opacity,background-color,border-color,color,box-shadow,transform]",
    "duration-[150ms]",
    "ease-out",
    "hover:scale-[1.03] active:scale-[0.96]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        // Filled black — primary action; a touch of brand-gold warmth on hover
        default:
          "bg-foreground text-background hover:opacity-85 hover:shadow-md hover:shadow-brand-gold/25",
        // Outlined — secondary action
        outline:
          "border border-border bg-transparent text-foreground hover:bg-accent hover:border-brand-red/40",
        // Ghost — tertiary / nav items
        ghost:
          "bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
        // Destructive — now actually reads as a warning, not just dark ink
        destructive:
          "bg-brand-red text-brand-red-foreground hover:opacity-85 hover:shadow-md hover:shadow-brand-red/30",
        // Secondary — muted fill
        secondary:
          "bg-muted text-foreground hover:bg-accent",
        // Link — underline only
        link:
          "underline-offset-4 hover:underline text-foreground bg-transparent p-0 hover:scale-100",
      },
      size: {
        default: "h-11 px-7",
        sm:      "h-9 px-5 text-[10px]",
        lg:      "h-12 px-8",
        xl:      "h-14 px-10 text-[12px]",
        icon:    "h-9 w-9",
        "icon-sm": "h-8 w-8",
        "icon-lg": "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
