# Комбинаторная матрица возможностей reflex-dom

Дата: 22 октября 2026. Основа: рабочее дерево поверх `7d029fc`, включая существовавшие незакоммиченные изменения. Это аудит текущих исходников, а не опубликованного npm artifact.

Под «уже доступно» ниже понимаются три разных основания: публичный API framework/runtime/async, внутренние механизмы DOM renderer и API DOM-платформы. Наличие основания не означает, что готова вся функция renderer.

Обозначения:

- **Готово** — нужное сочетание поддержано напрямую.
- **Мост** — механизм реализован в соседнем пакете, но требует ручного связывания или дополнительных imports.
- **Частично** — сочетание работает с существенным ограничением lifetime, identity или активации.
- **Нет** — соответствующего renderer-контракта/API нет; потребуется реализация.
- **Проба** — поведение воспроизведено в jsdom; **код** — вывод по реализации, без отдельной новой исполняемой пробы.

P1/P2/P3 — предложенный порядок разработки, а не установленная в проекте классификация дефектов. P1 касается корректности/lifetime/identity; P2 — повторяющегося ручного связывания; P3 — удобства записи.

## Контексты, ownership и execution domains

| ID | Комбинация требований | Что уже доступно | Состояние reflex-dom | Что приходится делать сейчас | Приоритет / основание |
|---|---|---|---|---|---|
| C1 | Context × компонент × ближайший provider | Ownership context layers, наследование, default, shadowing | **Готово**: `useContext(Token)`, `provideContext(Token, value)` и `<Provider>` сами берут текущий owner; формы с явным `target` остались в framework для интеграций | `useContext(Token)` в компоненте; значение для поддерева — `<Provider context={Token} value={…}>`. Вне setup (event, после `await`) значение нужно захватить заранее | Закрыто (изначально P2), код [S1], [S2] |
| C2 | Context × изменение значения × живые потребители | В context можно положить signal/accessor/store | **Готово по контракту**: provide выполняется при setup и не уведомляет потребителей; изменяемое значение передаётся как signal/accessor | `<Provider context={Token} value={signal}>`, потребитель читает `useContext(Token)()` в реактивной привязке | Закрыто как контракт (изначально P2), код [S1] |
| C3 | Context × Portal × исходная ветка ownership | Portal подчиняется source owner, а не DOM-родителю | **Готово** для обычного mount; перенос в другой контейнер не должен означать новый DI-root | Дополнительный Provider только из-за физического DOM-родителя не нужен | Контрольная комбинация, код [S1], [S8] |
| C4 | DOM event × создание ресурса × lifetime компонента | Ownership cleanup, захват node при bind listener | **Готово**: handler выполняется в runtime batch, DOMContext и под тем owner/node, которому принадлежит listener. `useOwned`, `onCleanup` и `useContext` в handler работают; ресурсы закрываются вместе с компонентом или веткой | Ничего дополнительно | Закрыто (изначально P1), тест `runtime.callback-scope.test.tsx` |
| C5 | Timer/observer/promise callback × owner × DOM runtime | `useCallbackContext(fn)` захватывает renderer, domain и owner/node | **Готово**: вызов входит в runtime batch, DOMContext и owner; после dispose компонента или приложения вызов игнорируется и возвращает `undefined` | Обернуть callback в `useCallbackContext` при setup и передать результат в timer/observer | Закрыто (изначально P2), тест `runtime.callback-scope.test.tsx` |
| C6 | `await` × продолжение × owner/context | `useCallbackContext`, lifetime AbortSignal | **Готово по контракту**: синхронный context не переходит через `await`; продолжение, созданное через `useCallbackContext`, восстанавливает owner/context | `promise.then(useCallbackContext(next))` или bound-функция, вызываемая после `await`. Обёртка всего async callback по-прежнему не распространяется за `await` | Закрыто (изначально P2), тест `runtime.callback-scope.test.tsx` |
| C7 | Reactive value × владелец короче потребителя × освобождение | `useOwnedSignal`, `useOwnedComputed`, `useLease`, `useTransfer`, `isReleased` | **Готово**: owner берётся из текущего компонента; lease и transfer привязываются к текущему node. `useSignal` по-прежнему обычный signal без managed lifetime | Для разделяемого состояния с явным временем жизни — `useOwnedSignal`; запись через `.set()`. Borrow-проверка чтений — DEV-only | Закрыто (изначально P2), тест `runtime.callback-scope.test.tsx` |
| C8 | Два приложения × обмен состоянием × независимые scheduler | `createPort`, `usePortEndpoint()` и port errors экспортируются из reflex-dom | **Готово**: endpoint берёт domain приложения и node компонента; dispose node закрывает port. Tracked read DOM signal из чужого runtime по-прежнему запрещён | `createPort(sourceEndpoint, usePortEndpoint())`, `publish` на источнике, `port.read()` в приёмнике | Закрыто (изначально P2), тест `runtime.callback-scope.test.tsx` |
| C9 | Приложение × несколько root × полное завершение | `app.dispose()` / `renderer.dispose()`, `disposed` | **Готово**: освобождаются все текущие roots приложения, затем закрывается domain; если приложение было default renderer, default сбрасывается. Последующие render/hydrate/mount/resume бросают ошибку | Вызвать `app.dispose()` | Закрыто (изначально P2), тест `runtime.callback-scope.test.tsx` |
| C10 | Model × ресурс × отмена при dispose | `ctx.own`, `ctx.handle`, `ctx.signal`, `ctx.onDispose`, `ctx.action` | **Готово** для синхронных actions и disposable resources | Не нужен отдельный effect только ради владения ресурсом; async lifetime связывается через signal | Контрольная комбинация, код [S14] |

