interface Component {
  id: number;
  bind(ctx: Runtime): void | Promise<void>;
  unbind(ctx: Runtime): void;
}
