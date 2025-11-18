import { ISourceLink, IObserverLink } from "../graph.types";

export function insertSourceHead(head: ISourceLink | null, link: ISourceLink) {
  link._prev = null;
  link._next = head;
  if (head !== null) head._prev = link;
  return link;
}

export function insertObserverHead(head: IObserverLink | null, link: IObserverLink) {
  link._prev = null;
  link._next = head;
  if (head !== null) head._prev = link;
  return link;
}

export function removeSourceLink(head: ISourceLink | null, link: ISourceLink) {
  const prev = link._prev;
  const next = link._next;

  if (prev) prev._next = next;
  if (next) next._prev = prev;
  if (head === link) head = next;

  link._prev = link._next = null;
  return head;
}

export function removeObserverLink(head: IObserverLink | null, link: IObserverLink) {
  const prev = link._prev;
  const next = link._next;

  if (prev) prev._next = next;
  if (next) next._prev = prev;
  if (head === link) head = next;

  link._prev = link._next = null;
  return head;
}
