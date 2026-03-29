export type DOMEvent<T extends EventTarget, E extends Event = Event> = E & {
  readonly currentTarget: T;
};

export type DOMEventHandler<T extends EventTarget, E extends Event = Event> = (
  event: DOMEvent<T, E>,
) => void;

export interface DOMEventListenerObject<
  T extends EventTarget,
  E extends Event = Event,
> extends AddEventListenerOptions {
  handleEvent(event: DOMEvent<T, E>): void;
}

export type DOMEventHandlerProp<
  T extends EventTarget,
  E extends Event = Event,
> = DOMEventHandler<T, E> | DOMEventListenerObject<T, E>;

type ResolveEvent<
  Events extends object,
  Name extends string,
> = Name extends keyof Events ? Extract<Events[Name], Event> : Event;

export type DOMEventProps<T extends Element, Events extends object> = {
  onAbort?: DOMEventHandlerProp<T, ResolveEvent<Events, "abort">>;
  onAnimationCancel?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "animationcancel">
  >;
  onAnimationEnd?: DOMEventHandlerProp<T, ResolveEvent<Events, "animationend">>;
  onAnimationIteration?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "animationiteration">
  >;
  onAnimationStart?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "animationstart">
  >;
  onAuxClick?: DOMEventHandlerProp<T, ResolveEvent<Events, "auxclick">>;
  onBeforeInput?: DOMEventHandlerProp<T, ResolveEvent<Events, "beforeinput">>;
  onBeforeMatch?: DOMEventHandlerProp<T, ResolveEvent<Events, "beforematch">>;
  onBeforeToggle?: DOMEventHandlerProp<T, ResolveEvent<Events, "beforetoggle">>;
  onBlur?: DOMEventHandlerProp<T, ResolveEvent<Events, "blur">>;
  onCancel?: DOMEventHandlerProp<T, ResolveEvent<Events, "cancel">>;
  onCanPlay?: DOMEventHandlerProp<T, ResolveEvent<Events, "canplay">>;
  onCanPlayThrough?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "canplaythrough">
  >;
  onChange?: DOMEventHandlerProp<T, ResolveEvent<Events, "change">>;
  onClick?: DOMEventHandlerProp<T, ResolveEvent<Events, "click">>;
  onClose?: DOMEventHandlerProp<T, ResolveEvent<Events, "close">>;
  onCompositionEnd?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "compositionend">
  >;
  onCompositionStart?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "compositionstart">
  >;
  onCompositionUpdate?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "compositionupdate">
  >;
  onContextMenu?: DOMEventHandlerProp<T, ResolveEvent<Events, "contextmenu">>;
  onCopy?: DOMEventHandlerProp<T, ResolveEvent<Events, "copy">>;
  onCut?: DOMEventHandlerProp<T, ResolveEvent<Events, "cut">>;
  onDblClick?: DOMEventHandlerProp<T, ResolveEvent<Events, "dblclick">>;
  onDoubleClick?: DOMEventHandlerProp<T, ResolveEvent<Events, "dblclick">>;
  onDrag?: DOMEventHandlerProp<T, ResolveEvent<Events, "drag">>;
  onDragEnd?: DOMEventHandlerProp<T, ResolveEvent<Events, "dragend">>;
  onDragEnter?: DOMEventHandlerProp<T, ResolveEvent<Events, "dragenter">>;
  onDragExit?: DOMEventHandlerProp<T, ResolveEvent<Events, "dragexit">>;
  onDragLeave?: DOMEventHandlerProp<T, ResolveEvent<Events, "dragleave">>;
  onDragOver?: DOMEventHandlerProp<T, ResolveEvent<Events, "dragover">>;
  onDragStart?: DOMEventHandlerProp<T, ResolveEvent<Events, "dragstart">>;
  onDrop?: DOMEventHandlerProp<T, ResolveEvent<Events, "drop">>;
  onDurationChange?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "durationchange">
  >;
  onEmptied?: DOMEventHandlerProp<T, ResolveEvent<Events, "emptied">>;
  onEnded?: DOMEventHandlerProp<T, ResolveEvent<Events, "ended">>;
  onError?: DOMEventHandlerProp<T, ResolveEvent<Events, "error">>;
  onFocus?: DOMEventHandlerProp<T, ResolveEvent<Events, "focus">>;
  onFocusIn?: DOMEventHandlerProp<T, ResolveEvent<Events, "focusin">>;
  onFocusOut?: DOMEventHandlerProp<T, ResolveEvent<Events, "focusout">>;
  onFormData?: DOMEventHandlerProp<T, ResolveEvent<Events, "formdata">>;
  onGotPointerCapture?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "gotpointercapture">
  >;
  onInput?: DOMEventHandlerProp<T, ResolveEvent<Events, "input">>;
  onInvalid?: DOMEventHandlerProp<T, ResolveEvent<Events, "invalid">>;
  onKeyDown?: DOMEventHandlerProp<T, ResolveEvent<Events, "keydown">>;
  onKeyUp?: DOMEventHandlerProp<T, ResolveEvent<Events, "keyup">>;
  onLoad?: DOMEventHandlerProp<T, ResolveEvent<Events, "load">>;
  onLoadedData?: DOMEventHandlerProp<T, ResolveEvent<Events, "loadeddata">>;
  onLoadedMetadata?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "loadedmetadata">
  >;
  onLoadStart?: DOMEventHandlerProp<T, ResolveEvent<Events, "loadstart">>;
  onLostPointerCapture?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "lostpointercapture">
  >;
  onMouseDown?: DOMEventHandlerProp<T, ResolveEvent<Events, "mousedown">>;
  onMouseEnter?: DOMEventHandlerProp<T, ResolveEvent<Events, "mouseenter">>;
  onMouseLeave?: DOMEventHandlerProp<T, ResolveEvent<Events, "mouseleave">>;
  onMouseMove?: DOMEventHandlerProp<T, ResolveEvent<Events, "mousemove">>;
  onMouseOut?: DOMEventHandlerProp<T, ResolveEvent<Events, "mouseout">>;
  onMouseOver?: DOMEventHandlerProp<T, ResolveEvent<Events, "mouseover">>;
  onMouseUp?: DOMEventHandlerProp<T, ResolveEvent<Events, "mouseup">>;
  onPaste?: DOMEventHandlerProp<T, ResolveEvent<Events, "paste">>;
  onPause?: DOMEventHandlerProp<T, ResolveEvent<Events, "pause">>;
  onPlay?: DOMEventHandlerProp<T, ResolveEvent<Events, "play">>;
  onPlaying?: DOMEventHandlerProp<T, ResolveEvent<Events, "playing">>;
  onPointerCancel?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "pointercancel">
  >;
  onPointerDown?: DOMEventHandlerProp<T, ResolveEvent<Events, "pointerdown">>;
  onPointerEnter?: DOMEventHandlerProp<T, ResolveEvent<Events, "pointerenter">>;
  onPointerLeave?: DOMEventHandlerProp<T, ResolveEvent<Events, "pointerleave">>;
  onPointerMove?: DOMEventHandlerProp<T, ResolveEvent<Events, "pointermove">>;
  onPointerOut?: DOMEventHandlerProp<T, ResolveEvent<Events, "pointerout">>;
  onPointerOver?: DOMEventHandlerProp<T, ResolveEvent<Events, "pointerover">>;
  onPointerUp?: DOMEventHandlerProp<T, ResolveEvent<Events, "pointerup">>;
  onProgress?: DOMEventHandlerProp<T, ResolveEvent<Events, "progress">>;
  onRateChange?: DOMEventHandlerProp<T, ResolveEvent<Events, "ratechange">>;
  onReset?: DOMEventHandlerProp<T, ResolveEvent<Events, "reset">>;
  onScroll?: DOMEventHandlerProp<T, ResolveEvent<Events, "scroll">>;
  onScrollEnd?: DOMEventHandlerProp<T, ResolveEvent<Events, "scrollend">>;
  onSecurityPolicyViolation?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "securitypolicyviolation">
  >;
  onSeeked?: DOMEventHandlerProp<T, ResolveEvent<Events, "seeked">>;
  onSeeking?: DOMEventHandlerProp<T, ResolveEvent<Events, "seeking">>;
  onSelect?: DOMEventHandlerProp<T, ResolveEvent<Events, "select">>;
  onSelectionChange?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "selectionchange">
  >;
  onSlotChange?: DOMEventHandlerProp<T, ResolveEvent<Events, "slotchange">>;
  onStalled?: DOMEventHandlerProp<T, ResolveEvent<Events, "stalled">>;
  onSubmit?: DOMEventHandlerProp<T, ResolveEvent<Events, "submit">>;
  onSuspend?: DOMEventHandlerProp<T, ResolveEvent<Events, "suspend">>;
  onTimeUpdate?: DOMEventHandlerProp<T, ResolveEvent<Events, "timeupdate">>;
  onToggle?: DOMEventHandlerProp<T, ResolveEvent<Events, "toggle">>;
  onTouchCancel?: DOMEventHandlerProp<T, ResolveEvent<Events, "touchcancel">>;
  onTouchEnd?: DOMEventHandlerProp<T, ResolveEvent<Events, "touchend">>;
  onTouchMove?: DOMEventHandlerProp<T, ResolveEvent<Events, "touchmove">>;
  onTouchStart?: DOMEventHandlerProp<T, ResolveEvent<Events, "touchstart">>;
  onTransitionCancel?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "transitioncancel">
  >;
  onTransitionEnd?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "transitionend">
  >;
  onTransitionRun?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "transitionrun">
  >;
  onTransitionStart?: DOMEventHandlerProp<
    T,
    ResolveEvent<Events, "transitionstart">
  >;
  onVolumeChange?: DOMEventHandlerProp<T, ResolveEvent<Events, "volumechange">>;
  onWaiting?: DOMEventHandlerProp<T, ResolveEvent<Events, "waiting">>;
  onWheel?: DOMEventHandlerProp<T, ResolveEvent<Events, "wheel">>;
} & {
  [K in keyof Events & string as `on:${K}`]?: DOMEventHandlerProp<
    T,
    Extract<Events[K], Event>
  >;
};
