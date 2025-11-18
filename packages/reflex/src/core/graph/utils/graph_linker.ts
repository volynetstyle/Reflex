import { IReactiveNode, ISourceLink, IObserverLink } from "../graph.types";
import {
  insertObserverHead,
  insertSourceHead,
  removeObserverLink,
  removeSourceLink,
} from "./intrusive-helpers";

export function linkEdge(observer: IReactiveNode, source: IReactiveNode) {
  const _source: ISourceLink = {
    _prev: null,
    _next: null,
    _pair: null as any,
    source,
  };

  const _observer: IObserverLink = {
    _prev: null,
    _next: null,
    _pair: _source,
    observer,
  };

  _source._pair = _observer;

  observer._sources = insertSourceHead(observer._sources, _source);
  source._observers = insertObserverHead(source._observers, _observer);

  return { _source, _observer };
}

export function unlinkSourceLink(source: ISourceLink) {
  const obs = source._pair;
  if (!obs) {
    return;
  }

  const observer = obs.observer;
  const _source = source.source;

  observer._sources = removeSourceLink(observer._sources, source);
  _source._observers = removeObserverLink(_source._observers, obs);

  source._pair = null as any;
  obs._pair = null as any;
}

export function unlinkObserverLink(obs: IObserverLink) {
  const _source = obs._pair;

  if (!_source) {
    return;
  }

  unlinkSourceLink(_source);
}
