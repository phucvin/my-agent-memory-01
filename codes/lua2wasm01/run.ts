import * as fs from 'fs';
import { execSync } from 'child_process';
import * as path from 'path';

async function run() {
    const inputPath = process.argv[2];
    if (!inputPath) {
        console.error('Usage: ts-node run.ts <input.wat>');
        process.exit(1);
    }

    const wasmPath = inputPath.replace(/\.wat$/, '.wasm');

    // Compile using wasm-as
    const wasmAsPath = path.join(__dirname, 'node_modules', '.bin', 'wasm-as');
    try {
        execSync(`${wasmAsPath} ${inputPath} -o ${wasmPath} --enable-gc --enable-reference-types`, { stdio: 'inherit' });
    } catch (e) {
        console.error("Compilation to wasm failed");
        process.exit(1);
    }

    const buffer = fs.readFileSync(wasmPath);

    let memory: WebAssembly.Memory;

    // Instantiate and run
    const wasmInstance = await WebAssembly.instantiate(new Uint8Array(buffer), {
        env: {
            print: (val: number) => console.log(val),
            print_str: (offset: number, len: number) => {
                if (memory) {
                    const bytes = new Uint8Array(memory.buffer, offset, len);
                    const text = new TextDecoder().decode(bytes);
                    console.log(text);
                } else {
                    console.log(`String(offset: ${offset}, len: ${len})`);
                }
            }
        }
    });

    const exports = wasmInstance.instance.exports as any;
    memory = exports.mem || exports.memory;

    if (exports.main) {
        exports.main();
    } else if (exports.fib) {
        const n = 10;
        console.log(`Result of fib(${n}):`);
        // Our updated compiler returns a $Val ref. We need a way to print it from JS if needed,
        // but it's simpler to just let the script run if it prints itself.
        // If there's no main, we can call it. But returning an opaque ref might be tricky to log.

        // create a num to pass to fib
        // The WASM function expects a $Val. Since JS can't easily construct a GC struct from here
        // without an exported constructor, we can just compile a wrapper function in WAT, or
        // we can export $make_num!
        // Actually, our run.ts will fail because it just passes JS undefined.
        console.log("Cannot call fib directly from JS without a Wasm wrapper, as it takes a GC struct reference.");

    } else {
        // Find first exported function and run it if it has no args
        const funcNames = Object.keys(exports).filter(k => typeof exports[k] === 'function');
        if (funcNames.length > 0) {
            try {
                exports[funcNames[0]]();
            } catch (e) {
                console.log(`Failed to run default export ${funcNames[0]}: ${e}`);
            }
        } else {
            console.log("No recognizable exported function found.");
        }
    }
}

run().catch(console.error);
