# Generates the schedule-experiment overlays from dev's findEdge.ts / tape.ts:
#   python generate.py <dev findEdge.ts> <dev tape.ts> <out dir>
# Every variant keeps findEdgeInLockstep byte-identical; only the finger
# continuation changes. Frozen controller: in record mode (fz.mode 0) the
# finger path is dev's own code with live strikes, and one bit per finger
# lookup records whether it struck; in replay mode (fz.mode 2) the variant
# race runs with no strike at all and the recorded strike is replayed at the
# end of the lookup (before findEdgeInLockstep's hint write, as in dev).
import sys

fe_src, tape_src, out = sys.argv[1:4]


def rep(s, a, b):
    assert s.count(a) == 1, a[:70]
    return s.replace(a, b)


# ---- tape.ts: frozen controller hooks -------------------------------------
t = open(tape_src, encoding="utf8").read()
t = rep(
    t,
    "export var preparedOwner: ReactiveNode | null = null;",
    """// SCHEDULE RESEARCH: frozen controller. globalThis.__fz = { mode: 0 record | 2 replay, bits, n, i, h, prepares, releases }.
const FZ: any = ((globalThis as any).__fz ??= { mode: 0, bits: new Uint8Array(1 << 16), n: 0, i: 0, h: 0, prepares: 0, releases: 0 });
export const fzRecording: boolean = FZ.mode === 0;
/** Boundary control padding: a consumer that never occurs, and a sink terser cannot drop. */
export var fzNever: ReactiveNode | null = null;
export const fzBox: any = FZ;
export var fzStrikeCalls = 0;
const fzMix = (x: number): void => { FZ.h = Math.imul(FZ.h ^ x, 0x9e3779b1) >>> 0; };
/** Record mode: a finger lookup finished; whether it struck. */
export function fzNoteFinger(struck: boolean): void {
  if (FZ.n === FZ.bits.length) { const grown = new Uint8Array(FZ.bits.length * 2); grown.set(FZ.bits); FZ.bits = grown; }
  FZ.bits[FZ.n++] = struck ? 1 : 0;
}
/** Replay mode: the strike dev's race made in this finger lookup. */
export function fzReplayFinger(consumer: ReactiveNode): void {
  if (FZ.bits[FZ.i++] === 1) void recordStrikeAndMaybePrepareTape(consumer);
}
export var preparedOwner: ReactiveNode | null = null;""",
)
t = rep(
    t,
    "function releaseLease(owner: ReactiveNode): void {\n",
    "function releaseLease(owner: ReactiveNode): void {\n  FZ.releases++; fzMix(0x51 ^ preparedPassStamp);\n",
)
t = rep(
    t,
    "function recordStrikeAndMaybePrepareTape(consumer: ReactiveNode): boolean {\n",
    "function recordStrikeAndMaybePrepareTape(consumer: ReactiveNode): boolean {\n  fzStrikeCalls++;\n",
)
t = rep(
    t,
    """  preparedOwner = consumer;
  preparedPassStamp = passStamp;
  hasFullTapeCoverage = allProducersCovered;""",
    """  preparedOwner = consumer;
  preparedPassStamp = passStamp;
  hasFullTapeCoverage = allProducersCovered;
  FZ.prepares++; fzMix(passStamp); fzMix(consumer.firstIn === null ? -1 : (consumer.firstIn.from.payload as number));""",
)
open(f"{out}/tape.ts.txt", "w", encoding="utf8", newline="\n").write(t)

# ---- findEdge.ts -----------------------------------------------------------
f = open(fe_src, encoding="utf8").read()
f = rep(
    f,
    """  strikeOnFarFingerHit,
} from "./tape";""",
    """  strikeOnFarFingerHit,
  fzRecording,
  fzStrikeCalls,
  fzNoteFinger,
  fzReplayFinger,
  fzNever,
  fzBox,
} from "./tape";""",
)
# Dev's finger continuation becomes the record-mode path; the owner's
# certificate moves to the new entry.
f = rep(f, "function findEdgeInLockstepFromFinger(\n", "function findEdgeInLockstepFromFingerLive(\n")
f = rep(
    f,
    """  if (
    preparedOwner === consumer &&
    preparedMissIsAbsent(producer, consumer) === true
  ) {
    return null;
  }

  let after = finger.nextOut ?? producer.firstOut!;""",
    """  let after = finger.nextOut ?? producer.firstOut!;""",
)

INCOMING = """    if (back !== null) {
      if (back.from === producer) return back;
      back = back.prevIn;
    }
    if (ahead !== null) {
      if (ahead.from === producer) return ahead;
      ahead = ahead.nextIn;
    } else if (back === null) {
      return null;
    }
"""

SIGNATURE = """(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  finger: ReactiveEdge,
  out: ReactiveEdge | null,
  back: ReactiveEdge | null,
  ahead: ReactiveEdge | null,
): ReactiveEdge | null {
"""

