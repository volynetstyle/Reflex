# Онбординг для новых разработчиков `reflex-dom`

Этот документ помогает быстро войти в кодовую базу `reflex-dom` и начать
вносить изменения без слепого блуждания по файлам.

Он рассчитан на разработчика, который:

- уже умеет читать TypeScript и JSX;
- понимает базовую реактивность;
- хочет понять не только "что делает код", но и "почему он устроен именно так".

## Зачем существует `reflex-dom`

`reflex-dom` это DOM-рендерер для Reflex. Он превращает JSX и renderable-значения
в реальный DOM, но делает это через явную ownership-модель.

Главная идея пакета:

- DOM и реактивные эффекты должны жить и умирать вместе;
- удаление ветки должно гарантированно останавливать всё, что ей принадлежит;
- renderer не должен "терять" cleanup'ы, listeners, refs и вложенные reactive subtree.

Это не "ещё одна библиотека для вставки узлов в DOM". Это renderer, у которого
жизненный цикл дерева так же важен, как и само дерево узлов.

## Что важно понять в первый час

Если запомнить только четыре вещи, то вот они:

1. `reflex-dom` строит не одно дерево, а два:
   DOM-дерево для браузера и ownership-дерево для lifecycle/cleanup.
2. Корни и динамические области управляются через range-модель:
   renderer очищает только свой диапазон, а не весь контейнер.
3. Реактивные ветки не патчатся "магией":
   они монтируются через slot/range-примитивы с явной заменой содержимого.
4. Новый функционал почти всегда должен ответить на вопрос:
   "Кто владеет этим эффектом/поддеревом и кто его уничтожит?"

## Быстрый старт

Из корня монорепозитория:

```bash
pnpm install
pnpm --filter reflex-dom test
pnpm --filter reflex-dom typecheck
pnpm --filter reflex-dom build
```

Полезные команды именно для повседневной работы с пакетом:

```bash
pnpm --filter reflex-dom test
pnpm --filter reflex-dom typecheck
pnpm --filter reflex-dom exec vitest run test/render.smoke.test.tsx
pnpm --filter reflex-dom exec vitest run test/render.ssr-hydration.test.tsx
```

## Где пакет находится в монорепозитории

`reflex-dom` не живёт сам по себе. Он стоит поверх двух слоёв:

- `packages/reflex`
  публичная реактивная facade API, которой чаще всего пользуется приложение;
- `packages/reflex-framework`
  ownership, JSX runtime и bridge-слой между реактивностью и renderer'ом.

Практический вывод:

- если проблема в lifecycle, cleanup или scope ownership, почти всегда нужно
  смотреть в `reflex-framework/ownership`;
- если проблема в сигналах, memo/effect и их семантике, смотреть нужно в
  `packages/reflex`;
- если проблема в маппинге renderable -> DOM, смотреть нужно уже в `reflex-dom`.

## Как читать код в правильном порядке

Ниже маршрут, который даёт максимум понимания при минимуме переключений.

### Шаг 1. Публичная поверхность

Начни с этих файлов:

- `src/index.ts`
- `src/runtime.ts`
- `src/runtime/singleton.ts`
- `src/runtime/renderer.ts`

Что нужно увидеть:

- какие API считаются публичными;
- что такое singleton-runtime и отдельный renderer instance;
- как выглядят `render()`, `hydrate()`, `resume()`, `mount()` и `renderToString()`.

### Шаг 2. Корневой mount lifecycle

Дальше смотри:

- `src/render.ts`
- `src/hydration.ts`
- `src/structure/render-range.ts`
- `src/runtime/root-store.ts`

Что нужно понять:

- root больше не очищает контейнер целиком;
- renderer владеет только своим диапазоном между anchor-узлами;
- hydration и resume строятся поверх того же managed-range;
- mounted root хранится на контейнере самом, а не в renderer-local `WeakMap`.

### Шаг 3. Главный dispatcher

Потом:

- `src/mount/append.ts`
- `src/mount/renderable.ts`

Это центр маршрутизации renderable-значений:

- primitive text;
- `Node`;
- accessor;
- element renderable;
- component renderable;
- `Show`, `Switch`, `For`, `Portal`.

Если непонятно, "почему этот JSX оказался именно в этом mount path", ответ
почти всегда здесь.

### Шаг 4. Element mount path

Потом:

- `src/mount/element.ts`
- `src/mount/element-binder.ts`
- `src/bindings/property.ts`
- `src/host/*`

