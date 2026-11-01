#!/usr/bin/env bash
# Builds the production runtime bundles of the tape-controller experiments
# into perf/tape-controller/bundles/<name>/runtime.mjs (run from anywhere).
#   build.sh <set>   set = kgrid | foreign | frozen
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
pkg=$(cd "$here/../.." && pwd)
cd "$pkg"
BASE=a7858fa   # dev: prepared tape (#71) + tracking compression (#72)
GATE=613d231   # research/cost-sensitive-strike: strike past COSTLY_LOCKSTEP_STEP
F=src/kernel/shape/graph/findEdge.ts
T=src/kernel/shape/graph/tape.ts
build() { local name=$1; shift; node scripts/build-baseline-oracle.mjs --production "$@" --out "$here/bundles/$name" >/dev/null; echo "$name $(sha256sum "$here/bundles/$name/runtime.mjs" | cut -c1-12)"; }

build base --commit "$BASE"
case "${1:?set}" in
  kgrid)
    for K in 1 8 12 16 24 32; do
      build "k$K" --commit "$GATE" --mutate "$F::const COSTLY_LOCKSTEP_STEP = 16;::const COSTLY_LOCKSTEP_STEP = $K;"
    done
    for K in 8 16; do
      build "e$K" --commit "$GATE" --mutate "$F::++step === COSTLY_LOCKSTEP_STEP &&::++step % $K === 0 &&"
    done
    ;;
  foreign)
    build nf-rec --commit "$BASE" \
      --mutate "$F::    hint !== null && hint.from === producer::    hint !== null && hint.from === producer && hint.to !== preparedOwner"
    build nf-live --commit "$BASE" \
      --mutate "$T::function isLeaseLive(owner: ReactiveNode): boolean {::export function isRecordedLeaseLive(): boolean { return preparedOwner !== null && isLeaseLive(preparedOwner); } function isLeaseLive(owner: ReactiveNode): boolean {" \
      --mutate "$F::  settleOnPreparedTape,::  settleOnPreparedTape, isRecordedLeaseLive," \
      --mutate "$F::    hint !== null && hint.from === producer::    hint !== null && hint.from === producer && (hint.to !== preparedOwner || isRecordedLeaseLive() === false)"
    untaped=$(tr -d '\n' < "$here/overlays/untaped.ts.txt")
    build nf-ns --commit "$BASE" \
      --mutate "$F::const FIRST_WALK = 1 << 0;::$untaped" \
      --mutate "$F::    hint !== null && hint.from === producer::    hint !== null && hint.from === producer && hint.to === preparedOwner ? findEdgeInLockstepUntaped(producer, consumer, out, back, ahead) : hint !== null && hint.from === producer"
    ;;
  frozen)
    for v in a b; do
      build "fz-$v" --commit "$BASE" --overlay "$T=$here/overlays/tape.ts.txt" --overlay "$F=$here/overlays/findEdge.$v.ts.txt"
    done
    ;;
  schedule)
    # Frozen-controller schedule variants (overlays/schedule, generate.py), and
    # the constraint that findEdgeInLockstep stays dev's bytecode in each.
    variants="${SCHEDULE_VARIANTS:-half ffrounds-early nofinger-call nofinger-inline}"
    for v in $variants; do
      build "s-$v" --commit "$BASE" --overlay "$T=$here/overlays/schedule/tape.ts.txt" --overlay "$F=$here/overlays/schedule/findEdge.$v.ts.txt"
    done
    node scripts/build-baseline-oracle.mjs --commit "$BASE" --readable --out "$here/bundles/r-base" >/dev/null
    readable=()
    for v in $variants; do
      node scripts/build-baseline-oracle.mjs --commit "$BASE" --readable --overlay "$T=$here/overlays/schedule/tape.ts.txt" --overlay "$F=$here/overlays/schedule/findEdge.$v.ts.txt" --out "$here/bundles/r-$v" >/dev/null
      readable+=("$here/bundles/r-$v")
    done
    node "$here/bytecode-check.mjs" "$here/bundles/r-base" "${readable[@]}"
    ;;
  port)
    # Production candidates with the live tape controller, against dev.
    build port-rounds --commit ae2fdd0   # perf/tracking-finger-rounds: finger-first race rounds
    ;;
  rounds)
    # Live controller, old (dev a7858fa) and new (ae2fdd0, finger-first
    # rounds) search: current admission, the K=16 gate, and no prepare at all.
    # Does bounding the finger race shrink the tape's external harm on x16?
    NOPREP="$T::  prepareTape(consumer, passStamp);::  return false;"
    build k16 --commit "$GATE"
    build np --commit "$BASE" --mutate "$NOPREP"
    build cur --commit ae2fdd0
    build k16r --commit ae2fdd0 --overlay "$T=$here/overlays/rounds/tape.k16.ts.txt" --overlay "$F=$here/overlays/rounds/findEdge.k16.ts.txt"
    build npr --commit ae2fdd0 --mutate "$NOPREP"
    ;;
  budget)
    # Same bundles, V8 inlining budget raised per run (time.mjs <dir>@<n>):
    # an upper bound on what inlining the finger path can buy.
    build cur --commit ae2fdd0
    build npr --commit ae2fdd0 --mutate "$T::  prepareTape(consumer, passStamp);::  return false;"
    ;;
  *) echo "unknown set $1" >&2; exit 2 ;;
esac
