# Settlement counters for a generated schedule overlay (counts only, never
# timed): which walker settles each finger lookup, and the probes spent.
#   python instrument.py <findEdge.<variant>.ts.txt> <out file>
import re
import sys

src, out = sys.argv[1:3]
text = open(src, encoding="utf8").read()

header = 'const SC: any = ((globalThis as any).__sched ??= {});\n'
text = text.replace("/**\n * Find the edge `producer -> consumer`", header + "/**\n * Find the edge `producer -> consumer`", 1)


def body_of(name):
    start = text.index(f"function {name}(")
    depth, i, opened = 0, text.index("{\n", text.index("): ReactiveEdge | null", start)), False
    while True:
        c = text[i]
        if c == "{":
            depth += 1
            opened = True
        elif c == "}":
            depth -= 1
            if opened and depth == 0:
                return start, i + 1
        i += 1


def instrument(block, tag):
    rules = [
        ("if (out === null) return null;", "if (out === null) { SC.nullOut++; return null; }"),
        ("if (out.to === consumer) return out;", "SC.pBase++; if (out.to === consumer) { SC.byOut++; return out; }"),
        ("if (after.to === consumer) return after;", "SC.pFinger++; if (after.to === consumer) { SC.byFinger++; return after; }"),
        ("if (before.to === consumer) return before;", "SC.pFinger++; if (before.to === consumer) { SC.byFinger++; return before; }"),
        ("if (back.from === producer) return back;", "SC.pIn++; if (back.from === producer) { SC.byBack++; return back; }"),
        ("if (ahead.from === producer) return ahead;", "SC.pIn++; if (ahead.from === producer) { SC.byAhead++; return ahead; }"),
        ("} else if (back === null) {\n      return null;", "} else if (back === null) {\n      SC.nullIn++; return null;"),
    ]
    for a, b in rules:
        block = block.replace(a, b)
    if tag == "quiet":
        block = block.replace(
            "preparedMissIsAbsent(producer, consumer) === true\n  ) {\n    return null;",
            "preparedMissIsAbsent(producer, consumer) === true\n  ) {\n    SC.byTape++; return null;",
            1,
        )
        block = block.replace("  while (out !== null) {", "  SC.tail++;\n  while (out !== null) {", 1)
        # The quiet tail's own settlements are attributed with a "tail" prefix.
        for k in ["nullOut", "pBase", "byOut", "pIn", "byBack", "byAhead", "nullIn"]:
            block = block.replace(f"SC.{k}++", f"SC.tail_{k}++")
    else:
        block = block.replace("  let after = finger.nextOut", "  SC.races++;\n  let after = finger.nextOut", 1)
    return block


for name, tag in [("raceHalf", "race"), ("raceRounds", "race"), ("findEdgeInLockstepQuiet", "quiet")]:
    if f"function {name}(" not in text:
        continue
    s, e = body_of(name)
    text = text[:s] + instrument(text[s:e], tag) + text[e:]

# Owner certificate at the finger entry, before any race.
entry = text.index("function findEdgeInLockstepFromFinger(")
cert = "preparedMissIsAbsent(producer, consumer) === true\n  ) {\n    return null;"
at = text.index(cert, entry)
text = text[:at] + cert.replace("return null;", "SC.certEntry++; return null;") + text[at + len(cert):]
assert re.search(r"SC\.byOut", text) and "SC.tail++" in text

# --dist: before every replayed race, a read-only counterfactual: does the
# first forward finger probe hit; if not, how many authoritative rounds (base
# with early certificate, then incoming) a plain lockstep needs to settle and
# how, and at which ring probe (2..8, after/before alternately) the finger
# would have hit.
if len(sys.argv) > 3 and sys.argv[3] == "--dist":
    DIST = r'''
function scBucket(rounds: number): string {
  return rounds <= 1 ? "1" : rounds <= 2 ? "2" : rounds <= 4 ? "4" : rounds <= 8 ? "8" : rounds <= 16 ? "16" : ">16";
}
function scDist(producer: ReactiveNode, consumer: ReactiveNode, finger: ReactiveEdge, out: ReactiveEdge | null, back: ReactiveEdge | null, ahead: ReactiveEdge | null): void {
  let after = finger.nextOut ?? producer.firstOut!;
  if (after.to === consumer) { SC.f1Hit++; return; }
  SC.f1Miss++;
  let ringAt = 0;
  let before = finger.prevOut ?? producer.lastOut!;
  after = after.nextOut ?? producer.firstOut!;
  for (let probe = 2; probe <= 8 && ringAt === 0; probe++) {
    if ((probe & 1) === 0) { if (before.to === consumer) ringAt = probe; before = before.prevOut ?? producer.lastOut!; }
    else { if (after.to === consumer) ringAt = probe; after = after.nextOut ?? producer.firstOut!; }
  }
  let rounds = 0;
  let how = "";
  for (;;) {
    rounds++;
    if (out === null) { how = "out0"; break; }
    if (out.to === consumer) { how = "out"; break; }
    out = out.nextOut;
    if (out === null) { how = "out0"; break; }
    if (back !== null) { if (back.from === producer) { how = "back"; break; } back = back.prevIn; }
    if (ahead !== null) { if (ahead.from === producer) { how = "ahead"; break; } ahead = ahead.nextIn; }
    else if (back === null) { how = "in0"; break; }
  }
  const kd = "d" + scBucket(rounds);
  SC[kd] = (SC[kd] | 0) + 1;
  const kh = "how_" + how;
  SC[kh] = (SC[kh] | 0) + 1;
  // A ring hit that a prelude of P rounds would delay (the proof needs more).
  if (ringAt !== 0) { SC.ringHit++; if (rounds > 4) SC.ringLate4++; if (rounds > 8) SC.ringLate8++; }
}
'''
    text = text.replace(header, header + DIST, 1)
    call = "  const edge = raceHalf(producer, consumer, finger, out, back, ahead);"
    assert call in text, "--dist expects the half variant"
    text = text.replace(call, "  scDist(producer, consumer, finger, out, back, ahead);\n" + call, 1)
# Counters start undefined: increment as integers.
text = re.sub(r"SC\.(\w+)\+\+", lambda m: f"(SC.{m.group(1)} = (SC.{m.group(1)} | 0) + 1)", text)
open(out, "w", encoding="utf8", newline="\n").write(text)