Что нужно понять:

- создание узла и выбор namespace;
- разделение initial/deferred prop binding;
- где применяется `ref`;
- где подключаются события;
- где проходит controlled form logic;
- как работают Shadow DOM, custom elements, `ElementInternals`,
  `adoptedStyleSheets`.

### Шаг 5. Динамические области

Дальше:

- `src/structure/content-slot.ts`
- `src/mount/reactive-slot.ts`
- `src/mount/show.ts`
- `src/mount/switch.ts`
- `src/mount/for.ts`
- `src/reconcile/keyed.ts`

Это слой, который отвечает за:

- заменяемые branch region;
- lifecycle реактивных слотов;
- keyed reconciliation;
- безопасное уничтожение старой ветки перед монтированием новой.

### Шаг 6. Серверная сторона

Потом:

- `src/server/render-to-string.ts`
- `src/hydrate/markers.ts`

Что важно:

- SSR здесь базовый и честный;
- dynamic slot'ы помечаются hydration markers;
- `hydrate()` старается принять уже существующий DOM без пересоздания;
- при несовпадении возможен controlled fallback на обычный client mount внутри
  управляемого диапазона.

### Шаг 7. Тесты как документация поведения

Обязательно прочитай:

- `test/render.smoke.test.tsx`
- `test/render.lifecycle.test.tsx`
- `test/render.platform.test.tsx`
- `test/render.ssr-hydration.test.tsx`
- `test/render.operators.test.tsx`
- `test/types.typecheck.tsx`

В `reflex-dom` тесты это не вторичный артефакт, а фактическая executable
спецификация текущего поведения.

## Ментальная модель пакета

### 1. Ownership важнее "удобства"

Если обычный UI-рендерер в первую очередь думает "как быстро вставить узел",
то `reflex-dom` сначала думает:

- кому принадлежит эта работа;
- что нужно убрать при замене ветки;
- как гарантировать cleanup в правильном порядке.

Поэтому в коде так много внимания уделено:

- `createScope()`;
- `runInOwnershipScope()`;
- `registerCleanup()`;
- разбиению больших mount path на маленькие lifecycle-aware функции.

### 2. Root это не просто container

Корень рендера это управляемый диапазон внутри контейнера.

Это даёт три важных свойства:

- можно не разрушать "чужой" DOM;
- можно принимать уже существующую разметку через `resume()` и `hydrate()`;
- можно безопасно делать renderer handoff между разными renderer instance.

### 3. Dynamic UI строится через slot'ы

Accessor, `Show`, `Switch`, `For` и частично hydration опираются на slot/range
примитивы.

Практический смысл:

- реактивная ветка всегда имеет границы;
- очистка ветки не задевает соседей;
- nested effects не протекают за пределы своей области.

### 4. Host-слой отделён от mount-слоя

`mount/*` отвечает за структуру и lifecycle.

`host/*` отвечает за конкретные записи в DOM:

- props;
- styles;
- attrs;
- events;
- refs;
- namespaces;
- form semantics.

Это разделение важно сохранять. Если feature одновременно и решает lifecycle,
и напрямую меняет DOM, её обычно стоит разделить на две части.

## Карта файлов по зонам ответственности

### Публичный API

- `src/index.ts`
- `src/runtime.ts`
- `src/runtime/singleton.ts`
- `src/server.ts`

### Корневой lifecycle

- `src/render.ts`
- `src/hydration.ts`
- `src/runtime/renderer.ts`
- `src/runtime/root-store.ts`
- `src/structure/render-range.ts`

### Mount dispatcher и базовые mount path

- `src/mount/append.ts`
- `src/mount/renderable.ts`
- `src/mount/component.ts`
- `src/mount/element.ts`
- `src/mount/portal.ts`

### Dynamic branch infrastructure

- `src/structure/content-slot.ts`
- `src/mount/reactive-slot.ts`
- `src/mount/show.ts`
- `src/mount/switch.ts`
- `src/mount/for.ts`
- `src/reconcile/keyed.ts`

### DOM host writes

- `src/host/props.ts`
- `src/host/attr.ts`
- `src/host/styles.ts`
- `src/host/events.ts`
- `src/host/forms.ts`
- `src/host/refs.ts`
- `src/host/namespace.ts`
- `src/host/aliases.ts`

### Типы и JSX surface

- `src/types/*`
- `src/runtime/jsx.ts`
- `src/jsx-runtime.ts`
- `src/jsx-dev-runtime.ts`

