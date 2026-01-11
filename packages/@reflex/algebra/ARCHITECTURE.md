src/
  core/                     # чиста математика
    sets/
      eq.ts                 # equality, equivalence
      order.ts              # preorder, poset
    algebra/
      magma.ts
      semigroup.ts
      monoid.ts
      group.ts
      ring.ts
      lattice.ts
    laws/
      laws.ts               # типи законів
      group.laws.ts         # конкретні laws
      lattice.laws.ts
    proof/
      witness.ts            # контрприклади, мінімальні свідки

  domains/                  # конкретні предметні алгебри
    coords/
      coords.ts             # Coord як елемент/структура
      frame.ts              # frame semantics
      order.ts              # dominance-порядок для coords
      lattice.ts            # join/meet або partial join
    joinframe/
      joinFrame.ts          # автомат синхронізації
      invariants.ts         # J1-J6
      semantics.ts          # як JoinFrame відповідає lattice coords

  runtime/                  # виконавчі механізми
    chaos/
      chaos.ts              # chaos scheduler/rand
    scheduler/
      flush.ts              # якщо буде

  testkit/                  # інфраструктура тестів
    arb/                    # arbitraries / generators
      coords.arb.ts
      lattice.arb.ts
    assert/
      invariant.ts
    laws/
      checkLaws.ts          # law runner

tests/
  core/
    group.laws.test.ts
    lattice.laws.test.ts
  domains/
    coords.test.ts
    joinFrame.invariants.test.ts
    joinFrame.chaos.test.ts
