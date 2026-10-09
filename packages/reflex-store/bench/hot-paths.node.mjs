import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = resolve(
  process.argv[2] ?? fileURLToPath(new URL("../", import.meta.url)),
);
const load = (entry) =>
  import(pathToFileURL(resolve(packageRoot, "dist", entry)).href);
const api = await load("index.js");
const advanced = await load("advanced.js");
const host = await load("runtime.js");
const compiler = await load("store.js");
let checksum = 0;
const cases = [];
function add(name, setup) {
  cases.push({ name, setup });
}
function compiled(source) {
  const code = compiler.compileStore(source, "benchmark.js", {
    importRuntime: false,
  }).code;
  return new Function(
    "__reflex_createStoreScope",
    "__reflex_signal",
    "__reflex_createDisposableComputed",
    code + "\nreturn { make, data };",
  )(host.createStoreScope, host.createStoreCell, host.createDisposableComputed);
}
add("cell/read", () => {
  const cell = host.createStoreCell(1);
  return {
    run(n) {
      let s = 0;
      for (let i = 0; i < n; i++) {
        s += cell();
        if ((i & 255) === 0) cell.set(i & 1);
      }
      return s;
    },
    dispose: cell.dispose,
  };
});
add("cell/write", () => {
  const cell = host.createStoreCell(0);
  return {
    run(n) {
      for (let i = 0; i < n; i++) cell.set(i & 1);
      return cell();
    },
    dispose: cell.dispose,
  };
});
add("cell/noop", () => {
  const cell = host.createStoreCell(1);
  return {
    run(n) {
      for (let i = 0; i < n; i++) cell.set(1);
      return cell();
    },
    dispose: cell.dispose,
  };
});
add("cell/create-dispose", () => ({
  run(n) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const c = host.createStoreCell(i);
      s += c();
      c.dispose();
    }
    return s;
  },
}));
for (const observed of [false, true]) {
  add("map/read/" + (observed ? "tracked" : "plain"), () => {
    const rt = host.createRuntime({ effectStrategy: "eager" }),
      map = api.reactiveMap([
        [0, 0],
        [1, 1],
      ]);
    const stop = observed
      ? host.effect(() => {
          map.get(0);
          map.has(1);
          map.size;
        })
      : () => {};
    return {
      run(n) {
        let s = 0;
        for (let i = 0; i < n; i++) {
          s += map.get(i & 1);
          s += map.has(i & 1);
          s += map.size;
        }
        return s;
      },
      dispose() {
        stop();
        map.dispose();
        rt.flush();
      },
    };
  });
  add("map/write/" + (observed ? "tracked" : "plain"), () => {
    const rt = host.createRuntime({ effectStrategy: "eager" }),
      map = api.reactiveMap([
        [0, 0],
        [1, 1],
      ]);
    let k = 0;
    const stop = observed
      ? host.effect(() => {
          map.get(0);
          map.get(1);
          map.size;
        })
      : () => {};
    return {
      run(n) {
        for (let i = 0; i < n; i++) map.set(k++ & 1, k);
        return map.size;
      },
      dispose() {
        stop();
        map.dispose();
        rt.flush();
      },
    };
  });
}
add("map/noop", () => {
  const map = api.reactiveMap([[0, 1]]);
  return {
    run(n) {
      for (let i = 0; i < n; i++) map.set(0, 1);
      return map.get(0);
    },
    dispose() {
      map.dispose();
    },
  };
});
add("map/clear-256-keys", () => {
  const rt = host.createRuntime({ effectStrategy: "eager" });
  const entries = Array.from({ length: 256 }, (_, i) => [i, i]);
  const map = api.reactiveMap(entries);
  const stop = host.effect(() => {
    map.get(1);
    map.has(2);
    map.size;
  });
  return {
    run(n) {
      for (let i = 0; i < n; i++) {
        map.clear();
        api.action(() => {
          for (const [k, v] of entries) map.set(k, v);
        })();
      }
      return map.size;
    },
    dispose() {
      stop();
      map.dispose();
      rt.flush();
    },
  };
});
add("set/membership", () => {
  const set = advanced.reactiveSet([0, 1]);
  return {
    run(n) {
      let s = 0;
      for (let i = 0; i < n; i++) s += set.has(i & 1);
      return s;
    },
    dispose() {
      set.dispose();
    },
  };
});
add("set/churn", () => {
  const set = advanced.reactiveSet();
  return {
    run(n) {
      for (let i = 0; i < n; i++) {
        set.add(i & 31);
        set.delete(i & 31);
      }
      return set.size;
    },
    dispose() {
      set.dispose();
    },
  };
});
for (const count of [16, 256])
  add("selector/transition-" + count, () => {
    const rt = host.createRuntime({ effectStrategy: "eager" }),
      source = host.signal(0),
      select = api.selector(source);
    let key = 0;
    const stops = Array.from({ length: count }, (_, i) =>
      host.effect(() => {
        select(i);
      }),
    );
    return {
      run(n) {
        for (let i = 0; i < n; i++) source.set(++key % count);
        return key;
      },
      dispose() {
        for (const stop of stops) stop();
        select.dispose();
        rt.flush();
      },
    };
  });
