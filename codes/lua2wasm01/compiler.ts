import * as luaparse from 'luaparse';

export class Compiler {
    private code: string = '';
    private indentLevel: number = 0;

    // Simplistic symbol table
    private locals: Map<string, string> = new Map();

    private append(str: string) {
        this.code += '  '.repeat(this.indentLevel) + str + '\n';
    }

    public compile(luaCode: string): string {
        const ast = luaparse.parse(luaCode, {
            locations: true,
            scope: true,
        });

        this.code = '(module\n';
        this.indentLevel++;

        this.visit(ast);

        this.indentLevel--;
        this.code += ')\n';
        return this.code;
    }

    private visit(node: any) {
        if (!node) return;
        switch (node.type) {
            case 'Chunk':
                for (const stat of node.body) {
                    this.visit(stat);
                }
                break;
            case 'LocalStatement':
                // For simplicity, handle single variable declaration
                for (let i = 0; i < node.variables.length; i++) {
                    const variable = node.variables[i];
                    const init = node.init[i];

                    if (variable.type === 'Identifier') {
                        const varName = `$${variable.name}`;
                        this.locals.set(variable.name, varName);
                        if (init) {
                            this.visit(init);
                            this.append(`local.set ${varName}`);
                        }
                    }
                }
                break;
            case 'FunctionDeclaration':
                this.visitFunctionDeclaration(node);
                break;
            case 'ReturnStatement':
                if (node.arguments.length > 0) {
                    this.visit(node.arguments[0]);
                } else {
                    this.append('f64.const 0'); // Default return
                }
                this.append('return');
                break;
            case 'BinaryExpression':
                this.visit(node.left);
                this.visit(node.right);
                switch (node.operator) {
                    case '+': this.append('f64.add'); break;
                    case '-': this.append('f64.sub'); break;
                    case '*': this.append('f64.mul'); break;
                    case '/': this.append('f64.div'); break;
                    case '<': this.append('f64.lt'); break;
                    case '<=': this.append('f64.le'); break;
                    case '>': this.append('f64.gt'); break;
                    case '>=': this.append('f64.ge'); break;
                    case '==': this.append('f64.eq'); break;
                    case '~=': this.append('f64.ne'); break;
                    default:
                        throw new Error(`Unsupported binary operator: ${node.operator}`);
                }
                break;
            case 'NumericLiteral':
                this.append(`f64.const ${node.value}`);
                break;
            case 'Identifier':
                this.append(`local.get $${node.name}`);
                break;
            case 'AssignmentStatement':
                for (let i = 0; i < node.variables.length; i++) {
                    this.visit(node.init[i]);
                    const v = node.variables[i];
                    if (v.type === 'Identifier') {
                        this.append(`local.set $${v.name}`);
                    }
                }
                break;
            case 'IfStatement':
                // Simplified if/else for recursive fibonacci
                // In WASM, if takes a condition from the stack.
                // Our comparisons yield i32, so we can directly consume it with `if`.
                const clause = node.clauses[0]; // Assume simple if for now
                if (clause.type === 'IfClause') {
                    this.visit(clause.condition);
                    this.append(`if (result f64)`);
                    this.indentLevel++;

                    let hasReturn = false;
                    for (const stat of clause.body) {
                        this.visit(stat);
                        if (stat.type === 'ReturnStatement') hasReturn = true;
                    }
                    if (!hasReturn) this.append('f64.const 0'); // placeholder for type safety

                    this.indentLevel--;

                    if (node.clauses.length > 1 && node.clauses[1].type === 'ElseClause') {
                        this.append(`else`);
                        this.indentLevel++;
                        hasReturn = false;
                        for (const stat of node.clauses[1].body) {
                            this.visit(stat);
                            if (stat.type === 'ReturnStatement') hasReturn = true;
                        }
                        if (!hasReturn) this.append('f64.const 0');
                        this.indentLevel--;
                    } else {
                        this.append(`else`);
                        this.indentLevel++;
                        this.append('f64.const 0');
                        this.indentLevel--;
                    }
                    this.append(`end`);
                    // Since it returns a value and we might be inside a function that returns f64.
                    // Wait, if it's a ReturnStatement, it already emitted `return`.
                    // So returning a value from `if` block is only necessary if we don't branch out.
                    // Actually, if we emit `return` inside, the `if` block type can be anything, but `if` with (result f64) expects an f64.
                    // This is tricky. Let's not use (result f64) if it's a statement!
                }
                break;
            case 'CallExpression':
                for (const arg of node.arguments) {
                    this.visit(arg);
                }
                if (node.base.type === 'Identifier') {
                    this.append(`call $${node.base.name}`);
                } else {
                    throw new Error('Indirect calls not implemented');
                }
                break;
            default:
                console.warn(`Unhandled node type: ${node.type}`);
        }
    }

    private visitFunctionDeclaration(node: any) {
        let funcName = '';
        if (node.identifier && node.identifier.type === 'Identifier') {
            funcName = node.identifier.name;
        }

        const params = node.parameters.map((p: any) => `(param $${p.name} f64)`).join(' ');
        let exportStr = `(export "${funcName}") `;

        this.append(`(func $${funcName} ${exportStr}${params} (result f64)`);
        this.indentLevel++;

        const locals = new Set<string>();
        const findLocals = (n: any) => {
            if (!n) return;
            if (n.type === 'LocalStatement') {
                for (const v of n.variables) {
                    if (v.type === 'Identifier') {
                        locals.add(v.name);
                    }
                }
            }
            if (n.body && Array.isArray(n.body)) {
                n.body.forEach(findLocals);
            }
            if (n.clauses) {
                n.clauses.forEach((c: any) => {
                    if (c.body && Array.isArray(c.body)) c.body.forEach(findLocals)
                });
            }
        };
        for (const stat of node.body) {
            findLocals(stat);
        }

        for (const loc of locals) {
            this.append(`(local $${loc} f64)`);
        }

        for (const stat of node.body) {
            if (stat.type === 'IfStatement') {
                // Better if handling for statements
                const clause = stat.clauses[0];
                this.visit(clause.condition);
                this.append(`if`);
                this.indentLevel++;
                for (const s of clause.body) {
                    this.visit(s);
                }
                this.indentLevel--;

                if (stat.clauses.length > 1 && stat.clauses[1].type === 'ElseClause') {
                    this.append(`else`);
                    this.indentLevel++;
                    for (const s of stat.clauses[1].body) {
                        this.visit(s);
                    }
                    this.indentLevel--;
                }
                this.append(`end`);
            } else {
                this.visit(stat);
            }
        }

        this.append('f64.const 0'); // Default return value
        this.append('return');

        this.indentLevel--;
        this.append(`)`);
    }
}