`useCallbackContext` не отменяет внешнюю подписку автоматически: регистрация и снятие слушателя по-прежнему на коде приложения (`onCleanup`/`useOwned`), общий `useEventListener` относится к M6. Формы с явным owner (`useContext(target, Token)`, `bindManaged`, `createOwnedSignal(owner, …)`, `lease(handle, node)`) остаются в `@volynets/reflex-framework` для интеграций.

## Структура, identity и hydration

| ID | Комбинация требований | Что уже доступно | Состояние reflex-dom | Что приходится делать сейчас | Приоритет / основание |
|---|---|---|---|---|---|
| R1 | Keyed `For` × перестановка × прежние item-объекты | Range move и keyed reconciliation | **Готово**: DOM и содержимое строки сохраняются | Стабильные уникальные ключи и стабильные ссылки на items | Контрольная комбинация, проба, [S9] |
| R2 | Keyed `For` × тот же key × новый объект item × local state | Строка создаётся один раз на key; `children(item, index)` получает accessors | **Готово**: новый объект с тем же key записывается в `item()`, строка, её DOM, компоненты и state сохраняются | Читать поля реактивно: `{() => item().label}` | Закрыто (изначально P1), тест `structure.identity.test.tsx` |
| R3 | Keyed `For` × перестановка × актуальный индекс | `index` — accessor, обновляется при move | **Готово**: move сохраняет строку и обновляет `index()` | `{() => index()}` в разметке строки | Закрыто (изначально P1), тест `structure.identity.test.tsx` |
| R4 | `For.children` callback × `useOwned` × удаление одной строки | У каждой строки свой ownership node; callback выполняется внутри него | **Готово**: hooks и ресурсы из callback закрываются при удалении строки | Ничего дополнительно; отдельный `<Row>` больше не обязателен | Закрыто (изначально P1), тест `structure.identity.test.tsx` |
| R5 | Portal × смена target × сохранение local state/DOM identity | Есть перенос DOM range; Portal уже отслеживает target | **Частично**: текущий Portal уничтожает прежний range и монтирует новый | Держать target стабильным, выносить state в model. Ручное перемещение DOM само не оформляет renderer-контракт переноса | P2, проба, [S8] |
| R6 | `Show`/`Switch` × скрытие × сохранение живой ветки | Есть ownership, DOM ranges, возможность внешнего хранения state | **Нет** KeepAlive/pause-resume контракта | Либо уничтожать ветку и выносить state, либо оставлять её mounted и скрывать CSS. CSS скрытие не останавливает effects/subscriptions | P2, код [S10] |
| R7 | Статический JSX × SSR × hydrate × event | SSR сериализация, поузловая hydration элементов | **Готово** для поддержанной статической структуры: element identity и handler восстанавливаются | Обычный `renderToString` + `hydrate` | Контрольная комбинация, существующий тест [S11] |
| R8 | Accessor/Show/Switch/For × SSR × вложенный handler/component lifetime | Hydration slot рекурсивно активирует содержимое под собственным ownership node | **Готово**: handlers и компоненты внутри динамических slots активируются при hydrate; первое обновление освобождает гидратированное поддерево как клиентское | Обычный `renderToString` + `hydrate` | Закрыто (изначально P1), тест `structure.identity.test.tsx` |
| R9 | Keyed `For` × SSR adoption × дальнейшая keyed identity | SSR оборачивает каждую строку и fallback в slot markers | **Готово**: hydration принимает строки как keyed records с item/index signals; дальнейшие move/replace/remove сохраняют identity | Обычный `renderToString` + `hydrate`. Формат SSR для `For` изменился: HTML от прежней версии не гидратируется и уходит в client mount | Закрыто (изначально P1), тест `structure.identity.test.tsx` |
| R10 | Shadow DOM × SSR × hydrate | Клиентские `shadowChildren`, refs, sheets и `elementInternals` реализованы | **Частично**: SSR исключает platform props, не сериализует shadow children; element hydration не запускает shadow mounting | Отдельная клиентская инициализация shadow subtree либо новая SSR/hydration ветка с декларативной разметкой | P2, код [S11], [S12], [S13] |
| R11 | `resume(container)` × HTML × восстановление приложения без JSX | Есть adoption существующего root range | **Нет** полной resumability: `resume` сохраняет/принимает DOM, но не восстанавливает замыкания, event graph и model state из HTML | Передавать JSX в hydrate либо использовать mount; для настоящей resumability нужен новый server/client identity и serialization контракт | Отдельная функция, код [S7] |