add("selector/read", () => {
  const source = host.signal(1),
    select = api.selector(source);
  return {
    run(n) {
      let s = 0;
      for (let i = 0; i < n; i++) s += select(i & 3);
      return s;
    },
    dispose() {
      select.dispose();
    },
  };
});
add("keyed/materialized-read", () => {
  const rt = host.createRuntime({ effectStrategy: "eager" }),
    source = host.signal({ id: 1, value: 1 });
  const keyed = advanced.createKeyedProjection(
      source,
      (x) => x.id,
      (x) => x.value,
    ),
    stop = host.effect(() => {
      keyed(1);
    });
  return {
    run(n) {
      let s = 0;
      for (let i = 0; i < n; i++) s += keyed(1);
      return s;
    },
    dispose() {
      stop();
      keyed.dispose();
      rt.flush();
    },
  };
});
for (const fields of [16, 256])
  add("derive/update-" + fields, () => {
    const rt = host.createRuntime({ effectStrategy: "eager" }),
      source = host.signal(0);
    let value = 0;
    const view = api.derive(() => {
      const state = {};
      for (let i = 0; i < fields; i++) state["k" + i] = source() + i;
      return state;
    });
    const stop = host.effect(() => {
      view.k0;
      view["k" + (fields - 1)];
    });
    return {
      run(n) {
        for (let i = 0; i < n; i++) source.set(++value);
        return view.k0;
      },
      dispose() {
        stop();
        view[Symbol.dispose]();
        rt.flush();
      },
    };
  });
add("projection/leaf-read", () => {
  const source = host.signal({ nested: { value: 1 }, other: 2 });
  const view = api.derive(() => source());
  const stop = host.effect(() => {
    view.nested.value;
  });
  return {
    run(n) {
      let s = 0;
      for (let i = 0; i < n; i++) s += view.nested.value;
      return s;
    },
    dispose() {
      stop();
      view[Symbol.dispose]();
    },
  };
});
add("projection/draft-update", () => {
  const rt = host.createRuntime({ effectStrategy: "eager" }),
    source = host.signal(0);
  let value = 0;
  const view = advanced.createStoreProjection(
    (draft) => {
      draft.value = source();
    },
    { value: 0 },
  );
  const stop = host.effect(() => {
    view.value;
  });
  return {
    run(n) {
      for (let i = 0; i < n; i++) source.set(++value);
      return view.value;
    },
    dispose() {
      stop();
      view[Symbol.dispose]();
      rt.flush();
    },
  };
});
for (const kind of ["action", "scope-action"])
  add(kind + "/call", () => {
    host.createRuntime({ effectStrategy: "eager" });
    let value = 0;
    const scope =
      kind === "scope-action"
        ? host.createStoreScope((ctx) => ({
            run: ctx.action((n) => (value += n)),
          }))
        : undefined;
    const call = scope?.run ?? api.action((n) => (value += n));
    return {
      run(n) {
        for (let i = 0; i < n; i++) call(1);
        return value;
      },
      dispose() {
        scope?.dispose();
      },
    };
  });