ENTRY = (
    """/**
 * Finger continuation (schedule research): the owner's certificate, then in
 * record mode dev's race with live strikes (one trace bit per lookup), in
 * replay mode the variant race without strikes and the recorded strike.
 */
function findEdgeInLockstepFromFinger"""
    + SIGNATURE
    + """  if (
    preparedOwner === consumer &&
    preparedMissIsAbsent(producer, consumer) === true
  ) {
    return null;
  }
  if (fzRecording === true) {
    const before = fzStrikeCalls;
    const live = findEdgeInLockstepFromFingerLive(producer, consumer, finger, out, back, ahead);
    if (fzStrikeCalls - before > 1) throw new Error("fz: two strikes in one finger lookup");
    fzNoteFinger(fzStrikeCalls !== before);
    return live;
  }
  const edge = RACE(producer, consumer, finger, out, back, ahead);
  fzReplayFinger(consumer);
  return edge;
}

/** The lockstep after the race, without strikes; the owner's certificate first. */
function findEdgeInLockstepQuiet(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  out: ReactiveEdge | null,
  back: ReactiveEdge | null,
  ahead: ReactiveEdge | null,
): ReactiveEdge | null {
  if (
    preparedOwner === consumer &&
    preparedMissIsAbsent(producer, consumer) === true
  ) {
    return null;
  }
  while (out !== null) {
    if (out.to === consumer) return out;
    out = out.nextOut;
"""
    + INCOMING
    + """  }
  return null;
}
"""
)


def race_half(early):
    # Dev's schedule: 16 steps, base on odd steps, finger on even steps
    # (after, before alternately), incoming on every step. Fingers do not
    # advance in the far end (steps 12-15), as in dev.
    e = "      if (out === null) return null;\n" if early else ""
    return (
        "/** Dev's 50/50 race without strikes"
        + (", early outgoing certificate" if early else "")
        + ". */\nfunction raceHalf"
        + SIGNATURE
        + """  let after = finger.nextOut ?? producer.firstOut!;
  let before = finger.prevOut ?? producer.lastOut!;
  for (let step = 0; step < 16; step++) {
    if ((step & FIRST_WALK) === 1) {
      if (out === null) return null;
      if (out.to === consumer) return out;
      out = out.nextOut;
"""
        + e
        + """    } else if ((step & SECOND_WALK) === 0) {
      if (after.to === consumer) return after;
      if (step < FAR_FINGER_STEP) after = after.nextOut ?? producer.firstOut!;
    } else {
      if (before.to === consumer) return before;
      if (step < FAR_FINGER_STEP) before = before.prevOut ?? producer.lastOut!;
    }
"""
        + INCOMING
        + """  }
  return findEdgeInLockstepQuiet(producer, consumer, out, back, ahead);
}
"""
    )


def race_rounds(early, incoming_twice):
    # Proof-preserving: every round advances the base outgoing walk and the
    # incoming walkers; the finger only adds one probe (after, before
    # alternately). 8 rounds = dev's 8 base and 4 + 4 finger probes.
    e = "    if (out === null) return null;\n" if early else ""
    inc = INCOMING + (INCOMING if incoming_twice else "")
    return (
        "/** Proof-preserving rounds: base, one finger probe, incoming"
        + (" x2" if incoming_twice else "")
        + ("; early outgoing certificate" if early else "")
        + ". */\nfunction raceRounds"
        + SIGNATURE
        + """  let after = finger.nextOut ?? producer.firstOut!;
  let before = finger.prevOut ?? producer.lastOut!;
  for (let round = 0; round < 8; round++) {
    if (out === null) return null;
    if (out.to === consumer) return out;
    out = out.nextOut;
"""
        + e
        + """    if ((round & 1) === 0) {
      if (after.to === consumer) return after;
      after = after.nextOut ?? producer.firstOut!;
    } else {
      if (before.to === consumer) return before;
      before = before.prevOut ?? producer.lastOut!;
    }
"""
        + inc
        + """  }
  return findEdgeInLockstepQuiet(producer, consumer, out, back, ahead);
}
"""
    )


def race_finger_first_rounds():
    # Proof-preserving, finger first: one finger probe, then the base outgoing
    # step (early certificate), then incoming. A finger that hits at once costs
    # one probe, as in dev; every round still advances P.out and C.in.
    return (
        "/** Proof-preserving rounds, finger first: finger probe, base, early outgoing certificate, incoming. */\nfunction raceRounds"
        + SIGNATURE
        + """  let after = finger.nextOut ?? producer.firstOut!;
  let before = finger.prevOut ?? producer.lastOut!;
  for (let round = 0; round < 8; round++) {
    if ((round & 1) === 0) {
      if (after.to === consumer) return after;
      after = after.nextOut ?? producer.firstOut!;
    } else {
      if (before.to === consumer) return before;
      before = before.prevOut ?? producer.lastOut!;
    }
    if (out === null) return null;
    if (out.to === consumer) return out;
    out = out.nextOut;
    if (out === null) return null;
"""
        + INCOMING
        + """  }
  return findEdgeInLockstepQuiet(producer, consumer, out, back, ahead);
}
"""
    )


AUTHORITATIVE_ROUND = """    if (out === null) return null;
    if (out.to === consumer) return out;
    out = out.nextOut;
    if (out === null) return null;
""" + INCOMING

