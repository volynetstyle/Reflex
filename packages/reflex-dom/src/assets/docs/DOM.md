# Современное руководство по Document Object Model (DOM) - 2025

## Оглавление

1. [Введение в DOM](#введение-в-dom)
2. [Структура и архитектура DOM](#структура-и-архитектура-dom)
3. [Типы узлов DOM](#типы-узлов-dom)
4. [Современные методы селекции элементов](#современные-методы-селекции-элементов)
5. [Навигация по DOM-дереву](#навигация-по-dom-дереву)
6. [Работа с атрибутами и свойствами](#работа-с-атрибутами-и-свойствами)
7. [Манипуляция содержимым](#манипуляция-содержимым)
8. [Создание и удаление элементов](#создание-и-удаление-элементов)
9. [Современная система событий](#современная-система-событий)
10. [Performance и оптимизация](#performance-и-оптимизация)
11. [Web Components и Shadow DOM](#web-components-и-shadow-dom)
12. [Accessibility и семантика](#accessibility-и-семантика)
13. [Безопасность DOM](#безопасность-dom)
14. [Лучшие практики 2025](#лучшие-практики-2025)

---

## Введение в DOM

Document Object Model (DOM) — это программный интерфейс для HTML и XML документов, который представляет структуру документа как дерево объектов. DOM не является частью самого JavaScript, а представляет собой стандартизированный Web API, позволяющий скриптам взаимодействовать с содержимым веб-страниц.

### Зачем нужен DOM?

DOM решает несколько ключевых задач:
- **Структурированное представление**: Документ представляется как иерархическое дерево узлов
- **Динамическое взаимодействие**: Позволяет изменять содержимое, структуру и стили в реальном времени
- **Событийная модель**: Обеспечивает реакцию на действия пользователя
- **Кроссплатформенность**: Единый интерфейс для разных браузеров

### Эволюция DOM (2020-2025)

За последние годы DOM претерпел значительные изменения:
- **DOM Living Standard**: Переход от версионной модели к живому стандарту
- **Improved Performance**: Оптимизация операций с DOM для лучшей производительности
- **Modern APIs**: Новые методы и свойства для работы с элементами
- **Better Integration**: Улучшенная интеграция с современными фреймворками

---

## Структура и архитектура DOM

### DOM как дерево

HTML-документ представляется в виде дерева, где каждый элемент является узлом (node). Рассмотрим пример:

```html
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>Пример DOM</title>
</head>
<body>
    <header>
        <h1 id="main-title">Заголовок</h1>
        <nav class="navigation">
            <ul>
                <li><a href="#home">Главная</a></li>
                <li><a href="#about">О нас</a></li>
            </ul>
        </nav>
    </header>
    <main>
        <article class="content">
            <p>Первый абзац с <strong>жирным текстом</strong>.</p>
            <p>Второй абзац.</p>
        </article>
    </main>
</body>
</html>
```

Это создает следующую структуру дерева:

```
Document
└── html
    ├── head
    │   ├── meta
    │   └── title
    │       └── "Пример DOM" (текстовый узел)
    └── body
        ├── header
        │   ├── h1#main-title
        │   │   └── "Заголовок" (текстовый узел)
        │   └── nav.navigation
        │       └── ul
        │           ├── li
        │           │   └── a
        │           │       └── "Главная" (текстовый узел)
        │           └── li
        │               └── a
        │                   └── "О нас" (текстовый узел)
        └── main
            └── article.content
                ├── p
                │   ├── "Первый абзац с " (текстовый узел)
                │   ├── strong
                │   │   └── "жирным текстом" (текстовый узел)
                │   └── "." (текстовый узел)
                └── p
                    └── "Второй абзац." (текстовый узел)
```

### Отношения между узлами

Каждый узел в DOM имеет следующие отношения:
- **Родительский узел** (parent node): Узел, который содержит данный узел
- **Дочерние узлы** (child nodes): Узлы, содержащиеся в данном узле
- **Соседние узлы** (sibling nodes): Узлы на том же уровне иерархии

---

## Типы узлов DOM

### Иерархия типов узлов

```javascript
// Основные типы узлов (Node.nodeType константы)
const NODE_TYPES = {
    ELEMENT_NODE: 1,                // <div>, <p>, <a> и т.д.
    ATTRIBUTE_NODE: 2,              // class="example" (устарело)
    TEXT_NODE: 3,                   // Текстовое содержимое
    CDATA_SECTION_NODE: 4,          // <![CDATA[...]]>
    PROCESSING_INSTRUCTION_NODE: 7, // <?xml-stylesheet?>
    COMMENT_NODE: 8,                // <!-- комментарий -->
    DOCUMENT_NODE: 9,               // document
    DOCUMENT_TYPE_NODE: 10,         // <!DOCTYPE html>
    DOCUMENT_FRAGMENT_NODE: 11      // DocumentFragment
};
```

### Проверка типа узла

```javascript
function analyzeNode(node) {
    switch (node.nodeType) {
        case Node.ELEMENT_NODE:
            console.log(`Элемент: ${node.tagName.toLowerCase()}`);
            break;
        case Node.TEXT_NODE:
            console.log(`Текст: "${node.textContent.trim()}"`);
            break;
        case Node.COMMENT_NODE:
            console.log(`Комментарий: ${node.textContent}`);
            break;
        default:
            console.log(`Другой тип узла: ${node.nodeType}`);
    }
}

// Современный способ проверки с использованием instanceof
if (node instanceof Element) {
    // Это элемент
} else if (node instanceof Text) {
    // Это текстовый узел
} else if (node instanceof Comment) {
    // Это комментарий
}
```

### Специализированные интерфейсы элементов

```javascript
// Примеры специализированных интерфейсов
const img = document.createElement('img');
console.log(img instanceof HTMLImageElement); // true
console.log(img instanceof HTMLElement);      // true
console.log(img instanceof Element);          // true
console.log(img instanceof Node);             // true

const form = document.createElement('form');
console.log(form instanceof HTMLFormElement); // true

const input = document.createElement('input');
console.log(input instanceof HTMLInputElement); // true
```

---

## Современные методы селекции элементов

### Основные методы селекции

#### querySelector и querySelectorAll (рекомендуемые)

```javascript
// Современный подход - использование CSS-селекторов
const element = document.querySelector('#main-title');
const elements = document.querySelectorAll('.navigation li a');

// Сложные селекторы
const specificElement = document.querySelector('article.content p:first-child strong');
const elementsWithAttribute = document.querySelectorAll('[data-active="true"]');

// Псевдо-селекторы
const evenItems = document.querySelectorAll('li:nth-child(even)');
const lastParagraph = document.querySelector('p:last-of-type');
```

#### Классические методы (для совместимости)

```javascript
// Все еще используются, но менее гибкие
const elementById = document.getElementById('main-title');
const elementsByClass = document.getElementsByClassName('navigation');
const elementsByTag = document.getElementsByTagName('p');

// Внимание: getElementsBy* возвращают живые коллекции!
const liveCollection = document.getElementsByTagName('p');
console.log(liveCollection.length); // например, 2

document.body.appendChild(document.createElement('p'));
console.log(liveCollection.length); // теперь 3!
```

### Продвинутые техники селекции

#### Селекция относительно элемента

```javascript
const container = document.querySelector('.content');

// Поиск внутри конкретного элемента
const childParagraphs = container.querySelectorAll('p');
const directChildren = container.children; // только прямые потомки-элементы

// Поиск ближайшего родителя
const article = container.closest('article');
const header = container.closest('header, main, footer'); // первый найденный

// Проверка соответствия селектору
if (container.matches('.content')) {
    console.log('Элемент соответствует селектору');
}
```

#### Современные методы поиска

```javascript
// Поиск следующего/предыдущего элемента по селектору (2023+)
const nextButton = currentButton.nextElementSibling?.matches('button') 
    ? currentButton.nextElementSibling 
    : null;

// Использование :has() селектора (поддержка с 2023)
const articlesWithImages = document.querySelectorAll('article:has(img)');
const formsWithErrors = document.querySelectorAll('form:has(.error)');

// Селекция по пользовательским атрибутам
const dataElements = document.querySelectorAll('[data-component]');
const stateElements = document.querySelectorAll('[data-state="loading"]');
```

### Производительность селекции

```javascript
// Оптимизированные стратегии селекции
class DOMCache {
    constructor() {
        this.cache = new Map();
    }
    
    querySelector(selector, context = document) {
        const key = `${selector}:${context.tagName || 'document'}`;
        if (!this.cache.has(key)) {
            this.cache.set(key, context.querySelector(selector));
        }
        return this.cache.get(key);
    }
    
    invalidate(selector) {
        for (let key of this.cache.keys()) {
            if (key.startsWith(selector)) {
                this.cache.delete(key);
            }
        }
    }
}

const domCache = new DOMCache();

// Избегайте повторных селекций
// Плохо:
for (let i = 0; i < 100; i++) {
    document.querySelector('.expensive-selector').style.left = i + 'px';
}

// Хорошо:
const element = document.querySelector('.expensive-selector');
for (let i = 0; i < 100; i++) {
    element.style.left = i + 'px';
}
```

---

## Навигация по DOM-дереву

### Свойства для навигации

```javascript
const element = document.querySelector('.content');

// Родительские элементы
console.log(element.parentNode);        // Родительский узел (любой тип)
console.log(element.parentElement);     // Родительский элемент
console.log(element.closest('article')); // Ближайший предок по селектору

// Дочерние элементы
console.log(element.childNodes);        // Все дочерние узлы (включая текст)
console.log(element.children);          // Только элементы
console.log(element.firstChild);        // Первый дочерний узел
console.log(element.firstElementChild); // Первый дочерний элемент
console.log(element.lastChild);         // Последний дочерний узел
console.log(element.lastElementChild);  // Последний дочерний элемент

// Соседние элементы
console.log(element.previousSibling);        // Предыдущий узел
console.log(element.previousElementSibling); // Предыдущий элемент
console.log(element.nextSibling);            // Следующий узел
console.log(element.nextElementSibling);     // Следующий элемент
```

### Современные методы навигации

```javascript
// Итерация по элементам с проверкой типа
function* walkElements(root) {
    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT,
        null,
        false
    );
    
    let node = walker.currentNode;
    while (node) {
        yield node;
        node = walker.nextNode();
    }
}

// Использование
for (const element of walkElements(document.body)) {
    console.log(element.tagName);
}

// Безопасная навигация с проверками
function safeNavigate(element, path) {
    return path.split('.').reduce((current, prop) => {
        return current?.[prop] || null;
    }, element);
}

// Пример: element.parentElement.nextElementSibling.firstElementChild
const result = safeNavigate(element, 'parentElement.nextElementSibling.firstElementChild');
```

### Утилиты для работы с DOM-деревом

```javascript
// Полезные утилиты для навигации
const DOMUtils = {
    // Получить всех предков
    getAncestors(element) {
        const ancestors = [];
        let current = element.parentElement;
        while (current) {
            ancestors.push(current);
            current = current.parentElement;
        }
        return ancestors;
    },
    
    // Получить всех потомков (только элементы)
    getDescendants(element) {
        return Array.from(element.querySelectorAll('*'));
    },
    
    // Получить всех соседей
    getSiblings(element) {
        return Array.from(element.parentElement.children)
            .filter(sibling => sibling !== element);
    },
    
    // Найти общего предка
    getCommonAncestor(element1, element2) {
        const ancestors1 = this.getAncestors(element1);
        const ancestors2 = this.getAncestors(element2);
        
        return ancestors1.find(ancestor => ancestors2.includes(ancestor));
    },
    
    // Проверить, является ли элемент потомком
    isDescendant(child, parent) {
        return parent.contains(child) && parent !== child;
    }
};
```

---

## Работа с атрибутами и свойствами

### Различие между атрибутами и свойствами

```javascript
const input = document.querySelector('input[type="text"]');

// HTML: <input type="text" value="default" id="myInput">

// Атрибуты (в HTML)
console.log(input.getAttribute('value')); // "default"
input.setAttribute('value', 'new value');
console.log(input.hasAttribute('required')); // false
input.removeAttribute('value');

// Свойства (в DOM объекте)
console.log(input.value); // текущее значение в поле
input.value = 'current value';
console.log(input.type);  // "text"
console.log(input.id);    // "myInput"
```

### Современная работа с атрибутами

```javascript
// Работа с пользовательскими атрибутами data-*
const element = document.querySelector('.component');

// Через dataset (рекомендуется)
element.dataset.userId = '123';           // data-user-id="123"
element.dataset.isActive = 'true';        // data-is-active="true"
console.log(element.dataset.userId);      // "123"

// Прямое обращение к атрибутам
element.setAttribute('data-config', JSON.stringify({theme: 'dark'}));
const config = JSON.parse(element.getAttribute('data-config'));

// Работа с булевыми атрибутами
function setBooleanAttribute(element, attrName, value) {
    if (value) {
        element.setAttribute(attrName, '');
    } else {
        element.removeAttribute(attrName);
    }
}

setBooleanAttribute(input, 'required', true);  // <input required>
setBooleanAttribute(input, 'disabled', false); // атрибут удаляется

// Современный способ проверки поддержки атрибутов
function supportsAttribute(element, attribute) {
    const testElement = element.cloneNode(false);
    testElement.setAttribute(attribute, 'test');
    return testElement.getAttribute(attribute) === 'test';
}
```

### Работа с классами

```javascript
const element = document.querySelector('.example');

// Современные методы работы с классами
element.classList.add('new-class', 'another-class');
element.classList.remove('old-class');
element.classList.toggle('active');                    // переключить
element.classList.toggle('visible', shouldBeVisible);  // условное переключение
element.classList.replace('old-class', 'new-class');

// Проверки
console.log(element.classList.contains('active'));     // true/false
console.log(element.classList.length);                 // количество классов
console.log(Array.from(element.classList));            // массив классов

// Массовые операции с классами
const classManager = {
    addMultiple(element, ...classes) {
        element.classList.add(...classes);
    },
    
    removeMultiple(element, ...classes) {
        element.classList.remove(...classes);
    },
    
    toggleMultiple(element, classes) {
        Object.entries(classes).forEach(([className, condition]) => {
            element.classList.toggle(className, condition);
        });
    }
};

classManager.toggleMultiple(element, {
    'loading': isLoading,
    'error': hasError,
    'success': isSuccess
});
```

### Работа со стилями

```javascript
const element = document.querySelector('.styled-element');

// Прямое изменение стилей (не рекомендуется для продакшена)
element.style.backgroundColor = 'red';
element.style.fontSize = '16px';
element.style.setProperty('--custom-var', '20px'); // CSS переменные

// Массовое применение стилей
function applyStyles(element, styles) {
    Object.assign(element.style, styles);
}

applyStyles(element, {
    backgroundColor: 'blue',
    color: 'white',
    padding: '10px'
});

// Получение вычисленных стилей
const computedStyles = getComputedStyle(element);
console.log(computedStyles.backgroundColor);
console.log(computedStyles.getPropertyValue('font-size'));

// Работа с CSS переменными
element.style.setProperty('--primary-color', '#007bff');
const primaryColor = computedStyles.getPropertyValue('--primary-color');

// Утилита для работы со стилями
const StyleManager = {
    set(element, property, value) {
        element.style.setProperty(property, value);
    },
    
    get(element, property) {
        return getComputedStyle(element).getPropertyValue(property);
    },
    
    remove(element, property) {
        element.style.removeProperty(property);
    },
    
    has(element, property) {
        return element.style.getPropertyValue(property) !== '';
    }
};
```

---

## Манипуляция содержимым

### Основные свойства содержимого

```javascript
const element = document.querySelector('.content');

// Текстовое содержимое
console.log(element.textContent);    // весь текст без HTML
console.log(element.innerText);      // видимый текст с учетом стилей
element.textContent = 'Новый текст'; // безопасная замена

// HTML содержимое
console.log(element.innerHTML);      // HTML как строка
element.innerHTML = '<strong>Жирный текст</strong>'; // ОПАСНО!

// Внешний HTML
console.log(element.outerHTML);      // включая сам элемент
element.outerHTML = '<div class="new">Новый элемент</div>'; // замена элемента
```

### Безопасная работа с HTML

```javascript
// Безопасная вставка HTML (современный подход)
function setHTMLSafely(element, htmlString) {
    // Создаем DocumentFragment
    const template = document.createElement('template');
    template.innerHTML = htmlString;
    
    // Очищаем содержимое
    element.textContent = '';
    
    // Добавляем содержимое
    element.appendChild(template.content);
}

// Альтернатива - создание элементов через DOM
function createElementFromHTML(htmlString) {
    const div = document.createElement('div');
    div.innerHTML = htmlString.trim();
    return div.firstElementChild;
}

// Санитизация HTML (требует внешней библиотеки, например DOMPurify)
function setSanitizedHTML(element, htmlString) {
    // element.innerHTML = DOMPurify.sanitize(htmlString);
    console.warn('Используйте библиотеку санитизации для безопасности');
}

// Современный API для вставки HTML (экспериментальный)
if ('setHTML' in Element.prototype) {
    element.setHTML('<p>Безопасный HTML</p>');
}
```

### Продвинутые техники работы с содержимым

```javascript
// Работа с текстом с сохранением структуры
function setTextContent(element, text) {
    // Создаем текстовый узел
    const textNode = document.createTextNode(text);
    element.textContent = '';
    element.appendChild(textNode);
}

// Умная замена содержимого
function smartContentReplace(element, newContent) {
    // Сохраняем фокус если он был на дочернем элементе
    const activeElement = document.activeElement;
    const hadFocus = element.contains(activeElement);
    const focusSelector = hadFocus ? getFocusSelector(activeElement) : null;
    
    // Заменяем содержимое
    if (typeof newContent === 'string') {
        element.textContent = newContent;
    } else if (newContent instanceof Node) {
        element.textContent = '';
        element.appendChild(newContent);
    }
    
    // Восстанавливаем фокус
    if (hadFocus && focusSelector) {
        const newFocusElement = element.querySelector(focusSelector);
        newFocusElement?.focus();
    }
}

function getFocusSelector(element) {
    if (element.id) return `#${element.id}`;
    if (element.className) return `.${element.className.split(' ')[0]}`;
    return element.tagName.toLowerCase();
}

// Анимированная замена содержимого
async function animatedContentReplace(element, newContent) {
    // Fade out
    element.style.transition = 'opacity 0.3s ease';
    element.style.opacity = '0';
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Замена содержимого
    element.textContent = newContent;
    
    // Fade in
    element.style.opacity = '1';
    
    // Очистка стилей после анимации
    setTimeout(() => {
        element.style.removeProperty('transition');
        element.style.removeProperty('opacity');
    }, 300);
}
```

---

## Создание и удаление элементов

### Создание элементов

```javascript
// Основные методы создания
const div = document.createElement('div');
const textNode = document.createTextNode('Привет, мир!');
const comment = document.createComment('Это комментарий');

// Настройка созданного элемента
div.className = 'my-class';
div.id = 'unique-id';
div.setAttribute('data-value', '123');
div.appendChild(textNode);

// Современные методы создания с настройкой
function createElement(tag, attributes = {}, ...children) {
    const element = document.createElement(tag);
    
    // Применяем атрибуты
    Object.entries(attributes).forEach(([key, value]) => {
        if (key === 'className') {
            element.className = value;
        } else if (key === 'textContent') {
            element.textContent = value;
        } else if (key.startsWith('on') && typeof value === 'function') {
            element.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key.startsWith('data')) {
            const dataKey = key.slice(4).toLowerCase();
            element.dataset[dataKey] = value;
        } else {
            element.setAttribute(key, value);
        }
    });
    
    // Добавляем дочерние элементы
    children.forEach(child => {
        if (typeof child === 'string') {
            element.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
            element.appendChild(child);
        }
    });
    
    return element;
}

// Использование
const button = createElement('button', {
    className: 'btn btn-primary',
    type: 'submit',
    dataAction: 'save',
    onClick: () => console.log('Clicked!')
}, 'Сохранить');
```

### Вставка элементов

```javascript
const parent = document.querySelector('.container');
const newElement = createElement('p', {textContent: 'Новый параграф'});
const referenceElement = document.querySelector('.reference');

// Современные методы вставки
parent.appendChild(newElement);                    // в конец
parent.insertBefore(newElement, referenceElement); // перед элементом
parent.replaceChild(newElement, referenceElement); // замена

// Современные методы (более удобные)
referenceElement.before(newElement);               // перед элементом
referenceElement.after(newElement);                // после элемента
referenceElement.replaceWith(newElement);          // замена элемента

// Вставка нескольких элементов
parent.append(element1, element2, 'текст');        // в конец
parent.prepend(element1, element2, 'текст');       // в начало

// Продвинутая вставка с позиционированием
parent.insertAdjacentElement('beforebegin', newElement); // перед parent
parent.insertAdjacentElement('afterbegin', newElement);  // в начало parent
parent.insertAdjacentElement('beforeend', newElement);   // в конец parent
parent.insertAdjacentElement('afterend', newElement);    // после parent

// То же для HTML и текста
parent.insertAdjacentHTML('beforeend', '<p>HTML строка</p>');
parent.insertAdjacentText('afterbegin', 'Текст в начало');
```

### Клонирование элементов

```javascript
const original = document.querySelector('.original');

// Поверхностное клонирование (только элемент)
const shallowClone = original.cloneNode(false);

// Глубокое клонирование (со всеми потомками)
const deepClone = original.cloneNode(true);

// Умное клонирование с очисткой ID и событий
function smartClone(element, options = {}) {
    const {
        deep = true,
        clearIds = true,
        clearEvents = true,
        preserveData = false
    } = options;
    
    const clone = element.cloneNode(deep);
    
    if (clearIds) {
        // Удаляем ID у клона и его потомков
        clone.removeAttribute('id');
        if (deep) {
            clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
        }
    }
    
    if (!preserveData && deep) {
        // Очищаем data-атрибуты если нужно
        clone.querySelectorAll('[data-temp]').forEach(el => {
            el.removeAttribute('data-temp');
        });
    }
    
    return clone;
}

// Клонирование с модификацией
function cloneAndModify(element, modifications) {
    const clone = element.cloneNode(true);
    
    Object.entries(modifications).forEach(([selector, changes]) => {
        const targets = selector === ':root' ? [clone] : clone.querySelectorAll(selector);
        targets.forEach(target => {
            Object.entries(changes).forEach(([property, value]) => {
                if (property === 'textContent') {
                    target.textContent = value;
                } else if (property === 'className') {
                    target.className = value;
                } else {
                    target.setAttribute(property, value);
                }
            });
        });
    });
    
    return clone;
}
```

### Удаление элементов

```javascript
const element = document.querySelector('.to-remove');

// Современный способ (рекомендуется)
element.remove();

// Классический способ
element.parentNode.removeChild(element);

// Условное удаление
function removeIfExists(selector) {
    const element = document.querySelector(selector);
    element?.remove();
}
## Создание и удаление элементов (продолжение)

### Массовое удаление элементов

```javascript
// Удаление всех дочерних элементов
function clearChildren(element) {
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}

// Оптимизированное удаление (современный подход с использованием Range)
function clearChildrenOptimized(element) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.deleteContents();
}

// Удаление элементов по условию
function removeElementsByCondition(parent, conditionFn) {
    Array.from(parent.children).forEach(child => {
        if (conditionFn(child)) {
            child.remove();
        }
    });
}

// Пример использования
removeElementsByCondition(container, child => child.classList.contains('temporary'));
```

### Лучшие практики при создании и удалении

При разработке библиотек следуйте спецификациям WHATWG DOM Living Standard (2025 версия):
- Используйте `document.createElement` для создания элементов, избегая строкового парсинга HTML для предотвращения XSS-уязвимостей.
- Предпочитайте методы вроде `append`, `prepend`, `before` и `after` для вставки, так как они поддерживают несколько аргументов и более интуитивны.
- При клонировании всегда учитывайте глубокое копирование для сложных структур, но очищайте уникальные идентификаторы для избежания конфликтов.
- Для удаления элементов используйте `remove()`, который является частью DOM4 спецификации и поддерживается всеми современными браузерами (с 2013 года, полная совместимость к 2025).
- В библиотеках реализуйте кэширование созданных элементов для оптимизации производительности, особенно в сценариях с повторяющимися шаблонами.
- Обеспечьте обработку ошибок: проверяйте, является ли объект Node перед манипуляцией, чтобы избежать исключений.

---

## Современная система событий

### Основы событий

Document Object Model предоставляет мощную систему событий, позволяющую реагировать на действия пользователя и изменения в документе. Согласно WHATWG спецификации, события распространяются в три фазы: захват (capturing), цель (target) и всплытие (bubbling).

```javascript
// Добавление слушателя событий
element.addEventListener('click', function(event) {
    console.log('Элемент кликнут', event.target);
}, { capture: false, once: false, passive: true });

// Опции слушателя (рекомендуемые для производительности)
{
    capture: true,     // Захват фазы
    once: true,        // Автоматическое удаление после первого срабатывания
    passive: true,     // Улучшает прокрутку (не предотвращает default)
    signal: abortController.signal  // Для отмены слушателя
}

// Удаление слушателя
element.removeEventListener('click', handlerFunction);
```

### Делегирование событий

Для эффективности в библиотеках используйте делегирование: прикрепляйте слушатель к родительскому элементу и фильтруйте цель.

```javascript
// Эффективное делегирование
parentElement.addEventListener('click', function(event) {
    const target = event.target.closest('.button');
    if (target) {
        console.log('Кнопка кликнута', target);
    }
});

// Утилита для делегирования в библиотеках
function delegateEvent(parent, eventName, selector, handler) {
    parent.addEventListener(eventName, function(event) {
        const target = event.target.closest(selector);
        if (target && parent.contains(target)) {
            handler.call(target, event);
        }
    });
}

// Использование
delegateEvent(document.body, 'click', '[data-action]', function(event) {
    const action = this.dataset.action;
    // Обработка действия
});
```

### Кастомные события

```javascript
// Создание и диспатч кастомного события
const customEvent = new CustomEvent('userLoggedIn', {
    bubbles: true,
    cancelable: true,
    detail: { userId: 123, role: 'admin' }
});

element.dispatchEvent(customEvent);

// Слушатель кастомного события
element.addEventListener('userLoggedIn', function(event) {
    console.log('Пользователь вошел', event.detail.userId);
});
```

### Современные события (2025)

- **ResizeObserver API**: Для наблюдения за изменениями размеров элементов, заменяя устаревшие window.resize.
  
```javascript
const observer = new ResizeObserver(entries => {
    entries.forEach(entry => {
        console.log('Размер изменился', entry.contentRect.width);
    });
});
observer.observe(element);
```

- **MutationObserver**: Для мониторинга изменений в DOM.
  
```javascript
const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
            console.log('Добавлены/удалены дети');
        }
    });
});
observer.observe(element, { childList: true, subtree: true });
```

- **Лучшие практики**: В библиотеках используйте AbortController для управления жизненным циклом слушателей. Избегайте inline-обработчиков (onClick) в пользу addEventListener для модульности. Обеспечьте поддержку touch-событий для мобильных устройств и учитывайте accessibility (например, keyboard navigation).

---

## Performance и оптимизация

### Ключевые метрики производительности

В 2025 году фокус на Core Web Vitals: Largest Contentful Paint (LCP), First Input Delay (FID) и Cumulative Layout Shift (CLS). DOM-операции влияют на все эти метрики.

### Оптимизация операций с DOM

- **Минимизация reflow и repaint**: Группируйте изменения стилей и используйте requestAnimationFrame.
  
```javascript
function batchUpdates(element, updates) {
    requestAnimationFrame(() => {
        Object.assign(element.style, updates);
    });
}
```

- **DocumentFragment для батчинга**: Создавайте фрагменты для массовых вставок.
  
```javascript
const fragment = document.createDocumentFragment();
for (let i = 0; i < 1000; i++) {
    const item = document.createElement('li');
    item.textContent = `Элемент ${i}`;
    fragment.appendChild(item);
}
list.appendChild(fragment);
```

- **Virtual DOM в библиотеках**: Хотя DOM не имеет встроенного Virtual DOM, в ваших библиотеках реализуйте диффинг (как в React) для минимизации реальных операций.

### Инструменты мониторинга

- Используйте PerformanceObserver для отслеживания long tasks.
- Профилируйте с помощью Chrome DevTools (Lighthouse 2025) для выявления DOM-бутылочных горлышек.

### Лучшие практики

- Кэшируйте селекторы и элементы.
- Избегайте глубоких вложенностей в DOM-дереве (максимум 10-15 уровней).
- Используйте will-change для анимируемых свойств.
- В библиотеках предоставляйте опции для lazy-loading элементов.

---

## Web Components и Shadow DOM

### Основы Web Components

Web Components — набор технологий (Custom Elements, Shadow DOM, HTML Templates) для создания переиспользуемых компонентов.

```javascript
// Custom Element
class MyButton extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = '<button><slot></slot></button>';
    }
}
customElements.define('my-button', MyButton);
```

### Shadow DOM

Shadow DOM изолирует стили и DOM компонента.

```javascript
// Доступ к Shadow DOM
const shadow = element.shadowRoot;
shadow.querySelector('button').addEventListener('click', handler);
```

### Лучшие практики 2025

- Используйте :host и ::slotted для стилизации.
- Поддерживайте accessibility с помощью ARIA.
- В библиотеках обеспечивайте полифиллы для старых браузеров, хотя к 2025 поддержка полная.
- Интегрируйте с фреймворками вроде Lit или Stencil для упрощения.

---

## Accessibility и семантика

### Семантический HTML

Используйте семантические теги (<article>, <nav>, <header>) для лучшей доступности.

### ARIA атрибуты

```javascript
element.setAttribute('aria-label', 'Описание');
element.setAttribute('role', 'button');
```

### Лучшие практики

- Тестируйте с экранными ридерами (NVDA, VoiceOver).
- Обеспечьте фокус-менеджмент с помощью tabindex.
- В библиотеках включайте A11y аудиторы (axe-core).
- Следуйте WCAG 2.2 (2025 стандарт) для контраста, навигации и динамического контента.

---

## Безопасность DOM

### Предотвращение XSS

- Используйте textContent вместо innerHTML.
- Санитизируйте ввод с DOMPurify.
- Избегайте eval() и Function().

### Content Security Policy (CSP)

Настройте CSP для блокировки inline-скриптов.

### Лучшие практики

- В библиотеках валидируйте все пользовательские данные.
- Используйте Subresource Integrity (SRI) для внешних ресурсов.
- Мониторьте DOM на изменения с MutationObserver для обнаружения инъекций.

---

## Лучшие практики 2025

- **Модульность**: Разбивайте код на модули с ESM.
- **Тестирование**: Используйте Jest с jsdom для unit-тестов DOM.
- **Производительность**: Интегрируйте с Web Vitals API.
- **Совместимость**: Поддерживайте Evergreen браузеры; используйте @supports для feature detection.
- **Документация**: Автоматизируйте с JSDoc.
- **Интеграция с AI**: В 2025 интегрируйте AI для автогенерации DOM-структур (например, через WebGPU).
- Следуйте WHATWG Living Standard, мониторя обновления через MDN и CanIUse.