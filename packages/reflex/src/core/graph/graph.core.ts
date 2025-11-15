import { Bitwise } from "../object/utils/bitwise.js";
import { ASYNC, COUNTER_CELLS, ASYNC_CELLS, CLEAN } from "./graph.constants.js";
import { IReactiveNode } from "./graph.types.js";

const isObserverNode = (node: IReactiveNode): boolean => {
	return typeof node._observer === "function";
};

const isAsyncNode = (node: IReactiveNode): boolean => {
	return Bitwise.has(node._flags, ASYNC);
};

function createReactiveNode(): IReactiveNode {
	return {
		_valueRaw: null,
		_sources: null,
		_observers: null,
		_observer: null,
		_counters: new Uint32Array(COUNTER_CELLS), // [epoch, version, uversion]
		_async: new Uint32Array(ASYNC_CELLS),    // [generation, token]
		_flags: CLEAN,
		_kind: "source",
	};
}



export {
	isObserverNode,
	isAsyncNode,
	createReactiveNode,
}

