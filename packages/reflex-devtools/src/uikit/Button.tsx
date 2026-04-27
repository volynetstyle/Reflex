import type { HTMLProps } from "@volynets/reflex-dom";

interface ButtonProps extends HTMLProps<HTMLButtonElement> {}

const Button = ({ children, ...rest }: ButtonProps) => {
  return <button {...rest}>{children}</button>;
};

export default Button;
