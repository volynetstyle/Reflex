# Архитектура reflex-dom

Ревизия: 29 сентября 2026. Документ описывает реализованную архитектуру и основания решений.

## Общий принцип

Renderer управляет **областями DOM с владельцами ресурсов**. У области есть границы,
содержимое и срок жизни. Корень, портал, shadow content и сложное содержимое
динамического слота используют один `OwnedRange`. Слот дополнительно умеет обновлять
текст на месте и сохранять переданный DOM-узел без создания лишнего ownership node.

Это не попытка объединить три разных структуры:

- реактивный граф отвечает на вопрос «что стало неактуальным?»;
- дерево ownership отвечает на вопрос «что нужно освободить?»;
- DOM отвечает на вопрос «какие узлы и где находятся?».

Например, портал принадлежит исходному компоненту, хотя его DOM находится в другом
контейнере и даже другом документе. Перемещение keyed-строки меняет DOM-порядок,
но сохраняет её владельца и ресурсы. Обновление binding не перезапускает компонент.

## Что установлено исследованием

Первичные источники, прочитанные перед изменением:

1. [WHATWG HTML: event loops](https://html.spec.whatwg.org/multipage/webappapis.html#event-loops).
   Задачи, microtask checkpoint и rendering opportunities — разные механизмы.
   Microtask queue опустошается до завершения checkpoint; постановка microtask
   сама по себе не гарантирует уступку вводу или отрисовке.
2. [WHATWG HTML: queueMicrotask](https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#microtask-queuing).
   Microtask полезна для объединения синхронных запросов, но не заменяет task yield.
3. [WICG Prioritized Task Scheduling](https://wicg.github.io/scheduling-apis/).
   Task priority и continuation — отдельный host-протокол. Название «priority»
   в настройках не создаёт такого протокола.
4. [WHATWG DOM: node document и adoption](https://dom.spec.whatwg.org/#concept-node-adopt).
   Узел связан с документом; вставка может его усыновить другим документом.
   Создание элементов должно начинаться с документа назначения, в том числе ради
   его custom element registry. Проверка через конструктор глобального window
   не является корректной проверкой узлов другого realm.
5. [Google Engineering Practices: design and complexity](https://google.github.io/eng-practices/review/reviewer/looking-for.html).
   Основание для архитектурного выбора: оценивать необходимость сложности,
   интеграцию с системой и текущую потребность в обобщении. Это рекомендация по
   проектированию, а не доказательство корректности конкретного renderer.

Локальные источники:

- [Исследовательский отчёт web-scheduler](../../../lab/web-scheduler/results/research_report.md).
- [Прикладной контракт C01–C05](../../../lab/web-scheduler/scheduler_contract.md).
- [Композиция event loop × runtime × bridge](../../../lab/web-scheduler/results/product.md).
- [Границы прогресса](../../../lab/web-scheduler/results/progress.md).

Из локального исследования взяты разделение Request/Resume, проверка токена
продолжения и отказ от безусловного обещания прогресса. H01–H03 доказаны только
в указанном профиле; H04-flat опровергнуто потерей адреса возврата. Поэтому
контекст восстанавливается обычным стеком JavaScript с `try/finally`, а не одним
глобальным набором аргументов. Это архитектурное применение вывода, а не перенос
формального доказательства на весь пакет.

C01–C04 модели со snapshot не означают, что текущие DOM writes атомарны относительно
MutationObserver, custom element callbacks или пользовательских чтений. Здесь
нет отдельной speculative prepare/commit-машины и нет такого обещания.

## Диагноз и реализованные изменения

| Было                                                                                             | Проблема                                                                                            | Стало                                                                                     |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `runtime/execution/state.ts`: глобальные callback/context/argument slots, overloads, enter/leave | Ручная реализация стека вызовов и много состояния для синхронной операции                           | `runtime/context.ts`: один активный `DOMContext`, обычные вложенные вызовы, `try/finally` |
| Nullable runtime, options и nominal brand внутри DOM context                                     | Частично инициализированное состояние; lazy initialization при фактически немедленном использовании | Полностью созданный context с readonly runtime, owner и mountEffects                      |
| `PolicyConfig`, `batchUpdates`, `priorityLevels`, Lazy/Post                                      | Неиспользуемые настройки и несколько названий одного поведения                                      | Единственная настройка `effectStrategy`                                                   |
| `BeforeRender`, `Render`, `AfterRender`                                                          | Очередь никогда не управляла layout/paint; произвольный порядок выглядел как контракт браузера      | Одна FIFO-очередь первого запуска mounted effects                                         |
| `useEffectRender`                                                                                | Название скрывало разницу между первым запуском и реактивными повторами                             | `useMountedEffect`, точный контракт ниже                                                  |
| Версия массива для отмены эффекта                                                                | Отмена переставала действовать, когда drain уже забрал массив                                       | Отменяемая запись задачи, действующая вплоть до её запуска                                |
| Исключение посреди массива эффектов                                                              | Остальные задачи терялись                                                                           | Очередь завершает доступные задачи, затем выбрасывает первую ошибку                       |
| Render/hydrate/resume и singleton отдельно управляли корнями                                     | Разные rollback/dispose-пути, дублирование                                                          | `client/roots.ts` и делегирование singleton обычному renderer                             |
| `structure` импортировал mount dispatcher                                                        | Механизм владения зависел от интерпретации JSX                                                      | `mount/range.ts` строит содержимое, `structure/owned-range.ts` управляет временем жизни   |
| `content-slot` отдельно освобождал сложные ветки                                                 | Дублирование lifecycle и незакрытый ownership при ошибке mount                                      | Сложная ветка использует `OwnedRange`, неудачный mount освобождает owner                  |
| Два классификатора SSR/client и третий dispatcher с собственными правилами                       | Семантический дрейф типов renderable                                                                | `renderable/classify.ts` общий для mount, hydration и SSR                                 |
| Hydration helpers существовали и inline, и отдельными файлами                                    | Мёртвые/пустые файлы, две версии ошибки, опечатка в alias                                           | Один набор cursor/error/slots; общие маркеры в `renderable/markers.ts`                    |
| Глобальный `document`, `instanceof HTMLSelectElement` и подобные проверки                        | Привязка к одному realm                                                                             | Документ передаётся от места вставки; host-проверки учитывают namespace и localName       |

Keyed reconciliation и delta reconciliation оставлены самостоятельными алгоритмами:
их callbacks выражают реальные операции над строками и позволяют проверять алгоритм
без renderer. Удалять их ради меньшего числа файлов означало бы потерять полезную границу.

Проверка публикуемого artifact обнаружила ещё одну архитектурную ошибку сборки:
public и internal entrypoints runtime брались из двух независимо собранных bundles.
В результате framework создавал реактивные узлы в одном экземпляре runtime, а DOM
настраивал scheduler другого. Source tests проходили, но клик в standalone-модуле
не обновлял DOM. Rollup теперь собирает оба entrypoints из общего дерева runtime
modules. `scripts/check-standalone.mjs` входит в `build` и проверяет готовый модуль
во всех трёх стратегиях без Vite aliases и глобальных browser objects.

## Карта исходников

```text
public index / JSX
  client/                  renderer, default renderer, app, root registration
    mount/                 recursive interpretation of JSX and bindings
    hydrate/               matching/adopting existing DOM, mismatch fallback
      structure/           owned ranges and replaceable content slots
      runtime/             DOM scope, ownership bridge, reactive delivery
      reconcile/           keyed/unkeyed algorithms
      host/                DOM properties, events, forms, namespaces, mutations

  server/                  HTML serialization and scoped server ownership
    renderable/            shared classification and hydration marker format
    host/                  pure serialization helpers
```

Внутри `mount` рекурсивные зависимости отражают грамматику: элемент может содержать
компонент, компонент — список, строка списка — элемент. Они локальны этому модулю.
Нижние слои не импортируют `mount` или `client`. `runtime` не знает о контейнерах,
корнях и JSX. `structure` не знает о scheduler. `reconcile` не зависит от framework.
Эти направления проверяет `test/architecture.contract.test.ts`.

## Контракты

### Контекст

`DOMContext` хранит reactive runtime, framework owner context и очередь mounted
effects. Динамический DOM context действует только в пределах синхронного вызова.
Событие выполняется в batch своего renderer. Вложенный вызов другого renderer и
исключение восстанавливают предыдущий context. Продолжение после `await` должно
входить через `renderer.run()`/`renderer.batch()` при работе с runtime.

### Корни и области

`OwnedRange.clear()` один раз освобождает owner и удаляет содержимое между anchors.
`destroy()` дополнительно удаляет anchors. Эти операции идемпотентны.
Root registration хранится на контейнере через framework root table, поэтому
разные renderers видят один действующий корень. Устаревший disposer не удаляет
anchors нового корня. Если внешняя запись `innerHTML` уже убрала anchors, следующий
mount создаёт новые границы. Render сохраняет посторонние узлы вне своей области;
первый hydrate/resume принимает существующее содержимое контейнера.

Ошибка синхронного mount/adoption или первого effect при закрытии его root operation
освобождает созданное дерево. Ошибки более поздних reactive updates распространяются
через reactive scheduler; это не транзакционный откат ранее опубликованного DOM.

### Доставка

`reflex-runtime` распространяет изменения; `reflex-scheduler` владеет watcher queue;
`runtime/scheduler/coordinator.ts` связывает её с DOM batch и mounted effects.

- `eager`: синхронная доставка на доступной границе runtime/batch.
- `sab`: доставка на settled batch boundary по контракту reflex-scheduler.
- `flush`: объединение автоматической доставки через Promise microtask.
- `renderer.flush()` — явный синхронный drain. Старое host-продолжение становится
  недействительным; новый запрос получает новый токен.

Host carrier только ставит microtask и возвращает токен. Coordinator решает,
нужно ли ставить работу, и проверяет токен при Resume. Пустые batches не создают
host-запросы. Это не time slicing, browser priority, frame scheduling или paint barrier.

### Mounted effects

`useMountedEffect(fn)` откладывает **первое** создание реактивного effect до окончания
mount batch и доступной стабилизации watcher queue. После этого зависимости `fn`
обслуживает обычный реактивный scheduler. Каждый повтор не получает отдельную
гарантию «после всех DOM writes»; это не аналог browser paint callback.
Очередь FIFO; отмена действует до запуска, в том числе во время drain. Закрытие
owner до первого запуска отменяет задачу. Доступные reentrant tasks входят в drain.

## Изменения API

- `useEffectRender` → `useMountedEffect`.
- `renderer.renderEffectScheduler` → `renderer.mountEffects`.
- Удалены `RenderEffectPhase`, `RenderEffectScheduler`, `DOMRenderEffectScheduler`.
  Низкоуровневый контракт очереди — `MountEffects`, без фаз.
- Удалено `options.policy`; используйте `options.effectStrategy`.
- У renderer есть прямые `run`, `batch`, `flush`.
- Внутренние deep imports перемещены; совместимые aliases не добавлялись.

## Проверка и границы

```powershell
pnpm --filter @volynets/reflex-dom test
pnpm --filter @volynets/reflex-dom test:browser
pnpm --filter @volynets/reflex-dom typecheck
pnpm --filter @volynets/reflex-dom build
pnpm --filter @volynets/reflex-dom test:standalone
node --test lab/web-scheduler/test/*.test.mjs
```

Проверяются исходные stress/differential-сценарии, ownership при ошибках и замене,
FIFO/cancellation/error recovery, nested batch, detached document, iframe adoption,
form properties, portal lifetime и SSR hydration identity. Browser suite запускается
в Chromium; это не доказательство междвижковой эквивалентности.

Существующий динамический hydration принимает marked slot целиком; он не стал
полной поузловой активацией всех вложенных компонентов/строк. Такая активация требует
отдельного контракта server/client identity. Также не добавлены cooperative yielding,
приоритеты, rollback произвольных пользовательских побочных эффектов или гарантии FPS.
Рефакторинг сокращает дублирование и связи; ускорение «на порядки» не измерялось.

При проверке типов также восстановлен отсутствующий re-export
`readShouldRecomputeStackStats` в `reflex-runtime/src/kernel/stages/second/index.ts`:
существующий debug consumer уже импортировал его из kernel. Это единственное
изменение исходников вне `reflex-dom`; алгоритм runtime не менялся.