### Сервер и hydration markers

- `src/server/render-to-string.ts`
- `src/hydrate/markers.ts`

### Тесты

- `test/*.test.tsx`
- `test/types.typecheck.tsx`

## Как проходит рендер, если смотреть сквозным путём

Для вызова:

```tsx
render(
  <App>
    {() => visible() ? <Panel count={count} /> : null}
  </App>,
  container,
);
```

упрощённая цепочка такая:

1. `render()` выбирает текущий renderer instance.
2. `renderWithRenderer()` создаёт или переиспользует managed root range.
3. Внутри ownership scope вызывается `appendRenderableNodes()`.
4. Dispatcher определяет тип значения.
5. Если это component renderable, создаётся child scope и монтируется результат компонента.
6. Если это accessor, создаётся dynamic slot с anchor-комментариями.
7. Если accessor возвращает `<Panel />`, слот монтирует новую subtree внутри своего scope.
8. При изменении `visible()` слот уничтожает старую ветку и очищает только свой диапазон.
9. Родительские DOM-узлы и соседние ветки остаются нетронутыми.

## Что уже умеет `reflex-dom`

На момент этого онбординга пакет уже покрывает:

- обычный SPA/UI DOM;
- controlled semantics для `input`, `textarea`, `select`, `option`;
- IME/caret-safe обновления;
- SVG и MathML namespaces;
- custom elements и dashed tags;
- ShadowRoot target и shadow children;
- `ElementInternals` и `adoptedStyleSheets` в базовом виде;
- `Portal`;
- `renderToString()`;
- базовый `hydrate()`;
- базовый `resume()`;
- renderer handoff без полного разрушения чужого DOM;
- ownership-based cleanup для root и subtree.

## Что пока считать базовым, а не "полностью закрытым"

Нужно честно помнить, что некоторые вещи здесь уже есть, но пока на базовом уровне:

- hydration лучше всего работает с разметкой, созданной собственным `renderToString()`;
- `Portal` на сервере сейчас рендерится как пустота;
- keyed hydration пока не является полноценным DOM adoption алгоритмом;
- SSR и hydration вокруг сложных платформенных edge-case'ов ещё не на уровне
  "полный браузерный DOM runtime".

Это не баг в документации. Это часть правильного ментального контракта с кодом.

## Как вносить изменения без поломки архитектуры

Перед любым изменением задай себе пять вопросов:

1. Это root-level feature, subtree feature или host-level feature?
2. Нужен ли для неё отдельный lifecycle scope?
3. Нужен ли ей собственный управляемый диапазон?
4. Должна ли она переживать hydration/resume?
5. Какой тест должен доказать, что cleanup не протекает?

### Если ты добавляешь новый renderable

Почти всегда нужно пройтись по цепочке:

- `src/operators/*`
- `src/mount/renderable.ts`
- `src/mount/append.ts`
- соответствующий `mount/*.ts`
- тесты поведения
- возможно SSR/hydration поддержка

### Если ты добавляешь новый DOM prop или platform feature

Скорее всего изменения нужны в:

- `src/types/intrinsics.ts`
- `src/host/props.ts`
- `src/host/forms.ts` или другом host-файле
- `src/mount/element.ts`
- typecheck tests
- platform tests

### Если ты трогаешь hydration/SSR

Проверь сразу три режима:

- чистый client `render()`;
- `renderToString()` + `hydrate()`;
- `resume()` на уже готовом DOM.

Если feature ведёт себя по-разному в этих трёх режимах, это нужно либо
осознанно поддержать, либо честно задокументировать.

## Типичный рабочий цикл изменения

Нормальный порядок работы в этом пакете такой:

1. Найти слой изменения.
2. Прочитать ближайшие тесты на эту зону.
3. Добавить или обновить тест под новое поведение.
4. Внести минимальное изменение в runtime.
5. Проверить `test`.
6. Проверить `typecheck`.
7. Если меняется public API, обновить README и типовые тесты.

## На какие тесты смотреть в зависимости от симптома

Если ломается root replacement или cleanup:

- `test/render.lifecycle.test.tsx`

Если ломается базовый DOM mount:

- `test/render.smoke.test.tsx`

Если ломается platform-level поведение:

- `test/render.platform.test.tsx`

Если ломается SSR/hydration/portal/resume:

- `test/render.ssr-hydration.test.tsx`

Если ломается surface typing:

- `test/types.typecheck.tsx`

