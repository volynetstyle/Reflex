import { ReflexObject } from "../object/inherit";
import { OwnershipPrototype, createOwner } from "./ownership.core";
import { IOwnership, OwnershipStateFlags } from "./ownership.type";
import { OwnershipScope } from "./ownership.scope";

describe("Ownership System - Core Functionality", () => {
  let scope: OwnershipScope;

  beforeEach(() => {
    scope = new OwnershipScope();
  });

  describe("Scope Management", () => {
    test("create() creates new owner and restores previous owner", () => {
      let capturedOwner: IOwnership | undefined;
      
      const result = scope.create(() => {
        capturedOwner = scope.owner;
        return 42;
      });

      expect(result).toBe(42);
      expect(capturedOwner).toBeDefined();
      expect(capturedOwner!._state).toBe(OwnershipStateFlags.CLEAN);
      expect(scope.owner).toBeUndefined();
    });

    
    test("nested scope creation stress test", () => {
      const NESTING_LEVELS = 100;
      let deepestOwner: IOwnership | undefined;

      scope.create(() => {
        let currentLevel = 0;
        let currentParent = scope.owner;
        
        const nest = () => {
          if (currentLevel++ < NESTING_LEVELS) {
            scope.create(() => {
              currentParent = scope.owner;
              nest();
            }, currentParent);
          } else {
            deepestOwner = scope.owner;
          }
        };
        
        nest();
      });

      expect(deepestOwner).toBeDefined();
      
      let depth = 0;
      let current = deepestOwner;
      while (current) {
        depth++;
        current = current._parent;
      }
      
      expect(depth).toBe(NESTING_LEVELS + 1);
    });

    test("run() temporarily sets owner and restores", () => {
      const owner = createOwner();
      let capturedOwner: IOwnership | undefined;

      scope.run(owner, () => {
        capturedOwner = scope.owner;
      });

      expect(capturedOwner).toBe(owner);
      expect(scope.owner).toBeUndefined();
    });

    test("nested scopes maintain correct owner chain", () => {
      const owners: IOwnership[] = [];

      scope.create(() => {
        owners.push(scope.owner!);
        
        scope.create(() => {
          owners.push(scope.owner!);
          
          scope.create(() => {
            owners.push(scope.owner!);
          }, owners[1]);
        }, owners[0]);
      });

      expect(owners).toHaveLength(3);
      expect(owners[0]._firstChild).toBe(owners[1]);
      expect(owners[1]._parent).toBe(owners[0]);
      expect(owners[1]._firstChild).toBe(owners[2]);
      expect(owners[2]._parent).toBe(owners[1]);
    });
  });

  describe("Tree Structure", () => {
    test("appendChild links children correctly", () => {
      const parent = createOwner();
      const child1 = createOwner();
      const child2 = createOwner();
      const child3 = createOwner();

      parent.appendChild(child1);
      parent.appendChild(child2);
      parent.appendChild(child3);

      expect(parent._firstChild).toBe(child1);
      expect(parent._lastChild).toBe(child3);
      expect(parent._childCount).toBe(3);

      expect(child1._parent).toBe(parent);
      expect(child1._prevSibling).toBeUndefined();
      expect(child1._nextSibling).toBe(child2);

      expect(child2._parent).toBe(parent);
      expect(child2._prevSibling).toBe(child1);
      expect(child2._nextSibling).toBe(child3);

      expect(child3._parent).toBe(parent);
      expect(child3._prevSibling).toBe(child2);
      expect(child3._nextSibling).toBeUndefined();
    });

    test("removeChild unlinks child correctly", () => {
      const parent = createOwner();
      const children = [createOwner(), createOwner(), createOwner()];
      
      children.forEach(c => parent.appendChild(c));
      
      // Remove middle child
      parent.removeChild(children[1]);

      expect(parent._childCount).toBe(2);
      expect(children[0]._nextSibling).toBe(children[2]);
      expect(children[2]._prevSibling).toBe(children[0]);
      expect(children[1]._parent).toBeUndefined();
      expect(children[1]._prevSibling).toBeUndefined();
      expect(children[1]._nextSibling).toBeUndefined();
    });

    test("removeChild handles first and last child", () => {
      const parent = createOwner();
      const children = [createOwner(), createOwner(), createOwner()];
      
      children.forEach(c => parent.appendChild(c));

      // Remove first
      parent.removeChild(children[0]);
      expect(parent._firstChild).toBe(children[1]);
      expect(parent._childCount).toBe(2);

      // Remove last
      parent.removeChild(children[2]);
      expect(parent._lastChild).toBe(children[1]);
      expect(parent._childCount).toBe(1);
    });

    test("appendChild detaches from previous parent", () => {
      const parent1 = createOwner();
      const parent2 = createOwner();
      const child = createOwner();

      parent1.appendChild(child);
      expect(parent1._childCount).toBe(1);
      expect(child._parent).toBe(parent1);

      parent2.appendChild(child);
      expect(parent1._childCount).toBe(0);
      expect(parent2._childCount).toBe(1);
      expect(child._parent).toBe(parent2);
    });

    test("appendChild is idempotent for same parent", () => {
      const parent = createOwner();
      const child = createOwner();

      parent.appendChild(child);
      const initialCount = parent._childCount;
      
      parent.appendChild(child);
      
      expect(parent._childCount).toBe(initialCount);
      expect(parent._firstChild).toBe(child);
      expect(parent._lastChild).toBe(child);
    });

    test("createOwner with parent auto-appends", () => {
      const parent = createOwner();
      const child = createOwner(parent);

      expect(parent._firstChild).toBe(child);
      expect(parent._childCount).toBe(1);
      expect(child._parent).toBe(parent);
    });
  });

  describe("Context Inheritance", () => {
    test("child inherits parent context via prototype chain", () => {
      const parent = createOwner();
      parent._context = { foo: "bar", nested: { value: 42 } };

      const child = createOwner(parent);

      expect(child._context).not.toBe(parent._context);
      expect(child._context!.foo).toBe("bar");
      expect((child._context as { nested: { value: number } }).nested.value).toBe(42);
    });

    test("child context modifications don't affect parent", () => {
      const parent = createOwner();
      parent._context = { foo: "bar" };

      const child = createOwner(parent);
      child._context!.foo = "baz";
      child._context!.newProp = "new";

      expect(parent._context!.foo).toBe("bar");
      expect(parent._context!.newProp).toBeUndefined();
    });

    test("context is not created if parent has no context", () => {
      const parent = createOwner();
      const child = createOwner(parent);

      expect(child._context).toBeUndefined();
    });
  });

  describe("Cleanup & Disposal", () => {
    test("onScopeCleanup registers and executes callbacks", () => {
      const owner = createOwner();
      const callbacks = [jest.fn(), jest.fn(), jest.fn()];

      callbacks.forEach(cb => owner.onScopeCleanup(cb));
      owner.dispose();

      callbacks.forEach(cb => expect(cb).toHaveBeenCalledTimes(1));
      expect(owner._disposal).toEqual([]);
      expect(owner._state).toBe(OwnershipStateFlags.DISPOSED);
    });

    test("disposal executes callbacks in registration order", () => {
      const owner = createOwner();
      const order: number[] = [];

      owner.onScopeCleanup(() => order.push(1));
      owner.onScopeCleanup(() => order.push(2));
      owner.onScopeCleanup(() => order.push(3));

      owner.dispose();

      expect(order).toEqual([1, 2, 3]);
    });

    test("deep tree disposal disposes all descendants", () => {
      const root = createOwner();
      const level1 = [createOwner(root), createOwner(root)];
      const level2 = [createOwner(level1[0]), createOwner(level1[0]), createOwner(level1[1])];
      
      const allNodes = [root, ...level1, ...level2];
      const callbacks = allNodes.map(() => jest.fn());
      
      allNodes.forEach((node, i) => node.onScopeCleanup(callbacks[i]));

      root.dispose();

      callbacks.forEach(cb => expect(cb).toHaveBeenCalledTimes(1));
      allNodes.forEach(node => {
        expect(node._state).toBe(OwnershipStateFlags.DISPOSED);
        expect(node._firstChild).toBeUndefined();
        expect(node._lastChild).toBeUndefined();
        expect(node._childCount).toBe(0);
      });
    });

    test("dispose is idempotent", () => {
      const owner = createOwner();
      const callback = jest.fn();

      owner.onScopeCleanup(callback);
      
      owner.dispose();
      owner.dispose();
      owner.dispose();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(owner._state).toBe(OwnershipStateFlags.DISPOSED);
    });

    // test("errors in cleanup don't prevent other cleanups", () => {
    //   const owner = createOwner();
    //   const callbacks = [
    //     jest.fn(),
    //     jest.fn(() => { throw new Error("Error 1"); }),
    //     jest.fn(),
    //     jest.fn(() => { throw new Error("Error 2"); }),
    //     jest.fn()
    //   ];

    //   callbacks.forEach(cb => owner.onScopeCleanup(cb));

    //   const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      
    //   owner.dispose();
      
    //   consoleSpy.mockRestore();

    //   callbacks.forEach(cb => expect(cb).toHaveBeenCalledTimes(1));
    //   expect(owner._state).toBe(OwnershipStateFlags.DISPOSED);
    //   expect(consoleSpy).toHaveBeenCalledTimes(1);
    // });

    test("cleanup with circular references doesn't cause issues", () => {
      const owner = createOwner();
      const obj: any = { value: 42 };
      obj.self = obj;

      owner.onScopeCleanup(() => {
        obj.value = 0;
      });

      expect(() => owner.dispose()).not.toThrow();
      expect(obj.value).toBe(0);
    });
  });

  describe("Safety & Edge Cases", () => {
    test("cannot append disposed child", () => {
      const parent = createOwner();
      const child = createOwner();
      
      child.dispose();

      expect(() => parent.appendChild(child)).toThrow("Cannot append a disposed child");
    });

    test("cannot append child to disposing owner", () => {
      const parent = createOwner();
      const child = createOwner();
      let errorThrown = false;

      parent.onScopeCleanup(() => {
        try {
          parent.appendChild(child);
        } catch (e: any) {
          errorThrown = e.message === "Cannot append child to an owner that is disposing";
        }
      });

      parent.dispose();
      expect(errorThrown).toBe(true);
    });

    test("removeChild with non-child does nothing", () => {
      const parent = createOwner();
      const notChild = createOwner();

      expect(() => parent.removeChild(notChild)).not.toThrow();
      expect(parent._childCount).toBe(0);
    });

    test("disposal clears all references", () => {
      const parent = createOwner();
      const child = createOwner(parent);
      
      parent._context = { data: "test" };
      child.onScopeCleanup(() => {});

      parent.dispose();

      expect(parent._firstChild).toBeUndefined();
      expect(parent._lastChild).toBeUndefined();
      expect(parent._context).toBeUndefined();
      expect(parent._disposal.length).toBe(0);
      expect(child._parent).toBeUndefined();
      expect(child._nextSibling).toBeUndefined();
      expect(child._prevSibling).toBeUndefined();
    });
  });
});

