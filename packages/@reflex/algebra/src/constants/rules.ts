import { CausalCoords as C } from "./coords";

/**
| Подія / Причина                                          | t (time) | v (version) | p (lane) | s (structural epoch) | Примітка                                  |
| -------------------------------------------------------- | :------: | :---------: | :------: | :------------------: | ----------------------------------------- |
| **Створення нового вузла (initial compute)**             |    ✔️    |      ✔️     |    ✔️    |           ❌          | new value, new node, same topology        |
| **Локальне перевчислення вузла без зміни значення**      |     ❌    |      ❌      |     ❌    |           ❌          | чисте recompute, idempotent               |
| **Локальне перевчислення з новим значенням**             |    ✔️    |      ✔️     |     ❌    |           ❌          | value змінилось, DAG не змінюється        |
| **Отримання значення від залежного вузла (propagation)** |    ✔️    |      ❌      |     ❌    |           ❌          | causal time зростає, lane не змінюється   |
| **Join (gluing) кількох lanes**                          |    ✔️    |      ✔️     |    ✔️*   |           ❌          | lane визначений дизайнерськи              |
| **Merge результатів із різних branches (v)**             |    ✔️    |      ✔️     |     ❌    |           ❌          | асоціативно/комутативно/ідемпотентно      |
| **Fork / створення нової гілки обчислення**              |     ❌    |      ✔️     |    ✔️    |           ❌          | нова lane, нова версія                    |
| **Replay / повторна доставка події**                     |     ❌    |      ❌      |     ❌    |           ❌          | deterministic replay                      |
| **Retry обчислення (детермінований)**                    |     ❌    |      ❌      |     ❌    |           ❌          | deterministic recompute                   |
| **Паралельні незалежні оновлення в різних lanes**        |    ✔️    |      ✔️     |     ❌    |           ❌          | merge тільки на join                      |
| **Додавання вузла в DAG**                                |     ❌    |      ❌      |     ❌    |          ✔️          | structural change                         |
| **Видалення вузла з DAG**                                |     ❌    |      ❌      |     ❌    |          ✔️          | structural change                         |
| **Додавання ребра (dependency)**                         |     ❌    |      ❌      |     ❌    |          ✔️          | topological change                        |
| **Видалення ребра**                                      |     ❌    |      ❌      |     ❌    |          ✔️          | topological change                        |
| **Зміна arity вузла**                                    |     ❌    |      ❌      |     ❌    |          ✔️          | join / function arity change              |
| **Зміна merge-функції**                                  |     ❌    |      ❌      |     ❌    |          ✔️          | sheaf morphism змінився                   |
| **Зміна expectedLanes у join-вузлі**                     |     ❌    |      ❌      |     ❌    |          ✔️          | топологія join змінилась                  |
| **Міграція вузла між lanes**                             |     ❌    |      ❌      |    ✔️    |          ✔️          | lane change + structural mapping          |
| **Глобальний reset runtime (cold start)**                |    ✔️    |      ✔️     |    ✔️    |          ✔️          | повний restart                            |
| **Hot reload логіки без зміни топології**                |     ❌    |      ❌      |     ❌    |           ❌          | runtime code update, DAG не змінюється    |
| **Hot reload з зміною залежностей / merge**              |     ❌    |      ❌      |     ❌    |          ✔️          | structural sheaf change                   |
| **Серіалізація / десеріалізація стану**                  |     ❌    |      ❌      |     ❌    |           ❌          | просто snapshot / restore                 |
| **Partial graph materialization (ледачі вузли)**         |     ❌    |      ✔️     |     ❌    |           ❌          | node materialized, topology не змінюється |
| **Dependency gating / inactive edge**                    |     ❌    |      ✔️     |     ❌    |           ❌          | lane і DAG не змінюються, тільки значення |
| **Lane collapse / garbage collection**                   |     ❌    |      ❌      |     ❌    |          ✔️          | lane видалена, топологія sheaf змінилась  |
| **Cross-epoch bridge / migration data s=k→s=k+1**        |    ✔️    |      ✔️     |     ❌    |          ✔️          | explicit bridge node required             |
| **Determinism boundary crossing (random / IO)**          |    ✔️    |      ✔️     |     ❌    |           ❌          | value змінюється, DAG не змінюється       |
*/

/* ───────────────────── Time (t) ───────────────────── */

export const invariantTimeMonotonic = (parent: C, child: C): boolean =>
  ((parent.t + 1) & child.t) === 0;

export const invariantReplayPreservesTime = (
  original: C,
  replayed: C,
): boolean => original.t === replayed.t;

/* ─────────────────── Version (v) ──────────────────── */

export const invariantValueChangeBumpsVersion = (
  valueChanged: boolean,
  before: C,
  after: C,
): boolean => !valueChanged || after.v > before.v;

export const invariantIdempotentRecompute = (
  valueChanged: boolean,
  before: C,
  after: C,
): boolean => valueChanged || after.v === before.v;

export const invariantMergeBumpsVersion = (
  parents: readonly C[],
  merged: C,
): boolean => {
  for (const p of parents) {
    if (merged.v <= p.v) return false;
  }
  return true;
};

/* ───────────────────── Lane / Phase (p) ───────────── */

export const invariantPropagationPreservesLane = (
  source: C,
  target: C,
): boolean => source.p === target.p;

export const invariantForkCreatesNewLane = (parent: C, forked: C): boolean =>
  parent.p !== forked.p && forked.v > parent.v && forked.t === parent.t;

/* ───────────────────── Join / Merge ───────────────── */
export const invariantJoinAdvances = (
  parents: readonly C[],
  joined: C,
): boolean => {
  for (const p of parents) {
    if (joined.t === p.t) return false; // join має рухати t
    if (joined.v <= p.v) return false; // join має мати більшу версію
  }
  return true;
};

/* ───────────────── Structural Epoch (s) ───────────── */

export const invariantStructuralChangeBumpsEpoch = (
  structuralChange: boolean,
  before: C,
  after: C,
): boolean => !structuralChange || after.s > before.s;

export const invariantEpochStableWithoutTopologyChange = (
  structuralChange: boolean,
  before: C,
  after: C,
): boolean => structuralChange || after.s === before.s;

export const invariantCrossEpochBridge = (from: C, to: C): boolean =>
  to.s === from.s + 1 && to.t !== from.t && to.v > from.v;

/* ───────────────────── Phase Monotonicity ─────────── */

export const invariantPhaseMonotonic = (before: C, after: C): boolean =>
  after.p >= before.p;

export const invariantPhaseImpliesChange = (before: C, after: C): boolean =>
  after.p === before.p || after.v !== before.v || after.s !== before.s;

/* ───────────────────── No-op & Reset ─────────────── */

export const invariantNoOpIsStable = (
  noOp: boolean,
  before: C,
  after: C,
): boolean =>
  !noOp ||
  (before.t === after.t &&
    before.v === after.v &&
    before.s === after.s &&
    before.p === after.p);

export const invariantColdStart = (coords: C): boolean =>
  coords.t === 0 && coords.v === 0 && coords.p === 0 && coords.s === 0;
