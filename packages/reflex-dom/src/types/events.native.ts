type ElementNativeDOMEventPropMap = {
  onFullscreenChange: "fullscreenchange";
  onFullscreenError: "fullscreenerror";
};

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

type WindowNativeDOMEventPropMap = {
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

type MediaNativeDOMEventPropMap = {
  onEncrypted: "encrypted";
  onWaitingForKey: "waitingforkey";
};

type VideoNativeDOMEventPropMap = {
  onEnterPictureInPicture: "enterpictureinpicture";
  onLeavePictureInPicture: "leavepictureinpicture";
};

export type CompatibilityNativeDOMEventPropMap = {
  onDoubleClick: "dblclick";
  /**
   * Non-standard and patchily implemented, but still useful as an escape hatch.
   */
  onDragExit: "dragexit";
};

export type NativeDOMEventPropMap = ElementNativeDOMEventPropMap &
  GlobalNativeDOMEventPropMap &
  WindowNativeDOMEventPropMap &
  MediaNativeDOMEventPropMap &
  VideoNativeDOMEventPropMap &
  CompatibilityNativeDOMEventPropMap;

export type NativeDOMEventPropName = keyof NativeDOMEventPropMap;
export type NativeDOMEventName = NativeDOMEventPropMap[NativeDOMEventPropName];
