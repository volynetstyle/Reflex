// ownership.run.ts
// Чистый нагрузочный прогон без Vitest.
// Запускается через: 
// pnpm exec 0x -- node --require ts-node/register/transpile-only tests/ownership.run.ts

import { createOwner } from "../../src/ownership/ownership.core"

function build1m() {
  const root = createOwner();
  let layer = [root];

  // 1 + 10 + 100 + 1000 + 10000 + 100000 + 1000000 = 1 111 111 узлов
  for (let d = 0; d < 6; d++) {
    const next = [];
    for (const p of layer) {
      for (let i = 0; i < 10; i++) {
        next.push(createOwner(p));
      }
    }
    layer = next;
  }

  root.dispose();
}

for (let i = 0; i < 10; i++) {
  build1m();
}

console.log("bench_1m finished");