const dataSource =
  "const data={user:{name:'Ada'},count:0,items:[]};function make(){const state=createStore({user:{name:'Ada'},count:0,items:[]});return state;}";
add("compiled/create-dispose", () => {
  const { make } = compiled(dataSource);
  return {
    run(n) {
      let s = 0;
      for (let i = 0; i < n; i++) {
        const state = make();
        s += state.count;
        state.dispose();
      }
      return s;
    },
  };
});
for (const operation of ["snapshot", "hydrate"])
  add("compiled/" + operation + "-flat-64", () => {
    host.createRuntime({ effectStrategy: "eager" });
    const fields = Array.from({ length: 64 }, (_, i) => "k" + i + ":" + i).join(
      ",",
    );
    const { make, data } = compiled(
      "const data={" +
        fields +
        "};function make(){const state=createStore({" +
        fields +
        "});return state;}",
    );
    const state = make();
    return {
      run(n) {
        let s = 0;
        for (let i = 0; i < n; i++) {
          if (operation === "snapshot") s += api.snapshot(state).k0;
          else api.hydrate(state, data);
        }
        return s;
      },
      dispose() {
        state.dispose();
      },
    };
  });
add("compiled/hydrate-nested-64", () => {
  host.createRuntime({ effectStrategy: "eager" });
  const fields = Array.from(
    { length: 64 },
    (_, i) => "k" + i + ":{value:" + i + "}",
  ).join(",");
  const { make, data } = compiled(
    "const data={" +
      fields +
      "};function make(){const state=createStore({" +
      fields +
      "});return state;}",
  );
  const state = make();
  return {
    run(n) {
      for (let i = 0; i < n; i++) api.hydrate(state, data);
      return state.k0.value;
    },
    dispose() {
      state.dispose();
    },
  };
});
for (const operation of ["read", "write", "noop", "method"])
  add("compiled/" + operation, () => {
    host.createRuntime({ effectStrategy: "eager" });
    const { make } = compiled(
      "const data={};function make(){const state=createStore({count:0,get doubled(){return this.count*2},increment(){this.count++;return this.doubled}});return state;}",
    );
    const state = make();
    return {
      run(n) {
        let sum = 0;
        for (let i = 0; i < n; i++) {
          if (operation === "read") sum += state.count;
          else if (operation === "write") state.count = i & 1;
          else if (operation === "noop") state.count = 0;
          else sum += state.increment();
        }
        return sum;
      },
      dispose() {
        state.dispose();
      },
    };
  });

const results = [];
for (const { name, setup } of cases) {
  if (process.argv[4] && !name.includes(process.argv[4])) continue;
  global.gc?.();
  const workload = setup();
  let iterations = 64;
  for (let round = 0; round < 19; round++) {
    const start = performance.now();
    checksum += Number(workload.run(iterations)) || 0;
    if (performance.now() - start >= 25 || iterations >= 16_777_216) break;
    iterations *= 2;
  }
  for (let i = 0; i < 2; i++) checksum += Number(workload.run(iterations)) || 0;
  const samples = [];
  for (let i = 0; i < 7; i++) {
    const start = performance.now();
    checksum += Number(workload.run(iterations)) || 0;
    samples.push(((performance.now() - start) * 1e6) / iterations);
  }
  samples.sort((a, b) => a - b);
  results.push({
    name,
    ns: samples[3],
    p25: samples[1],
    p75: samples[5],
    iterations,
    samples,
  });
  workload.dispose?.();
}
const result = {
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  packageRoot,
  checksum,
  results,
};
if (process.argv[3])
  await writeFile(
    resolve(process.argv[3]),
    JSON.stringify(result, null, 2) + "\n",
  );
console.log(JSON.stringify(result));
