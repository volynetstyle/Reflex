Теоретична база упирається в три столпи. Kam & Ullman (1977) показали, що максимальний fixed point існує для кожної інстанції кожного монотонного фреймворку, і він досягається алгоритмом Кідалла. Springer Це саме те, що гарантує збігання вашої системи. Розв'язки системи рівнянь утворюють решітку, і розв'язок, обчислений итеративним алгоритмом, є найбільшим розв'язком за порядком решітки. UW Computer Sciences

Алгоритмічно ваша система комбінує два класичні підходи. Топовий сортування для поширення змін гарантує, що вузол буде встановлений лише один раз, і жоден інваріант не буде порушений — це розв'язок проблеми "glitch" в реактивному програмуванні. GitHub Проблема діаманда: не можна випадково обчислити A, B, D, C а потім знову D через те, що C оновлився — двойное обчислення D є і неефективним і може спричинити видимий glitch для кінцевого пользователя. DEV Community

Найближчий академічний аналог — Adapton. Adapton використовує demand-driven change propagation (D2CP): алгоритм не робить жодної роботи доки він не змушений; він навіть уникає повторного обчислення результатів, які раніше були затребувані, доки вони знову не запитуються. Tufts University Це саме ваша lazy pull семантика.
Найближчий production-аналог — Salsa (rust-analyzer). Salsa реалізує early cutoff оптимізацію: навіть якщо один вхідний параметр запиту змінився, результат може бути тим самим — наприклад, додавання пробілу до исходного коду не змінює AST, тому type-checker скипається. rust-analyzer Це саме ваша <code>v</code> координата.

Vs реактивних библіотек: MobX гарантує, що всі деривації оновлюються автоматично і атомарно при зміні стану — неможливо спостерегти проміжні значення. Js Але MobX не формалізує цю гарантію через lattice — він досягає її через внутрішню топовий сортування.
Головна ключова різниця вашої системи: вона — <em>единина</em> з цього ландшафту, що формально розділяє каузальний час і семантичну версію як два <em>інваріантних координати</em>.

Kam, J.B. & Ullman, J.D. — Monotone Data Flow Analysis Frameworks, Acta Informatica 7, 1977
Kildall, G.A. — A Unified Approach to Global Program Optimization, POPL 1973
Acar, U.A. — Self-Adjusting Computation, Ph.D. dissertation, CMU, 2005
Acar, Blelloch, Harper — Adaptive Functional Programming, POPL 2001
Hammer, Phang, Hicks, Foster — Adapton: Composable, Demand-Driven Incremental Computation, PLDI 2014
Matsakis et al. — Salsa: Incremental Recomputation Engine, rust-analyzer, 2018+
Matsakis — Durable Incrementality, rust-analyzer blog, 2023
Jane Street — Introducing Incremental, blog, 2014
Anderson, Blelloch, Acar — Efficient Parallel Self-Adjusting Computation, arXiv 2105.06712, 2021
Weststrate — How MobX tackles the diamond problem, Medium, 2018


