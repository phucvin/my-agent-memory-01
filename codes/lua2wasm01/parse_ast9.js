const fs = require('fs');
async function run() {
    const wasmCode = fs.readFileSync('test_struct.wasm');
    try {
        const wasmInstance = await WebAssembly.instantiate(wasmCode);
        console.log("GC execution works!", wasmInstance.instance.exports.main());
    } catch(e) {
        console.log("Execution failed:", e);
    }
}
run();
