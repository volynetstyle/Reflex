import {
  IRuntime,
  IScheduler,
  IAllocator,
  IGraph,
  INode,
} from "@reflex/contract";

// це трошки якась зараз хуйня  

export class Runtime<N extends INode> implements IRuntime<N> {
  constructor(
    public readonly scheduler: IScheduler,
    public readonly allocator: IAllocator<N>,
    public readonly topology: IGraph<N>,
  ) {}
}
