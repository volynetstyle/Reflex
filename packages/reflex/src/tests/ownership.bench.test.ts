import { performance } from "node:perf_hooks";
import { createOwner } from "#reflex/core/ownership/ownership.core.js";
import type { IOwnership } from "#reflex/core/ownership/ownership.type.js";

// Утилиты для бенчмаркинга
const formatNumber = (num: number) => num.toLocaleString("en-US");
const formatTime = (ns: number) => {
    if (ns < 1000) return `${ns.toFixed(2)}ns`;
    const μs = ns / 1000;
    if (μs < 1000) return `${μs.toFixed(2)}μs`;
    const ms = μs / 1000;
    return `${ms.toFixed(2)}ms`;
};

interface BenchResult {
    ops: number;        // Operations per second
    timePerOp: number; // Nanoseconds per operation
    samples: number[];   // Array of sample timings
}

function runBench(name: string, fn: () => void, iterations = 100000): BenchResult {
    // Прогрев
    for (let i = 0; i < 1000; i++) fn();
    
    const samples: number[] = [];
    const start = performance.now();
    
    // Основной цикл замеров
    for (let i = 0; i < iterations; i++) {
        const t0 = performance.now();
        fn();
        samples.push(performance.now() - t0);
    }
    
    const total = performance.now() - start;
    const timePerOp = (total * 1_000_000) / iterations; // в наносекундах
    const ops = 1_000_000_000 / timePerOp; // операций в секунду

    console.log(
        `${name}:
        ${" ".repeat(4)}Ops/sec: ${formatNumber(ops)}
        ${" ".repeat(4)}Time/op: ${formatTime(timePerOp)}
        ${" ".repeat(4)}Samples: ${iterations}`
    );

    return { ops, timePerOp, samples };
}

// Бенчмарки

console.log("\\n=== Ownership Performance Benchmarks ===\\n");

// 1. Создание owner
runBench(
    "Owner creation (no parent)",
    () => {
        createOwner();
    }
);

// 2. Создание owner с родителем
runBench(
    "Owner creation (with parent)",
    () => {
        const parent = createOwner();
        createOwner(parent);
    }
);

// 3. Аппенд чайлда (hot path)
{
    const parent = createOwner();
    const child = createOwner();
    runBench(
        "appendChild (hot path)",
        () => {
            parent.appendChild(child);
            child._parent = undefined; // ресет для следующей итерации
        }
    );
}

// 4. Контекст и наследование
{
    const root = createOwner();
    root.provide("testKey", "testValue");
    const child = createOwner(root);

    runBench(
        "Context inheritance (inject)",
        () => {
            child.inject("testKey");
        }
    );
}

// 5. Большое дерево: создание и утилизация
{
    // Создаем большое дерево для теста
    function createDeepTree(depth: number, width: number): IOwnership {
        const root = createOwner();
        if (depth > 0) {
            for (let i = 0; i < width; i++) {
                const child = createDeepTree(depth - 1, width);
                root.appendChild(child);
            }
        }
        return root;
    }

    console.log("\\n=== Large Tree Operations ===\\n");

    // 5.1 Создание большого дерева
    runBench(
        "Create large tree (depth=4, width=4)",
        () => {
            createDeepTree(4, 4); // 256 узлов
        },
        100 // меньше итераций для большого дерева
    );

    // 5.2 Утилизация большого дерева
    runBench(
        "Dispose large tree (depth=4, width=4)",
        () => {
            const tree = createDeepTree(4, 4);
            tree.dispose();
        },
        100
    );
}

// 6. Traversal performance
{
    console.log("\\n=== Traversal Performance ===\\n");

    // Создаем широкое дерево для теста
    const root = createOwner();
    for (let i = 0; i < 100; i++) {
        createOwner(root);
    }

    // 6.1 Прямой children()
    runBench(
        "Direct children iteration (100 nodes)",
        () => {
            for (const _ of root.children()) {
                // просто итерация
            }
        }
    );

    // 6.2 Рекурсивный descendants()
    runBench(
        "Recursive descendants (100 nodes)",
        () => {
            for (const _ of root.descendants()) {
                // просто итерация
            }
        }
    );
}

// 7. Cleanup handlers
{
    console.log("\\n=== Cleanup Performance ===\\n");

    const owner = createOwner();
    const noop = () => {};

    // 7.1 Добавление cleanup handler
    runBench(
        "Add cleanup handler",
        () => {
            owner.onScopeCleanup(noop);
        }
    );

    // 7.2 Dispose с cleanup handlers
    runBench(
        "Dispose with cleanup handlers",
        () => {
            const o = createOwner();
            o.onScopeCleanup(noop);
            o.dispose();
        },
        10000 // меньше итераций так как операция тяжелее
    );
}

// 8. Context операции
{
    console.log("\\n=== Context Operations ===\\n");

    const root = createOwner();
    const child = createOwner(root);
    const grandChild = createOwner(child);

    // 8.1 Provide
    runBench(
        "Context provide",
        () => {
            root.provide("testKey", "testValue");
        }
    );

    // 8.2 Inject (3 уровня глубины)
    runBench(
        "Context inject (depth=3)",
        () => {
            grandChild.inject("testKey");
        }
    );

    // 8.3 hasOwn check
    runBench(
        "Context hasOwn",
        () => {
            grandChild.hasOwn("testKey");
        }
    );
}

// 9. State flags operations
{
    console.log("\\n=== State Management ===\\n");

    const owner = createOwner();
    let state = owner._state;

    // 9.1 State flag check
    runBench(
        "State flag check",
        () => {
            state & 1;
        }
    );

    // 9.2 State flag modification
    runBench(
        "State flag modification",
        () => {
            state |= 1;
            state &= ~1;
        }
    );
}
