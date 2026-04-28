import type { HTMLProps } from "@volynets/reflex-dom";

interface ButtonProps extends HTMLProps<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "neutral" | "warning" | "danger";
}

const Button = ({ variant, children, ...rest }: ButtonProps) => (
  <button class={variant} {...rest}>
    {children}
  </button>
);

export default Button;
