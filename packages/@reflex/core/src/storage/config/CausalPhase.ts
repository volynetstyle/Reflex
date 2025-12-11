// Фаза	Твердий сенс
// CAUSALLY_STABLE	Єдиний причинний простір, шов гладкий.
// GENERATION_DRIFT	Розрив у async-поколіннях, але структура зберігається.
// TOPOLOGY_TENSION	Локальна зміна топології DAG, можливе «перетягування шва».
// CAUSAL_CONFLICT	Немає способу звести B і C у спільний причинний контекст.
// - Найнебезпечніша ситуація, але в той же час, найрідша

const enum CausalPhase {
  CAUSALLY_STABLE = 0x00,
  GENERATION_DRIFT = 0x01,
  TOPOLOGY_TENSION = 0x02,
  CAUSAL_CONFLICT = 0x03,
}

export default CausalPhase;
