# 05. Динамічні залежності: найнеприємніша частина реактивності

Якщо у `computed` завжди один і той самий набір dependencies, reactive runtime будувати легше.

Але в реальному житті залежності часто змінюються.

Приклад:

```ts
const choice = computed(() => flag.read() ? a.read() : b.read());
```

Поки `flag === true`, вузол залежить від `a`.
Коли `flag === false`, він уже залежить від `b`.

Старий зв'язок треба видалити.

## 1. Чому це складно

Якщо не видалити стару dependency:

- `a` залишиться phantom dependency
- future writes у `a` даремно invalidating `choice`
- graph почне брехати про реальні зв'язки

Це призводить або до зайвої роботи, або до багів.

## 2. Як reflex розв'язує задачу

Через tracking epoch.

Є:

- `node.s`
- `edge.s`

Під час recompute:

1. node отримує новий tracking epoch
2. кожна справді прочитана dependency позначає своє edge цим epoch

Після recompute:

- будь-який inbound edge з іншим `s` вважається stale
- stale edge видаляється

## 3. `trackRead`

Коли active computed читає source/computed:

1. runtime перевіряє, чи вже є edge
2. якщо edge уже є, оновлює `edge.s`
3. якщо edge новий, додає його в graph

Це означає:

- повторні reads не створюють дублікатів
- справді використані edges позначаються "живими"

## 4. `Tracking` bit

Це не freshness flag.

Він означає:

- на минулому recompute dependency shape виглядав стабільним

Якщо під час recompute з'являється нова dependency:

- `Tracking` знімається
- після compute запускається cleanup stale edges

Якщо shape не змінювався:

- cleanup можна частково скоротити

## 5. Навіщо потрібен stable fast path

Тому що в багатьох реальних обчисленнях dependencies:

- динамічні в теорії
- але на практиці змінюються рідко

Тоді корисно мати дешевий шлях:

- не виконувати зайву graph cleanup роботу
- якщо shape залишився таким самим

## 6. Приклад branch switching

```ts
const selected = computed(() => {
  return useA.read() ? a.read() : b.read();
});
```

Сценарій:

1. спочатку `useA = true`
2. node читає `useA` і `a`
3. пізніше `useA = false`
4. node читає `useA` і `b`
5. зв'язок з `a` має зникнути

Після цього:

- write у `a` більше не повинен тривожити `selected`
- write у `b` має продовжувати працювати

## 7. Чому cleanup робиться після recompute

Тому що лише після recompute відомо:

- які залежності справді використовувалися в новому проході

Якщо почати unlink раніше:

- можна зруйнувати graph прямо в процесі обчислення
- ускладнити читання й invariants

У reflex це строго розділено:

- під час compute - лише tracking reads
- після compute - cleanup stale edges

## 8. Часта помилка під час рефакторингу

Дуже легко випадково змішати:

- stale-value logic
- graph-shape logic

Але це різні речі.

### Stale-value logic

Відповідає на запитання:

"чи потрібно заново обчислити значення?"

Дивиться на:

- `Invalid`
- `Obsolete`
- `t`
- `v`

### Graph-shape logic

Відповідає на запитання:

"які залежності у вузла зараз реальні?"

Дивиться на:

- `node.s`
- `edge.s`
- cleanup stale inbound edges

Якщо змішати їх в один клубок, runtime швидко стане крихким.

## 9. Чому це важливо для продуктивності

Динамічні залежності часто стають джерелом зайвих алокацій:

- тимчасові `Set`
- snapshots
- cloned lists

reflex намагається цього уникати:

- tracking через epoch
- linked edges
- cleanup через односканові проходи

Це не магія.
Це просто data-oriented design.

## 10. Як зрозуміти, що ви зламали dynamic deps

Типові симптоми:

- після branch switch старий source усе ще invalidates node
- кількість inbound edges тільки зростає
- repeated reads починають плодити graph-сміття
- тест на switch branch неочікувано викликає зайвий recompute

Тому branch-switch tests у reflex - не "опціональна параноя", а обов'язковий захист архітектури.
