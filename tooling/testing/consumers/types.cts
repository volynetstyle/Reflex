import runtime = require("@volynets/reflex-runtime");
import facade = require("@volynets/reflex");
import async = require("@volynets/reflex-async");
const context=runtime.createRuntimeContext();
const host=facade.createRuntime();const value=facade.signal(1);
runtime.runWithRuntimeContext(context,()=>value());
const source=async.asyncDerived(()=>value());source.dispose();host.flush();
