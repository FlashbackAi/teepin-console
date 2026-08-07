import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button.
 *
 * The primary variant is a plain inverted fill — near-black on light,
 * near-white on dark. It is unmissable precisely because nothing else on
 * screen is filled: with no signature accent competing for attention,
 * the one filled element is obviously the action.
 *
 * There is exactly ONE primary button per view. If a screen seems to
 * need two, one of them is secondary.
 */
const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md",
    "text-sm font-medium",
    // Focus is never removed — keyboard users are not a rounding error.
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    // Colour transitions only. No transform, no scale: buttons in an ops
    // tool should feel immediate, not springy.
    "transition-colors duration-100",
  ),
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground hover:opacity-90",
        secondary:
          "bg-muted text-foreground hover:bg-border",
        outline:
          "hairline border-border bg-transparent text-foreground hover:bg-muted",
        ghost: "bg-transparent text-foreground hover:bg-muted",
        // Destructive is outlined, not filled: a filled red button
        // invites the click it should discourage.
        destructive:
          "hairline border-destructive/40 bg-transparent text-destructive hover:bg-destructive/10",
      },
      size: {
        sm: "h-7 px-2.5 text-xs",
        md: "h-8 px-3",
        lg: "h-9 px-4",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
