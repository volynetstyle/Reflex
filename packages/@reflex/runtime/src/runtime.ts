import {
  IRuntime,
  IScheduler,
  IAllocator,
  IGraph,
  INode,
} from "@reflex/contract";

export class Runtime<N extends INode> implements IRuntime<N> {
  constructor(
    public readonly scheduler: IScheduler,
    public readonly allocator: IAllocator<N>,
    public readonly graph: IGraph<N>,
  ) {}
}
