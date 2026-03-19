# `reflex` Study

Це повноцінний навчальний посібник з `reflex`.

Мета цієї папки не просто показати API, а довести читача від найбазовіших ідей
до розуміння того, як влаштований runtime:

- як працює graph model
- чому `write()` дешевий
- як влаштований lazy refresh
- як живуть dynamic deps
- де сильні та слабкі місця за perf
- як розширювати beta без розповзання архітектури

## Для кого це

- Для розробника, який уперше бачить `signal`, `computed`, `effect`.
- Для людини, яка хоче читати `src/` без відчуття "реактивної магії".
- Для автора runtime-змін, якому важливо не зламати інваріанти ядра.

## Як читати

Рекомендований порядок:

1. [01-basics.md](./01-basics.md) - базова інтуїція: чим signals відрізняються від звичайних змінних і чому beta lazy.
2. [02-public-api.md](./02-public-api.md) - увесь користувацький API і реальні сценарії його застосування.
3. [03-core-model.md](./03-core-model.md) - модель вузлів, ребер, epoch-ів і state flags.
4. [04-read-and-write-paths.md](./04-read-and-write-paths.md) - повний шлях запису та читання всередині runtime.
5. [05-dynamic-dependencies.md](./05-dynamic-dependencies.md) - branch switching, cleanup stale deps і phantom dependency.
6. [06-effects-and-scheduler.md](./06-effects-and-scheduler.md) - lifecycle `effect`, cleanup і винесений scheduler.
7. [07-invariants-dev-and-prod.md](./07-invariants-dev-and-prod.md) - формальні інваріанти, dev-guards і те, що зникає з prod build.
8. [08-performance.md](./08-performance.md) - cost model beta, сильні та слабкі workload-сценарії.
9. [09-extension-guide.md](./09-extension-guide.md) - як рефакторити й розширювати runtime без втрати мінімалістичного ядра.
10. [10-source-map.md](./10-source-map.md) - карта вихідних файлів і рекомендований порядок читання `src/`.

## Коротко про філософію beta

`reflex` - це маленький reactive runtime з такими пріоритетами:

- lazy pull під час читання
- cheap push invalidation під час запису
- selective recomputation через версії
- динамічні залежності без важких структур
- мінімалізм ядра важливіший за кількість фіч

Це означає, що runtime спеціально не намагається бути "всім і одразу".
Він не маскує компроміси.
Він намагається бути маленьким, швидким і передбачуваним.

## Найважливіша думка

Якщо запам'ятати лише одну ідею, то ось вона:

`write()` не перераховує граф.

Запис лише:

1. оновлює source
2. рухає epoch зміни
3. позначає downstream як потенційно брудні

А реальне приведення значень до актуального стану відбувається під час читання
через lazy refresh.

Саме навколо цієї ідеї побудовано все інше.
