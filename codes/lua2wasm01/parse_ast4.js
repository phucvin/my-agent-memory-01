const binaryen = require('binaryen');
const wasm = new binaryen.Module();
wasm.setFeatures(binaryen.Features.GC);
console.log("Binaryen GC features enabled.");