## Частые ошибки новых разработчиков

### Ошибка 1. Делать cleanup "где-нибудь потом"

В `reflex-dom` cleanup нельзя откладывать до абстрактного "после".
Его owner должен быть ясен в момент монтирования.

Правильный вопрос:

- в каком scope регистрируется cleanup?

### Ошибка 2. Чистить весь контейнер

Полный teardown контейнера кажется простым решением, но ломает:

- resume;
- hydration;
- coexistence с чужим DOM;
- точечный lifecycle control.

Если возникает желание вызвать тотальную очистку, почти всегда нужно подумать
в терминах managed range.

### Ошибка 3. Смешивать lifecycle и host writes

Если в одном месте и создаётся subtree scope, и пишутся низкоуровневые DOM props,
такой код быстро становится трудно расширять и трудно тестировать.

### Ошибка 4. Добавлять feature только в client mount

После появления `renderToString()`, `hydrate()` и `resume()` почти любая
публичная feature должна быть оценена не в одном режиме, а как минимум в двух:

- обычный client mount;
- SSR/hydration путь.

### Ошибка 5. Считать тесты второстепенными

У этого пакета архитектура жёстко завязана на lifecycle guarantees.
Такие гарантии плохо удерживаются "в голове", но хорошо удерживаются тестами.

## Рекомендуемый маршрут первого рабочего дня

Если новый разработчик приходит именно в `reflex-dom`, я бы рекомендовал такой
порядок на один день:

1. Прочитать `packages/reflex-dom/README.md`.
2. Прочитать этот файл полностью.
3. Открыть `src/runtime.ts`, `src/render.ts`, `src/mount/append.ts`.
4. Открыть `src/structure/render-range.ts` и `src/structure/content-slot.ts`.
5. Прочитать `test/render.lifecycle.test.tsx`.
6. Прочитать `test/render.ssr-hydration.test.tsx`.
7. Прочитать `src/mount/element.ts` и `src/host/forms.ts`.
8. Только после этого идти в конкретную задачу.

Такой маршрут даёт хороший шанс понять систему сверху вниз, а не застрять
в одном локальном файле без общей картины.

## Рекомендуемый маршрут первой задачи

Для первой задачи лучше брать что-то из этих классов:

- новый platform prop с понятным lifecycle;
- новый тест на lifecycle/hydration edge-case;
- улучшение typed surface;
- небольшой host-layer fix.

Для первой задачи хуже подходят:

- переписывание reconciliation;
- глубокая переделка ownership модели;
- большой рефактор SSR/hydration без набора тестов;
- "быстрая оптимизация" без измеримого кейса.

## Набор ориентиров "код написан в стиле пакета"

Изменение обычно считается хорошо вписанным, если:

- функция делает один lifecycle-шаг и названа по его смыслу;
- ownership границы читаются по коду без гадания;
- очистка регистрируется рядом с созданием ресурса;
- поведение подтверждено тестом;
- новый API не торчит только в одном месте, а поддержан в типах и runtime.

## Краткий глоссарий

### Ownership scope

Область владения, внутри которой регистрируются cleanup'ы и вложенная работа.

### Managed range

Диапазон узлов между двумя anchor-узлами, которым владеет renderer.

### Content slot

Заменяемая динамическая область с границами и собственным lifecycle.

### Hydration

Привязка runtime к уже существующему DOM без обязательного пересоздания узлов.

### Resume

Принятие готового DOM под управление renderer'ом без повторного монтирования дерева.

### Portal

Renderable, который оставляет логическое место в родительском дереве, но
физически монтирует children в другой target.

## Что читать дальше после онбординга

После этого документа логичный следующий набор:

- `packages/reflex-dom/README.md`
- `packages/reflex-dom/test/render.lifecycle.test.tsx`
- `packages/reflex-dom/test/render.platform.test.tsx`
- `packages/reflex-dom/test/render.ssr-hydration.test.tsx`

Если задача упрётся в ownership глубже renderer'а, потом смотри:

- `packages/reflex-framework/src/ownership/*`

Если задача упрётся в reactive semantics:

- `packages/reflex/src/*`

## Последний совет

Если в какой-то момент кажется, что код можно сильно упростить "если просто
перерендерить всё заново", почти наверняка ты стоишь ровно в той точке, где
архитектура `reflex-dom` специально сопротивляется упрощению.

Это хороший сигнал остановиться и спросить:

- а какую lifecycle-гарантию я сейчас случайно ломаю?
