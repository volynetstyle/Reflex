/**
 * Event prop names understood by the DOM renderer.
 *
 * The renderer resolves `onName` by lowercasing `Name` (see
 * `host/events.ts`), except for the explicit aliases in
 * {@link CompatibilityNativeDOMEventPropMap}. Every non-alias entry below
 * therefore satisfies `Lowercase<Name> === event`, which
 * `test/types.typecheck.tsx` asserts so the typed surface cannot drift from
 * the runtime resolution.
 *
 * Names that need their case preserved (for example SVG `beginEvent`) are
 * only reachable through the `on:` form.
 */

/** Events defined on `Element` by the Fullscreen API. */
type ElementNativeDOMEventPropMap = {
  onFullscreenChange: "fullscreenchange";
  onFullscreenError: "fullscreenerror";
};

/**
 * Events of the HTML `GlobalEventHandlers` mixin, including the ones it
 * imports from UI Events, Pointer Events, Touch Events, CSS Animations,
 * CSS Transitions, Clipboard, Selection and CSP.
 */
type GlobalNativeDOMEventPropMap = {
  onAbort: "abort";
  onAnimationCancel: "animationcancel";
  onAnimationEnd: "animationend";
  onAnimationIteration: "animationiteration";
  onAnimationStart: "animationstart";
  onAuxClick: "auxclick";
  onBeforeInput: "beforeinput";
  onBeforeMatch: "beforematch";
  onBeforeToggle: "beforetoggle";
  onBlur: "blur";
  onCancel: "cancel";
  onCanPlay: "canplay";
  onCanPlayThrough: "canplaythrough";
  onChange: "change";
  onClick: "click";
  onClose: "close";
  onCommand: "command";
  onCompositionEnd: "compositionend";
  onCompositionStart: "compositionstart";
  onCompositionUpdate: "compositionupdate";
  onContextLost: "contextlost";
  onContextMenu: "contextmenu";
  onContextRestored: "contextrestored";
  onCopy: "copy";
  onCueChange: "cuechange";
  onCut: "cut";
  onDblClick: "dblclick";
  onDrag: "drag";
  onDragEnd: "dragend";
  onDragEnter: "dragenter";
  onDragLeave: "dragleave";
  onDragOver: "dragover";
  onDragStart: "dragstart";
  onDrop: "drop";
  onDurationChange: "durationchange";
  onEmptied: "emptied";
  onEnded: "ended";
  onError: "error";
  onFocus: "focus";
  onFocusIn: "focusin";
  onFocusOut: "focusout";
  onFormData: "formdata";
  onGotPointerCapture: "gotpointercapture";
  onInput: "input";
  onInvalid: "invalid";
  onKeyDown: "keydown";
  onKeyPress: "keypress";
  onKeyUp: "keyup";
  onLoad: "load";
  onLoadedData: "loadeddata";
  onLoadedMetadata: "loadedmetadata";
  onLoadStart: "loadstart";
  onLostPointerCapture: "lostpointercapture";
  onMouseDown: "mousedown";
  onMouseEnter: "mouseenter";
  onMouseLeave: "mouseleave";
  onMouseMove: "mousemove";
  onMouseOut: "mouseout";
  onMouseOver: "mouseover";
  onMouseUp: "mouseup";
  onPaste: "paste";
  onPause: "pause";
  onPlay: "play";
  onPlaying: "playing";
  onPointerCancel: "pointercancel";
  onPointerDown: "pointerdown";
  onPointerEnter: "pointerenter";
  onPointerLeave: "pointerleave";
  onPointerMove: "pointermove";
  onPointerOut: "pointerout";
  onPointerOver: "pointerover";
  onPointerRawUpdate: "pointerrawupdate";
  onPointerUp: "pointerup";
  onProgress: "progress";
  onRateChange: "ratechange";
  onReset: "reset";
  onResize: "resize";
  onScroll: "scroll";
  onScrollEnd: "scrollend";
  onSecurityPolicyViolation: "securitypolicyviolation";
  onSeeked: "seeked";
  onSeeking: "seeking";
  onSelect: "select";
  onSelectionChange: "selectionchange";
  onSelectStart: "selectstart";
  onSlotChange: "slotchange";
  onStalled: "stalled";
  onSubmit: "submit";
  onSuspend: "suspend";
  onTimeUpdate: "timeupdate";
  onToggle: "toggle";
  onTouchCancel: "touchcancel";
  onTouchEnd: "touchend";
  onTouchMove: "touchmove";
  onTouchStart: "touchstart";
  onTransitionCancel: "transitioncancel";
  onTransitionEnd: "transitionend";
  onTransitionRun: "transitionrun";
  onTransitionStart: "transitionstart";
  onVolumeChange: "volumechange";
  onWaiting: "waiting";
  onWebkitAnimationEnd: "webkitanimationend";
  onWebkitAnimationIteration: "webkitanimationiteration";
  onWebkitAnimationStart: "webkitanimationstart";
  onWebkitTransitionEnd: "webkittransitionend";
  onWheel: "wheel";
};

