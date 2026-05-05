import * as fs from 'fs';
import wabt from 'wabt';

async function run() {
    const inputPath = process.argv[2];
    if (!inputPath) {
        console.error('Usage: ts-node run.ts <input.wat>');
        process.exit(1);
    }

    const watCode = fs.readFileSync(inputPath, 'utf8');

    const wabtModule = await wabt();

    // Parse WAT to WASM module
    const wasmModule = wabtModule.parseWat(inputPath, watCode);

    // Convert to binary
    const { buffer } = wasmModule.toBinary({ log: true, write_debug_names: true });

    // Save to .wasm for inspection
    const wasmPath = inputPath.replace(/\.wat$/, '.wasm');
    fs.writeFileSync(wasmPath, new Uint8Array(buffer));
    console.log(`Saved ${wasmPath}`);

    // Instantiate and run
    const wasmInstance = await WebAssembly.instantiate(new Uint8Array(buffer), {
        env: {
            print: (val: number) => console.log(val)
        }
    });

    const exports = wasmInstance.instance.exports as any;

    // Assume function `main` or `fib`
    if (exports.main) {
        console.log("Result of main():", exports.main());
    } else if (exports.fib) {
        // Run fib with some argument, say 10
        const n = 10;
        console.log(`Result of fib(${n}):`, exports.fib(n));
    } else {
        console.log("No recognizable exported function found.");
        console.log("Exports available:", Object.keys(exports));
    }
}

run().catch(console.error);
