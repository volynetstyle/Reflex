# DOM Nesting Validation

Этот модуль предоставляет оптимизированную валидацию вложенности HTML элементов согласно спецификации HTML5.

## Основные файлы

### `DOMNestingClassificator.ts`
Основной модуль валидации с оптимизированной структурой данных:
- **PHRASING_ELEMENTS**: Набор фразовых элементов согласно HTML5
- **SCRIPT_SUPPORTING**: Элементы поддержки скриптов
- **VOID_ELEMENTS**: Самозакрывающиеся элементы
- **NESTING_RULES**: Оптимизированные правила вложенности

### `nestingRule.ts` 
Клиентский модуль для обратной совместимости, использует общие константы.

## Оптимизации

1. **Удалены дубликаты**: Константы определены в одном месте
2. **Упрощена структура**: Использование строковых литералов вместо массивов 
3. **Добавлены ссылки на спецификацию**: Все правила привязаны к HTML5 spec
4. **Оптимизирована производительность**: Использование Set вместо Array для поиска
5. **Добавлены утилитарные функции**: isPhrasingContent, isVoidElement

## API

```typescript
// Валидация вложенности
validateDOMNesting(childTag: string, parentTag: string | null, ancestorInfo: AncestorInfo): boolean

// Обновление контекста предков  
updateAncestorInfo(info: AncestorInfo | null, tag: string): AncestorInfo

// Утилиты
isPhrasingContent(tagName: string): boolean
isVoidElement(tagName: string): boolean
```

## Использование

```typescript
import { validateDOMNesting, updateAncestorInfo, isPhrasingContent } from './DOMNestingClassificator';

const ancestorInfo = updateAncestorInfo(null, 'div');
const isValid = validateDOMNesting('p', 'div', ancestorInfo);
const isPhrasing = isPhrasingContent('span'); // true
```