Сохранение DOM-узла, сохранение component owner, сохранение пользовательского state и восстановление обработчиков — четыре независимых свойства. Строки R2–R4 и R8–R9 закрыты тестами, которые проверяют каждое из четырёх свойств отдельно: identity DOM-узла, cleanup owner, локальный state и срабатывание handler. R5, R6, R10 и R11 остаются открытыми.

## Разметка и интеграции с DOM

| ID | Комбинация требований | Что уже доступно | Состояние reflex-dom | Что приходится делать сейчас | Приоритет / основание |
|---|---|---|---|---|---|
| M1 | CSS class × несколько условий × независимые токены | Reactive prop accessor и DOM classList | **Мост**: class поддерживает строку/accessor строки, object/classList binding нет | Вычислять строку в accessor; составлять utility/helper | P3, код [S15] |
| M2 | Style object × отдельные signals на значениях | Reactive whole-style binding и diff объектов | **Мост**: значения `StyleObject` скалярные, вложенные accessors не раскрываются | `style={() => ({ color: color(), width: width() })}`; возвращать актуальный объект. Мутация одного объекта на месте конфликтует с identity fast-path | P3, код [S15] |
| M3 | JSX spread × изменение набора prop keys × прежний element | Binder для отдельных reactive props | **Нет** общего динамического props-set diff; обычный JSX spread фиксирует набор props при создании renderable | Перечислять reactive props явно; для меняющегося набора ключей писать ref/effect adapter или пересоздавать element. Getter/accessor как значение отдельного prop не равен динамическому набору keys | P2, код [S16], [S19] |
| M4 | Custom element × object/function property × явный выбор attr/prop | `setAttr` присваивает существующее property через `name in el`; custom element types | **Частично**: нет `prop:`/`attr:` контракта; function-valued prop трактуется как accessor, типизированные custom props в основном скалярные | Custom typed wrapper + ref/property assignment; особенно для property, ещё не появившегося до upgrade | P2, код [S16] |
| M5 | Event listener object × `AbortSignal` × автоматическое отключение | `signal` из listener object передаётся в `addEventListener` | **Готово**: abort отключает handler | `onClick={{ handleEvent, signal }}` | Закрыто (изначально P1), тест `structure.identity.test.tsx` |
| M6 | Внешний EventTarget/observer × callback context × cleanup | `useOwned`, ref callback cleanup, `useAbortSignal`, `bindManaged` | **Мост**: нет общей declarative directive/useEventListener API для window/document/observer | Составлять managed callback, attach/dispose и owner signal самостоятельно. Для ranges уже есть `DOMRangeHandle.observe`, его не нужно изобретать заново | P2, код [S4], [S18] |
| M7 | Form value × пользовательский input × двусторонняя синхронизация | Managed form props и типизированный event/currentTarget | **Мост**: output binding и input handler есть отдельно; `bind:value` API нет | `value={name}` + `onInput={e => name(e.currentTarget.value)}`; parsing/validation/IME policy остаются на приложении | P3, код [S16] |

Реактивные props и JSX transformation уже существуют. Vite plugin может оборачивать настроенные выражения в accessors; это не реализует автоматически динамический spread, per-key style signals или function-property протокол.

## Async и планирование: где потребуется новый renderer-контракт

