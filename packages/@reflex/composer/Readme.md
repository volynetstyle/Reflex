# Component Framework

Все або нічого

- Декларативну композицію незалежних модулів
- Відкладене зв’язування (late binding)
- Умовне збирання aggregate тільки коли всі залежності готові
- Транзакційний bind/unbind (із rollback)
- Відсутність ownership — лише координація

Ядро ідеї
| Linux                    | Web abstraction       |
| ------------------------ | --------------------- |
| `component_add()`        | `registerComponent()` |
| `component_ops.bind()`   | `onBind(ctx)`         |
| `component_ops.unbind()` | `onUnbind(ctx)`       |
| `component_match`        | predicate / selector  |
| `component_master`       | aggregate controller  |
| `bind_all()`             | atomic composition    |

