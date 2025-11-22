import { Link, GraphNode } from "./graph.node";

class LinkPool {
  private _free: Link | null = null;

  size = 0;

  acquire(source: GraphNode, observer: GraphNode): Link {
    if (this._free) {
      const link = this._free;

      // вынимаем из freelist
      this._free = link.nextInSource;
      this.size--;

      link.source = source;
      link.observer = observer;

      link.nextInSource = null;
      link.prevInSource = null;

      link.nextInObserver = null;
      link.prevInObserver = null;

      return link;
    }

    return new Link(source, observer);
  }

  release(link: Link): void {
    link.source = null as any;
    link.observer = null as any;

    link.nextInObserver = null;
    link.prevInObserver = null;
    link.prevInSource = null;

    // кладём в freelist через nextInSource
    link.nextInSource = this._free;
    this._free = link;
    this.size++;
  }
}

export const linkPool = new LinkPool();