// CAUSALLY_STABLE	Єдиний причинний простір, шов гладкий.
// GENERATION_DRIFT	Розрив у async-поколіннях, але структура зберігається.
// TOPOLOGY_TENSION	Локальна зміна топології DAG, можливе «перетягування шва».
// CAUSAL_CONFLICT	Немає способу звести B і C у спільний причинний контекст.
// - Найнебезпечніша ситуація, але в той же час, найрідша

const enum CausalPhase {
  CAUSALLY_STABLE = 0,
  GENERATION_DRIFT = 1,
  TOPOLOGY_TENSION = 2,
  CAUSAL_CONFLICT = 3,
}

const WRAP_END = 0xffff_ffff >>> 0;
const INITIAL_CAUSATION = 0;

export { CausalPhase, WRAP_END, INITIAL_CAUSATION };