describe("Ownership System - Performance & Stress Tests", () => {
  describe("Memory Efficiency", () => {
    test("disposal should release memory references", () => {
      const root = createOwner();

      // Create and dispose tree
      for (let i = 0; i < 100; i++) {
        createOwner(root);
      }

      expect(root._childCount).toBe(100);

      root.dispose();

      expect(root._firstChild).toBeUndefined();
      expect(root._childCount).toBe(0);
    });

    test("pre-allocated disposal array reduces allocations", () => {
      const owner = createOwner();
      
      expect(Array.isArray(owner._disposal)).toBe(true);
      
      for (let i = 0; i < 10; i++) {
        owner.onScopeCleanup(() => {});
      }
      
      expect(owner._disposal.length).toBe(10);
    });
  });

  describe("Deep Tree Performance", () => {
    const BALANCED_DEPTH = 8;
    const BALANCED_CHILDREN = 3;

    function buildBalancedTree(depth: number, parent?: IOwnership): IOwnership {
      const node = createOwner(parent);
      
      if (depth > 0) {
        for (let i = 0; i < BALANCED_CHILDREN; i++) {
          buildBalancedTree(depth - 1, node);
        }
      }
      
      return node;
    }

    function countNodes(node: IOwnership): number {
      let count = 1;
      let child = node._firstChild;
      
      while (child) {
        count += countNodes(child);
        child = child._nextSibling;
      }
      
      return count;
    }

    test("balanced tree creation and disposal", () => {
      const start = performance.now();
      const root = buildBalancedTree(BALANCED_DEPTH);
      const buildTime = performance.now() - start;

      const nodeCount = countNodes(root);
      const expectedNodes = (Math.pow(BALANCED_CHILDREN, BALANCED_DEPTH + 1) - 1) / (BALANCED_CHILDREN - 1);
      
      expect(nodeCount).toBe(expectedNodes);

      const disposeStart = performance.now();
      root.dispose();
      const disposeTime = performance.now() - disposeStart;

      console.log(`Built ${nodeCount} nodes in ${buildTime.toFixed(2)}ms`);
      console.log(`Disposed ${nodeCount} nodes in ${disposeTime.toFixed(2)}ms`);
      console.log(`Throughput: ${(nodeCount / disposeTime * 1000).toFixed(0)} nodes/sec`);

      expect(root._state).toBe(OwnershipStateFlags.DISPOSED);
      expect(disposeTime).toBeLessThan(100);
    });

    test("wide tree with many siblings", () => {
      const root = createOwner();
      const SIBLING_COUNT = 1000;

      const start = performance.now();
      for (let i = 0; i < SIBLING_COUNT; i++) {
        createOwner(root);
      }
      const buildTime = performance.now() - start;

      expect(root._childCount).toBe(SIBLING_COUNT);

      const disposeStart = performance.now();
      root.dispose();
      const disposeTime = performance.now() - disposeStart;

      console.log(`Created ${SIBLING_COUNT} siblings in ${buildTime.toFixed(2)}ms`);
      console.log(`Disposed ${SIBLING_COUNT} siblings in ${disposeTime.toFixed(2)}ms`);

      expect(root._state).toBe(OwnershipStateFlags.DISPOSED);
      expect(disposeTime).toBeLessThan(50);
    });

    test("deep linear chain doesn't overflow stack", () => {
      const CHAIN_LENGTH = 10000;
      let current = createOwner();
      const root = current;

      for (let i = 0; i < CHAIN_LENGTH; i++) {
        current = createOwner(current);
      }

      expect(() => root.dispose()).not.toThrow();
      expect(root._state).toBe(OwnershipStateFlags.DISPOSED);
    });
  });

  describe("Cleanup Callback Performance", () => {
    test("many cleanup callbacks execute efficiently", () => {
      const owner = createOwner();
      const CALLBACK_COUNT = 10000;
      let counter = 0;

      for (let i = 0; i < CALLBACK_COUNT; i++) {
        owner.onScopeCleanup(() => counter++);
      }

      const start = performance.now();
      owner.dispose();
      const elapsed = performance.now() - start;

      expect(counter).toBe(CALLBACK_COUNT);
      console.log(`Executed ${CALLBACK_COUNT} callbacks in ${elapsed.toFixed(2)}ms`);
      console.log(`Throughput: ${(CALLBACK_COUNT / elapsed * 1000).toFixed(0)} callbacks/sec`);
      
      expect(elapsed).toBeLessThan(50);
    });

    test("cleanup with complex state changes", () => {
      const owner = createOwner();
      const state = { values: new Array(1000).fill(0) };

      for (let i = 0; i < state.values.length; i++) {
        owner.onScopeCleanup(() => {
          state.values[i] = 1;
        });
      }

      owner.dispose();

      expect(state.values.every(v => v === 1)).toBe(true);
    });
  });

  describe("Concurrent Operations", () => {
    test("interleaved appendChild and removeChild", () => {
      const parent = createOwner();
      const children: IOwnership[] = [];

      for (let i = 0; i < 100; i++) {
        const child = createOwner();
        parent.appendChild(child);
        children.push(child);

        if (i % 3 === 0 && children.length > 1) {
          const toRemove = children.splice(Math.floor(Math.random() * children.length), 1)[0];
          parent.removeChild(toRemove);
        }
      }

      expect(parent._childCount).toBe(children.length);
      
      let count = 0;
      let current = parent._firstChild;
      while (current) {
        count++;
        current = current._nextSibling;
      }
      expect(count).toBe(parent._childCount);
    });
  });

  describe("Real-World Scenarios", () => {
    test("component tree simulation", () => {
      const app = createOwner();
      
      const header = createOwner(app);
      createOwner(header);
      createOwner(header);
      
      const main = createOwner(app);
      for (let i = 0; i < 20; i++) {
        const item = createOwner(main);
        item.onScopeCleanup(() => {});
      }
      
      const footer = createOwner(app);
      
      expect(app._childCount).toBe(3);
      expect(main._childCount).toBe(20);

      app.dispose();
      
      expect(app._state).toBe(OwnershipStateFlags.DISPOSED);
    });

    test("subscription cleanup pattern", () => {
      const owner = createOwner();
      const subscriptions: Set<() => void> = new Set();
      
      for (let i = 0; i < 100; i++) {
        const unsubscribe = jest.fn();
        subscriptions.add(unsubscribe);
        owner.onScopeCleanup(unsubscribe);
      }

      owner.dispose();

      subscriptions.forEach(unsub => {
        expect(unsub).toHaveBeenCalledTimes(1);
      });
    });

    test("context-based dependency injection", () => {
      const root = createOwner();
      root._context = { 
        services: { 
          api: "https://api.example.com",
          auth: { token: "secret" }
        }
      };

      const child1 = createOwner(root);
      const child2 = createOwner(root);

      type ContextType = { services: { api: string; auth?: { token: string } } };

      expect((child1._context as ContextType).services.api).toBe("https://api.example.com");
      expect((child2._context as ContextType).services.api).toBe("https://api.example.com");

      (child1._context as ContextType).services = { ...(child1._context as ContextType).services, api: "override" };
      
      expect((child1._context as ContextType).services.api).toBe("override");
      expect((root._context as ContextType).services.api).toBe("https://api.example.com");
      expect((child2._context as ContextType).services.api).toBe("https://api.example.com");
    });
  });
});