| ID | Комбинация требований | Что уже доступно | Пробел reflex-dom / обход | Классификация |
|---|---|---|---|---|
| A1 | AsyncSource × branch owner × cancel on unmount | `asyncDerived`, `AsyncOptions.signal`, `useAbortSignal`, disposable source | Подключать `{ signal: useAbortSignal() }` или владение через `useOwned`/model. Отдельного DOM resource hook нет | **Мост**, P2, код [S20] |
| A2 | Pending read × локальный fallback × retry при settle | `AsyncBlocker`, `pending`, `snapshot`, commit/attempt | Suspense/AsyncBoundary отсутствует. Собирать state/fallback вручную из реактивных async projections; для boundary нужны pending capture, повтор и cleanup | **Нет композиции**, P2, код [S2], [S20] |
| A3 | Ошибка descendant read/update × локальный fallback × reset | Обычные исключения и cleanup при неудачном initial mount | Нет ErrorBoundary-контракта, обрабатывающего последующие watcher updates. Перехватывать ошибки в собственных read/effect adapters и хранить error state | **Нет композиции**, P2, код [S2], [S7] |
| A4 | Async dependency × SSR × ожидание/stream | Async sources умеют resolve/refresh/cancel; SSR изолирован по request domain | `renderToString` синхронен, закрывает domain в finally. Нужны prefetch завершённых данных до SSR или отдельный async/streaming SSR pipeline | **Нет композиции**, код [S12], [S20] |
| A5 | Reactive rerun × все DOM writes завершены × measurement | Mount effects queue и обычный reactive scheduler | `useMountedEffect` откладывает только первое создание effect; следующие повторы не имеют общей after-DOM фазы. Для последующих измерений нужен явный протокол flush/measurement или browser scheduling с cleanup | **Частично**, P2, код [S21] |
| A6 | Большое обновление × уступка вводу × приоритет × отмена | Существуют стратегии eager/sab/flush и host microtask carrier | В production renderer нет time slicing/priority/cooperative yielding. Microtask coalescing не создаёт эти свойства | **Новый scheduler/renderer контракт**, а не потерянный готовый API; [S21] |

Нельзя считать уже готовыми concurrent rendering, rollback пользовательских side effects, transitions или полную resumability только потому, что есть ownership tree, execution domain и DOM ranges. Эти основания полезны, но не задают commit/abort и serialization протоколы.

## Исполняемые пересечения и результат

Семь временных probes выполнены для каждой стратегии `eager`, `sab`, `flush`, итого **21 проверка прошла**. После смены signal в структурных probes делался явный `renderer.flush()`, чтобы сравнивать settled результат; автоматическая latency доставки здесь не измерялась.

| Пересечение | Операция | Наблюдение во всех трёх стратегиях |
|---|---|---|
| Event × owner × cleanup | Click создаёт `useOwned`; затем dispose root | Plain handler: active component node отсутствует, cleanup не вызывается. `bindManaged` handler: cleanup вызывается |
| Event options × signal × abort | Передать listener object с signal, abort, click | Обработчик продолжает вызываться |
| Key × move × index | `[a,b] → [b,a]`, те же объекты | DOM identity сохранена; подписи `b:1`, `a:0` сохраняют прежние индексы |
| Key × immutable item × component | Новый `{id:'a', label:'new'}` вместо старого объекта | Старый child cleanup вызван; новый child mount и новый DOM element |
| For callback × resource × row removal | Создать `useOwned` прямо в children callback, затем `[]` | Cleanup ещё не вызван; вызывается при dispose root |
| Portal × target change × state lifetime | `target A → target B` | Старый child cleanup и новый DOM element |
| Dynamic slot × SSR adoption × event | Hydrate `<div>{() => <button onClick={...}/>}</div>` | Button DOM сохранён; click не вызывает handler |

Отдельно прошли **38 существующих проверок** из файлов:

- `ownership.differential.test.tsx`
- `lifecycle.event-ownership.test.tsx`
- `render.ssr-hydration.test.tsx`
- `composition-explorer.test.ts`
- `composition-explorer.api.test.tsx`
- `runtime.execution-domains.test.ts`
- `ssr.domain.test.tsx`

Это targeted jsdom verification, не полный suite и не browser qualification. Временный probe-файл удалён после проверки; production source не менялся в рамках аудита.

## Как расширить существующую комбинаторную проверку

В проекте уже есть Composition Explorer: `packages/reflex-dom/test/composition-explorer/model.ts` и его README. Он покрывает valid feature pairs и выбранные triples, включая signal/computed/memo/model/context/ref, семь consumers, четыре owner topology, DOM/SSR и три стратегии. Утверждение «комбинаторных проверок нет» было бы неверно.

Но его язык пока не описывает callback entry mode, await, async source, hydration как отдельную фазу, Shadow DOM, listener options, immutable item replacement и изменяемый target Portal. Наличие public export в API inventory не означает покрытия этих взаимодействий.

