import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const testsDir = __dirname;
const goldenDir = path.join(testsDir, 'golden');

const tests = [
    { name: 'test_dyn.lua', expected: '1\nb\n' },
    { name: 'test_fib.lua', expected: '55\n' },
];

let failed = false;

for (const test of tests) {
    const inputPath = path.join(testsDir, '..', test.name);
    console.log(`Running ${test.name}...`);
    try {
        // Compile to WAT
        execSync(`npx ts-node ../index.ts ${inputPath}`, { cwd: testsDir, stdio: 'ignore' });

        // Check Golden
        const watPath = inputPath.replace(/\.lua$/, '.wat');
        const generatedWat = fs.readFileSync(watPath, 'utf8');
        const goldenWatPath = path.join(goldenDir, test.name.replace(/\.lua$/, '.wat'));

        if (fs.existsSync(goldenWatPath)) {
            const goldenWat = fs.readFileSync(goldenWatPath, 'utf8');
            if (generatedWat !== goldenWat) {
                console.error(`❌ ${test.name} failed golden test!`);
                console.error(`Generated WAT does not match golden WAT.`);
                failed = true;
                continue;
            } else {
                console.log(`✅ ${test.name} golden test passed.`);
            }
        } else {
            console.log(`⚠️ ${test.name} has no golden file. Saving generated WAT as golden.`);
            fs.writeFileSync(goldenWatPath, generatedWat);
        }

        // Compile to WASM and Run
        const output = execSync(`npx ts-node ../run.ts ${watPath}`, { cwd: testsDir }).toString();

        if (output.includes(test.expected)) {
            console.log(`✅ ${test.name} execution passed.`);
        } else {
            console.error(`❌ ${test.name} execution failed!`);
            console.error(`Expected to find: ${test.expected}`);
            console.error(`Got: ${output}`);
            failed = true;
        }
    } catch (e) {
        console.error(`❌ ${test.name} threw an error: ${e}`);
        failed = true;
    }
}

if (failed) {
    process.exit(1);
} else {
    console.log("All golden tests passed!");
}