# The escalated race: finger-first rounds (as ffrounds-early) continuing from
# walkers a prelude already moved. `before` is created here, on escalation.
ESCALATED = """/** Escalated race: finger-first rounds from `firstRound`; the backward finger is created here. */
function raceEscalated(
  producer: ReactiveNode,
  consumer: ReactiveNode,
  finger: ReactiveEdge,
  after: ReactiveEdge,
  before: ReactiveEdge | null,
  firstRound: number,
  out: ReactiveEdge | null,
  back: ReactiveEdge | null,
  ahead: ReactiveEdge | null,
): ReactiveEdge | null {
  let behind = before ?? finger.prevOut ?? producer.lastOut!;
  for (let round = firstRound; round < 8; round++) {
    if ((round & 1) === 0) {
      if (after.to === consumer) return after;
      after = after.nextOut ?? producer.firstOut!;
    } else {
      if (behind.to === consumer) return behind;
      behind = behind.prevOut ?? producer.lastOut!;
    }
""" + AUTHORITATIVE_ROUND.replace("\n    ", "\n    ") + """  }
  return findEdgeInLockstepQuiet(producer, consumer, out, back, ahead);
}
"""


def race_prelude(rounds):
    # Lazy escalation: one forward finger probe; then `rounds` authoritative
    # rounds (base with early certificate, incoming) so a short proof ends
    # before any further finger walker exists; then the escalated race.
    return (
        f"/** Lazy escalation: forward finger probe, {rounds} authoritative rounds, then the escalated race. */\nfunction racePrelude"
        + SIGNATURE
        + """  let after = finger.nextOut ?? producer.firstOut!;
  if (after.to === consumer) return after;
  after = after.nextOut ?? producer.firstOut!;
  for (let round = 0; round < """ + str(rounds) + """; round++) {
""" + AUTHORITATIVE_ROUND + """  }
  return raceEscalated(producer, consumer, finger, after, null, 1, out, back, ahead);
}
""" + "\n" + ESCALATED
    )


def race_staged():
    # Staged escalation: each finger miss doubles the authoritative rounds
    # that follow it (1, 2, 4), then the escalated race.
    def rounds(n):
        return "  for (let round = 0; round < " + str(n) + "; round++) {\n" + AUTHORITATIVE_ROUND + "  }\n"
    return (
        "/** Staged escalation: finger probe, 1 round, finger probe, 2 rounds, finger probe, 4 rounds, then the escalated race. */\nfunction raceStaged"
        + SIGNATURE
        + """  let after = finger.nextOut ?? producer.firstOut!;
  if (after.to === consumer) return after;
  after = after.nextOut ?? producer.firstOut!;
""" + rounds(1) + """  let before = finger.prevOut ?? producer.lastOut!;
  if (before.to === consumer) return before;
  before = before.prevOut ?? producer.lastOut!;
""" + rounds(2) + """  if (after.to === consumer) return after;
  after = after.nextOut ?? producer.firstOut!;
""" + rounds(4) + """  return raceEscalated(producer, consumer, finger, after, before, 3, out, back, ahead);
}
""" + "\n" + ESCALATED
    )


def race_none(padded):
    # Control for the call boundary: no finger at all, the plain lockstep
    # from the head start. `padded` adds a branch that never runs (consumer
    # is never fzNever) whose bytecode pushes the function past the caller's
    # remaining TurboFan inlining budget, so the same executed loop stays a
    # call; unpadded, it is small enough to inline.
    pad = ""
    if padded:
        pad = "  if (consumer === fzNever) {\n" + "".join(
            f"    fzBox.sink = (fzBox.sink + producer.state + {i}) | 0;\n" for i in range(24)
        ) + "    return null;\n  }\n"
    name = "raceNoneCall" if padded else "raceNoneInline"
    return (
        f"/** Boundary control: no finger, plain lockstep{', padded to stay a call' if padded else ''}. */\nfunction {name}"
        + SIGNATURE
        + pad
        + """  while (out !== null) {
    if (out.to === consumer) return out;
    out = out.nextOut;
""" + INCOMING + """  }
  return null;
}
"""
    )


variants = {
    "half": ("raceHalf", race_half(False)),
    "half-early": ("raceHalf", race_half(True)),
    "rounds": ("raceRounds", race_rounds(False, False)),
    "rounds-early": ("raceRounds", race_rounds(True, False)),
    "rounds2-early": ("raceRounds", race_rounds(True, True)),
    "ffrounds-early": ("raceRounds", race_finger_first_rounds()),
    "pre4": ("racePrelude", race_prelude(4)),
    "pre8": ("racePrelude", race_prelude(8)),
    "staged": ("raceStaged", race_staged()),
    "nofinger-inline": ("raceNoneInline", race_none(False)),
    "nofinger-call": ("raceNoneCall", race_none(True)),
}
anchor = "/**\n * The far end of the finger race"
for name, (fn, body) in variants.items():
    v = rep(f, anchor, ENTRY.replace("RACE", fn) + "\n" + body + "\n" + anchor)
    open(f"{out}/findEdge.{name}.ts.txt", "w", encoding="utf8", newline="\n").write(v)
print("ok", list(variants))