Для расширения нужны независимые оси:

| Ось | Значения, которые стоит явно добавить |
|---|---|
| Entry | component body; plain DOM event; managed event; timer; observer; post-await continuation |
| Ownership | component; row component; direct row callback; model; independent model; lease/transfer |
| Identity operation | same object; new object/same key; move; remove/reinsert; Portal target replacement |
| Host/activation | fresh mount; static hydrate; dynamic-slot hydrate; SSR; ShadowRoot; другой Document |
| Source | signal; context accessor; managed OwnedValue; store; async commit/attempt/error; port mirror |
| Observable obligation | output; DOM identity; owner ancestry; cleanup timing; event activation; cancellation; isolation |

Сначала покрывать допустимые пары; рискованные triples фиксировать отдельными контрактами. Не все декартовы сочетания валидны: например, DOM click на SSR и tracked cross-domain signal read не должны молча превращаться в «поддержано». Новые сценарии должны различать отсутствие capability, нарушение заявленного контракта и ожидаемую invalid combination.

Практический первый набор triples закрыт: C4, R2, R3, R4, R8, M5. Это уже воспроизведённые границы с наблюдаемыми последствиями. Из API-мостов остаётся A1; C1/C5/C7/C8 закрыты. Class/style/bind:value удобнее планировать после lifetime и hydration.

## Индекс исходников

- [S1: контексты, явный target, нереактивное provide](../../packages/reflex-framework/src/ownership/ownership.context.ts)
- [S2: публичный API DOM](../../packages/reflex-dom/src/index.ts)
- [S3: DOMContext и event dispatch](../../packages/reflex-dom/src/runtime/context.ts)
- [S4: managed callbacks и roots](../../packages/reflex-framework/src/domain/managed.ts)
- [S5: DOM useSignal и framework useSignal](../../packages/reflex-dom/src/hooks/use-signal.ts), [создание обычного producer](../../packages/reflex-framework/src/hooks/useSignal.ts)
- [S6: managed reactive lifetime, lease, transfer](../../packages/reflex-framework/src/domain/lifetime.ts)
- [S7: renderer.run/batch/resume и отсутствие общего dispose](../../packages/reflex-dom/src/client/renderer.ts), [app](../../packages/reflex-dom/src/client/app.ts), [domain ports](domain-ports.md)
- [S8: Portal target remount](../../packages/reflex-dom/src/mount/portal.ts)
- [S9: row mount/update/move и callback owner](../../packages/reflex-dom/src/mount/for.ts)
- [S10: generic content slot и замена содержимого](../../packages/reflex-dom/src/structure/content-slot.ts), [Show](../../packages/reflex-dom/src/mount/reactive.ts)
- [S11: hydration static/dynamic/For](../../packages/reflex-dom/src/hydrate/hydration.ts), [статическая hydration с событиями](../../packages/reflex-dom/test/render.ssr-hydration.test.tsx)
- [S12: SSR и исключение platform props](../../packages/reflex-dom/src/server/render-to-string.ts), [динамический hydrated slot](../../packages/reflex-dom/src/mount/slot.ts)
- [S13: клиентский Shadow DOM](../../packages/reflex-dom/src/mount/element.ts)
- [S14: model lifecycle](../../packages/reflex-dom/src/runtime/model.ts)
- [S15: class/style types](../../packages/reflex-dom/src/types/intrinsics.ts), [style scalar values](../../packages/reflex-dom/src/types/style.ts), [style diff](../../packages/reflex-dom/src/host/styles.ts)
- [S16: prop binder](../../packages/reflex-dom/src/mount/element-binder.ts), [attr/property routing](../../packages/reflex-dom/src/host/attr.ts), [form properties](../../packages/reflex-dom/src/host/forms.ts)
- [S17: listener options runtime](../../packages/reflex-dom/src/host/events.ts), [listener options types](../../packages/reflex-dom/src/types/events.ts)
- [S18: wrapperless range API с observe](../../packages/reflex-dom/src/host/range-handle.ts), [useOwned](../../packages/reflex-framework/src/hooks/useOwned.ts)
- [S19: JSX transform visitor](../../plugins/@vite/reflex-vite-plugin/src/visitor.ts)
- [S20: async public API](../../packages/reflex-async/src/index.ts), [async owner signal и snapshots](../../packages/reflex-async/src/async/types.ts)
- [S21: first-run mounted effect](../../packages/reflex-dom/src/hooks/use-mounted-effect.ts), [scheduler options](../../packages/reflex-dom/src/runtime/options.ts), [архитектурные ограничения](../../packages/reflex-dom/docs/ARCHITECTURE.ru.md)
