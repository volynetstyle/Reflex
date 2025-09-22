type ComponentRegistry = {
  div: { className?: string };
  Button: { onClick?: () => void; label?: string };
};

type ComponentNode<
  T extends keyof ComponentRegistry = keyof ComponentRegistry
> = {
  id: string;
  type: T;
  props: ComponentRegistry[T];
  children?: ComponentNode[];
};
