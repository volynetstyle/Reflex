/**
 * ============================================================
 *  Causal Coordinates Space
 *
 *  X₄ = T⁴ = S¹_t × S¹_v × S¹_g × S¹_s
 *
 *  t — epoch (causal time),
 *  v — version (value evolution),
 *  p — generation (async layer),
 *  s — synergy / structural (graph topology).
 *
 *  Дискретное представление:
 *
 *    (t, v, p, s) ∈ ℤ / 2^{T_BITS}ℤ × ℤ / 2^{V_BITS}ℤ × ℤ / 2^{G_BITS}ℤ × ℤ / 2^{S_BITS}ℤ
 *
 *  То есть каждое измерение — циклическая группа ℤ_{2^k} с операцией
 *
 *    x ⊕ δ := (x + δ) mod 2^k.
 *
 *  В коде это реализуется как:
 *
 *    (x + δ) & (2^k - 1)
 *
 *  что даёт wrap по модулю 2^k в 32-битном целочисленном представлении.
 *
 * ------------------------------------------------------------
 *  Уровни упрощения геометрии:
 *
 *  Level 0: Full Reactive Geometry (async + dynamic graph)
 *
 *    X₄ = S¹_t × S¹_v × S¹_g × S¹_s
 *            |      |      |      └─ s: structural / topology
 *            |      |      |      |
 *            |      |      └─────── p: async generation
 *            |      └────────────── v: version (value)
 *            └───────────────────── t: causal epoch
 *
 *  Level 1: No async (strictly synchronous runtime)
 *
 *    Constraint: execution order == causal order
 *    ⇒ p становится выводимым из t (нет независимого async-слоя)
 *
 *    X₃(sync) = S¹_t × S¹_v × S¹_s
 *
 *  Level 2: Static graph (no dynamic topology)
 *
 *    Constraint: topology fixed, нет структурных изменений во время рантайма
 *    ⇒ s константа, не входит в динамическое состояние
 *
 *    X₂(struct-sync) = S¹_t × S¹_v
 *
 *  Level 3: Pure functional / timeless evaluation
 *
 *    Constraint: только версии значений влияют на наблюдаемое поведение
 *    ⇒ t не влияет на вычисление (чистая функция по v)
 *
 *    X₁(pure-value) = S¹_v
 *
 *  Иерархия проекций (факторизация степени свободы):
 *
 *    T⁴(t, v, p, s)
 *      ──[no async]────────▶ T³(t, v, s)
 *         ──[static graph]─▶ T²(t, v)
 *            ──[pure]──────▶ T¹(v)
 *
 *  На уровне алгебры:
 *
 *    T⁴ ≅ ℤ_{2^{T_BITS}} × ℤ_{2^{V_BITS}} × ℤ_{2^{G_BITS}} × ℤ_{2^{S_BITS}}
 *    T³, T², T¹ — проекции T⁴ с тем же покомпонентным законом сложения.
 */

/**
 * Дискретные каузальные координаты.
 *
 * Формально:
 *   (t, v, p, s) ∈ ℤ_{2^{T_BITS}} × ℤ_{2^{V_BITS}} × ℤ_{2^{G_BITS}} × ℤ_{2^{S_BITS}}
 *
 * Параметры T, V, P, S оставлены обобщёнными, чтобы при желании
 * можно было использовать branded-типы:
 *
 *   type Epoch = number & { readonly __tag: "Epoch" };
 *   type Version = number & { readonly __tag: "Version" };
 *   ...
 */
interface CausalCoords<T = number, V = number, P = number, S = number> {
  /** t — causal epoch, t ∈ ℤ_{2^{T_BITS}} */
  t: T;
  /** v — value version, v ∈ ℤ_{2^{V_BITS}} */
  v: V;
  /** p — async generation, p ∈ ℤ_{2^{G_BITS}} */
  p: P;
  /** s — structural / topology, s ∈ ℤ_{2^{S_BITS}} */
  s: S;
}

/**
 * Полное пространство T⁴(t, v, p, s).
 *
 * Математически:
 *   T⁴ ≅ ℤ_{2^{T_BITS}} × ℤ_{2^{V_BITS}} × ℤ_{2^{G_BITS}} × ℤ_{2^{S_BITS}}
 */
type T4<
  T extends number,
  V extends number,
  P extends number,
  S extends number,
> = CausalCoords<T, V, P, S>;

/**
 * T³(t, v, p) — проекция T⁴ без структурного измерения s.
 *
 * Используется, когда топология фиксирована или вынесена за пределы
 * динамического состояния узла.
 */
type T3<T extends number, V extends number, P extends number> = Pick<
  CausalCoords<T, V, P, never>,
  "t" | "v" | "p"
>;

/**
 * T²(t, v) — ещё более жёсткое упрощение: нет async и нет динамической
 * топологии в состоянии узла.
 *
 * Это соответствует синхронной модели со статическим графом:
 *
 *   X₂ ≅ S¹_t × S¹_v.
 */
type T2<T extends number, V extends number> = Pick<
  CausalCoords<T, V, never, never>,
  "t" | "v"
>;

/**
 * T¹(v) — чисто функциональный слой: только версии значений.
 *
 *   X₁ ≅ S¹_v ≅ ℤ_{2^{V_BITS}}
 */
type T1<V extends number> = Pick<CausalCoords<never, V, never, never>, "v">;

/**
 * Сложение по модулю 2^k:
 *
 *   addWrap(x, δ, mask) = (x + δ) mod 2^k,
 *
 * где mask = 2^k - 1.
 *
 * На уровне групп:
 *   ℤ_{2^k} с операцией ⊕ задаётся как:
 *
 *     x ⊕ δ := (x + δ) mod 2^k.
 *
 * В реализации:
 *
 *   (x + δ) & mask
 *
 * при условии, что:
 *   - x уже нормализован: 0 ≤ x ≤ mask,
 *   - mask = 2^k - 1, 0 < k ≤ 31,
 *   - δ — 32-битное целое (может быть отрицательным).
 *
 * Отрицательные δ работают естественно за счёт представления two’s complement:
 *   x = 0, δ = -1  ⇒  (0 + (-1)) & mask = mask.
 *
 * Функция намеренно «тонкая»:
 * — без ветвлений;
 * — без проверок диапазонов;
 * — всё в 32-битной целочисленной арифметике.
 */
export function addWrap<A extends number>(
  x: A,
  delta: number,
  mask: number,
): A {
  // mask предполагается уже вида (1 << bits) - 1 и лежит в uint32.
  // Приводим x к числу, добавляем δ и заворачиваем по маске.
  // (& mask) обеспечивает mod 2^k и выбрасывает старшие биты.
  return (((x as number) + delta) & mask) as A;
}

export type { CausalCoords, T1, T2, T3, T4 };
