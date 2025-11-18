import {
  IReactiveNode,
  ISourceLink,
  IObserverLink,
  IObserverFn,
} from "./graph.types";
import {
  linkEdge,
  unlinkSourceLink,
  unlinkObserverLink,
} from "./utils/graph_linker";

interface IGraphProto {
  /** link this as observer of source */
  addSource(this: IReactiveNode, source: IReactiveNode): ISourceLink;

  /** you must pass the link you got from addSource */
  removeSource(this: IReactiveNode, link: ISourceLink): void;

  addObserver(this: IReactiveNode, observer: IReactiveNode): IObserverLink;
  removeObserver(this: IReactiveNode, link: IObserverLink): void;

  addObserverFunction(this: IReactiveNode, fn: IObserverFn): void;
}

const GraphProto: IGraphProto = {
  addSource(source) {
    const link = linkEdge(this, source);
    return link._source;
  },

  removeSource(link) {
    unlinkSourceLink(link);
  },

  addObserver(observer) {
    const link = linkEdge(observer, this);
    return link._observer;
  },

  removeObserver(link) {
    unlinkObserverLink(link);
  },

  addObserverFunction(fn) {
    this._observer = fn;
  },
};

export { GraphProto };
