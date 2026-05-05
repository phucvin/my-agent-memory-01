import binaryen from 'binaryen';
const wasm = new binaryen.Module();
wasm.setFeatures(binaryen.Features.GC | binaryen.Features.ReferenceTypes);

const structInfo = binaryen.createType([
  { type: binaryen.i32, packedType: binaryen.none, mutable: true }
]);

console.log(structInfo);
