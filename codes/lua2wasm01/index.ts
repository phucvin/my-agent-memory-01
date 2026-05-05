import * as fs from 'fs';
import { Compiler } from './compiler';

const inputPath = process.argv[2];
if (!inputPath) {
    console.error('Usage: ts-node index.ts <input.lua>');
    process.exit(1);
}

const luaCode = fs.readFileSync(inputPath, 'utf8');
const compiler = new Compiler();
const watCode = compiler.compile(luaCode);

const outputPath = inputPath.replace(/\.lua$/, '.wat');
fs.writeFileSync(outputPath, watCode);
console.log(`Compiled ${inputPath} to ${outputPath}`);
