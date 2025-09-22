type ComponentDeclaration<Props> = {
  propsSchema: Props;
  renderers?: {
    dom?: (props: Props, children: HTMLElement[]) => HTMLElement;
  };
};

type RegistryLoader = () => Promise<ComponentDeclaration<unknown>>;
type LazyRegistry = Map<string, RegistryLoader>;
type ComponentRegistry = Map<string, ComponentDeclaration<unknown>>;

export type {
  ComponentDeclaration,
  RegistryLoader,
  LazyRegistry,
  ComponentRegistry,
};



/*const state = {user{profile{name"Alice"age'25'}}}*/
/*const state = {user:{profile:{name:"Alice",age:25}}}*/

/*
const state = {
user: {
profile: {
name: "Alice",
age: 25,
},
settings: {
theme: "dark",
},
},
logs: [
{
level: "info",
msg: "started",
},
{
level: "error",
msg: "crash",
},
],
};
*/

/*
 const state = {
  user: {
    profile: {
      name: "Alice",
      age: 25,
    },
    settings: {
      theme: "dark",
    },
  },
  logs: [
    {
      level: "info",
      msg: "started",
    },
    {
      level: "error",
      msg: "crash",
    },
  ],
};
*/

// type Path = string | Array<string | number>;
// type Params = Record<string, any>;
// type ObserverCallback<T = any> = (value: T, params?: Params) => void;

// const createReactor = (state: Record<string, any>) => {
//   state = state; // Инициализация состояния

//   // Реализация реактора
//   return {
//     observe: (path: Path, callback: ObserverCallback) => {
//       return () => {
//         // Логика отписки от изменений
//       };
//     },
//     unobserve: (path: Path, callback: ObserverCallback) => {
//       // Логика отписки от изменений
//     },
//     update: (path: Path, value: any) => {
//       // Логика обновления значения
//     },
//     get: (path: Path) => {
//       // Логика получения значения
//     },
//     match: (path: Path) => {
//       // Логика проверки соответствия паттерну
//     },
//   };
// };

// const reactor = createReactor(state);

// reactor.observe("user.profile.name", (value) => {
//   console.log("Name changed:", value);
// });

// reactor.observe("logs.[]:i.level", (level, { i }) => {
//   console.log("Log #", i, "level:", level);
// });


//  const state = {
//   user: {
//     profile: {
//       name: "Alice",
//       age: 25,
//     },
//     settings: {
//       theme: "dark",
//     },
//   },
//   logs: [
//     {
//       level: "info",
//       msg: "started",
//     },
//     {
//       level: "error",
//       msg: "crash",
//     },
//   ],
// };


// state.user.profile.age;