/**
 * Element events defined outside HTML: CSS Containment
 * (`contentvisibilityautostatechange`) and CSS Scroll Snap 2
 * (`scrollsnapchange`, `scrollsnapchanging`).
 */
type CSSNativeDOMEventPropMap = {
  onContentVisibilityAutoStateChange: "contentvisibilityautostatechange";
  onScrollSnapChange: "scrollsnapchange";
  onScrollSnapChanging: "scrollsnapchanging";
};

/** `HTMLMediaElement` events from Encrypted Media Extensions. */
type MediaNativeDOMEventPropMap = {
  onEncrypted: "encrypted";
  onWaitingForKey: "waitingforkey";
};

/** `HTMLVideoElement` events from Picture-in-Picture. */
type VideoNativeDOMEventPropMap = {
  onEnterPictureInPicture: "enterpictureinpicture";
  onLeavePictureInPicture: "leavepictureinpicture";
};

/**
 * Events of the HTML `WindowEventHandlers` mixin.
 *
 * They are dispatched at `Window`. The renderer forwards these listeners from
 * `<body>` and `<frameset>` to the element's `Window`, as the HTML event
 * handler attributes do; no other element has these props.
 */
export type WindowNativeDOMEventPropMap = {
  onAfterPrint: "afterprint";
  onBeforePrint: "beforeprint";
  onBeforeUnload: "beforeunload";
  onGamepadConnected: "gamepadconnected";
  onGamepadDisconnected: "gamepaddisconnected";
  onHashChange: "hashchange";
  onLanguageChange: "languagechange";
  onMessage: "message";
  onMessageError: "messageerror";
  onOffline: "offline";
  onOnline: "online";
  onPageHide: "pagehide";
  onPageReveal: "pagereveal";
  onPageShow: "pageshow";
  onPageSwap: "pageswap";
  onPopState: "popstate";
  onRejectionHandled: "rejectionhandled";
  onStorage: "storage";
  onUnhandledRejection: "unhandledrejection";
  onUnload: "unload";
};

/**
 * Props whose event name is not their lowercased suffix. `onDoubleClick` is a
 * runtime alias; `onDragExit` is non-standard but kept as an escape hatch for
 * engines that still fire it.
 */
export type CompatibilityNativeDOMEventPropMap = {
  onDoubleClick: "dblclick";
  /**
   * Non-standard and patchily implemented, but still useful as an escape hatch.
   */
  onDragExit: "dragexit";
};

/** Event props that are resolved by lowercasing the name after `on`. */
export type StandardNativeDOMEventPropMap = ElementNativeDOMEventPropMap &
  GlobalNativeDOMEventPropMap &
  CSSNativeDOMEventPropMap &
  MediaNativeDOMEventPropMap &
  VideoNativeDOMEventPropMap &
  WindowNativeDOMEventPropMap;

/** Every `onName` event prop the renderer types on elements. */
export type NativeDOMEventPropMap = StandardNativeDOMEventPropMap &
  CompatibilityNativeDOMEventPropMap;

export type NativeDOMEventPropName = keyof NativeDOMEventPropMap;
export type NativeDOMEventName = NativeDOMEventPropMap[NativeDOMEventPropName];
