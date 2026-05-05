import * as luaparse from 'luaparse';

// Type Tags
const TAG_NIL = 0;
const TAG_BOOL = 1;
const TAG_NUM = 2;
const TAG_STR = 3;
const TAG_TABLE = 4;

export class Compiler {
    public code: string = '';
    public indentLevel: number = 0;

    private locals: Map<string, string> = new Map();
    private currentFuncLocals: Set<string> = new Set();

    private stringPool: Map<string, number> = new Map();
    private nextStringOffset: number = 0;

    public append(str: string) {
        this.code += '  '.repeat(this.indentLevel) + str + '\n';
    }

    public compile(luaCode: string): string {
        const ast = luaparse.parse(luaCode, {
            locations: true,
            scope: true,
        });

        this.code = '(module\n';
        this.indentLevel++;

        this.append('(import "env" "print" (func $env_print (param f64)))');
        this.append('(import "env" "print_str" (func $env_print_str (param i32 i32)))');

        // Linear memory for strings
        this.append('(memory $mem 1)');
        this.append('(export "mem" (memory $mem))');

        // Define Wasm GC Types
        this.append('(rec');
        this.append('  (type $String (struct (field $offset i32) (field $len i32)))');
        this.append('  (type $TableNode (struct (field $key (ref null $Val)) (field $val (ref null $Val)) (field $next (ref null $TableNode))))');
        this.append('  (type $Table (struct (field $head (mut (ref null $TableNode)))))');
        this.append('  (type $Val (struct ');
        this.append('    (field $tag i32)');
        this.append('    (field $num f64)');
        this.append('    (field $str (ref null $String))');
        this.append('    (field $table (ref null $Table))');
        this.append('  ))');
        this.append(')');

        this.emitHelpers();

        this.visit(ast);

        // Data segment for strings
        for (const [str, offset] of this.stringPool.entries()) {
            let escaped = '';
            for (let i = 0; i < str.length; i++) {
                const hex = str.charCodeAt(i).toString(16).padStart(2, '0');
                escaped += `\\${hex}`;
            }
            this.append(`(data (i32.const ${offset}) "${escaped}")`);
        }

        this.indentLevel--;
        this.code += ')\n';
        return this.code;
    }

    private emitHelpers() {
        this.append(`
        (func $make_nil (result (ref $Val))
            (struct.new $Val (i32.const ${TAG_NIL}) (f64.const 0) (ref.null $String) (ref.null $Table))
        )
        `);

        this.append(`
        (func $make_num (param $v f64) (result (ref $Val))
            (struct.new $Val (i32.const ${TAG_NUM}) (local.get $v) (ref.null $String) (ref.null $Table))
        )
        `);

        this.append(`
        (func $make_bool (param $v i32) (result (ref $Val))
            (struct.new $Val (i32.const ${TAG_BOOL}) (f64.convert_i32_s (local.get $v)) (ref.null $String) (ref.null $Table))
        )
        `);

        this.append(`
        (func $make_str (param $offset i32) (param $len i32) (result (ref $Val))
            (struct.new $Val (i32.const ${TAG_STR}) (f64.const 0) (struct.new $String (local.get $offset) (local.get $len)) (ref.null $Table))
        )
        `);

        this.append(`
        (func $make_table (result (ref $Val))
            (struct.new $Val (i32.const ${TAG_TABLE}) (f64.const 0) (ref.null $String) (struct.new $Table (ref.null $TableNode)))
        )
        `);

        this.append(`
        (func $table_set (param $t (ref null $Val)) (param $k (ref null $Val)) (param $v (ref null $Val))
            (local $table_ref (ref null $Table))
            (local $head (ref null $TableNode))
            (local $node (ref null $TableNode))

            (local.set $table_ref (struct.get $Val $table (local.get $t)))
            (local.set $head (struct.get $Table $head (local.get $table_ref)))
            (local.set $node (struct.new $TableNode (local.get $k) (local.get $v) (local.get $head)))
            (struct.set $Table $head (local.get $table_ref) (local.get $node))
        )
        `);

        this.append(`
        (func $table_get (param $t (ref null $Val)) (param $k (ref null $Val)) (result (ref null $Val))
            (local $table_ref (ref null $Table))
            (local $curr (ref null $TableNode))
            (local $curr_k (ref null $Val))
            (local $match i32)

            (local.set $table_ref (struct.get $Val $table (local.get $t)))
            (local.set $curr (struct.get $Table $head (local.get $table_ref)))

            (loop $search
                (if (ref.is_null (local.get $curr))
                    (then (return (call $make_nil)))
                )
                (local.set $curr_k (struct.get $TableNode $key (local.get $curr)))

                (local.set $match (call $val_eq (local.get $curr_k) (local.get $k)))

                (if (local.get $match)
                    (then
                        (return (struct.get $TableNode $val (local.get $curr)))
                    )
                )

                (local.set $curr (struct.get $TableNode $next (local.get $curr)))
                (br $search)
            )
            (unreachable)
        )
        `);

        this.append(`
        (func $val_eq (param $a (ref null $Val)) (param $b (ref null $Val)) (result i32)
            (if (ref.eq (local.get $a) (local.get $b)) (then (return (i32.const 1))))
            (if (ref.is_null (local.get $a)) (then (return (i32.const 0))))
            (if (ref.is_null (local.get $b)) (then (return (i32.const 0))))
            (if (i32.ne (struct.get $Val $tag (local.get $a)) (struct.get $Val $tag (local.get $b))) (then (return (i32.const 0))))

            (if (i32.eq (struct.get $Val $tag (local.get $a)) (i32.const ${TAG_NUM}))
                (then (return (f64.eq (struct.get $Val $num (local.get $a)) (struct.get $Val $num (local.get $b)))))
            )

            (if (i32.eq (struct.get $Val $tag (local.get $a)) (i32.const ${TAG_STR}))
                (then
                    (return (i32.and
                        (i32.eq (struct.get $String $len (struct.get $Val $str (local.get $a))) (struct.get $String $len (struct.get $Val $str (local.get $b))))
                        (i32.eq (struct.get $String $offset (struct.get $Val $str (local.get $a))) (struct.get $String $offset (struct.get $Val $str (local.get $b))))
                    ))
                )
            )

            (return (i32.const 0))
        )
        `);

        this.append(`
        (func $val_add (param $a (ref null $Val)) (param $b (ref null $Val)) (result (ref null $Val))
            (call $make_num (f64.add (struct.get $Val $num (local.get $a)) (struct.get $Val $num (local.get $b))))
        )
        `);

        this.append(`
        (func $val_sub (param $a (ref null $Val)) (param $b (ref null $Val)) (result (ref null $Val))
            (call $make_num (f64.sub (struct.get $Val $num (local.get $a)) (struct.get $Val $num (local.get $b))))
        )
        `);

        this.append(`
        (func $val_lt (param $a (ref null $Val)) (param $b (ref null $Val)) (result (ref null $Val))
            (call $make_bool (f64.lt (struct.get $Val $num (local.get $a)) (struct.get $Val $num (local.get $b))))
        )
        `);

        this.append(`
        (func $val_le (param $a (ref null $Val)) (param $b (ref null $Val)) (result (ref null $Val))
            (call $make_bool (f64.le (struct.get $Val $num (local.get $a)) (struct.get $Val $num (local.get $b))))
        )
        `);

        this.append(`
        (func $is_truthy (param $a (ref null $Val)) (result i32)
            (if (ref.is_null (local.get $a)) (then (return (i32.const 0))))
            (if (i32.eq (struct.get $Val $tag (local.get $a)) (i32.const ${TAG_NIL})) (then (return (i32.const 0))))
            (if (i32.eq (struct.get $Val $tag (local.get $a)) (i32.const ${TAG_BOOL}))
                (then (return (i32.ne (i32.trunc_f64_s (struct.get $Val $num (local.get $a))) (i32.const 0))))
            )
            (return (i32.const 1))
        )
        `);

        this.append(`
        (func $print_val (param $v (ref null $Val))
            (if (ref.is_null (local.get $v))
                (then (return))
            )
            (if (i32.eq (struct.get $Val $tag (local.get $v)) (i32.const ${TAG_NUM}))
                (then
                    (call $env_print (struct.get $Val $num (local.get $v)))
                )
            )
            (if (i32.eq (struct.get $Val $tag (local.get $v)) (i32.const ${TAG_STR}))
                (then
                    (call $env_print_str
                        (struct.get $String $offset (struct.get $Val $str (local.get $v)))
                        (struct.get $String $len (struct.get $Val $str (local.get $v)))
                    )
                )
            )
        )
        `);
    }

    private getStringOffset(str: string): {offset: number, len: number} {
        if (this.stringPool.has(str)) {
            return { offset: this.stringPool.get(str)!, len: str.length };
        }
        const offset = this.nextStringOffset;
        this.stringPool.set(str, offset);
        this.nextStringOffset += str.length;
        return { offset, len: str.length };
    }

    private visit(node: any) {
        if (!node) return;
        switch (node.type) {
            case 'Chunk':
                for (const stat of node.body) {
                    if (stat.type === 'FunctionDeclaration') {
                        this.visit(stat);
                    }
                }

                this.append('(func $main (export "main")');
                this.indentLevel++;

                this.currentFuncLocals = new Set();
                const locals = this.currentFuncLocals;

                const findLocals = (n: any) => {
                    if (!n) return;
                    if (n.type === 'LocalStatement') {
                        for (const v of n.variables) {
                            if (v.type === 'Identifier') {
                                locals.add(v.name);
                            }
                        }
                    }
                    if (n.type === 'FunctionDeclaration') return;
                    if (n.body && Array.isArray(n.body)) n.body.forEach(findLocals);
                    if (n.clauses) n.clauses.forEach((c: any) => {
                        if (c.body && Array.isArray(c.body)) c.body.forEach(findLocals)
                    });
                };
                for (const stat of node.body) {
                    if (stat.type !== 'FunctionDeclaration') {
                        findLocals(stat);
                    }
                }

                for (const loc of locals) {
                    this.append(`(local $${loc} (ref null $Val))`);
                }

                // Add tmp_table if needed
                this.append(`(local $tmp_table (ref null $Val))`);

                for (const stat of node.body) {
                    if (stat.type !== 'FunctionDeclaration') {
                        this.visit(stat);
                    }
                }

                this.indentLevel--;
                this.append(')');
                break;
            case 'LocalStatement':
                for (let i = 0; i < node.variables.length; i++) {
                    const variable = node.variables[i];
                    const init = node.init[i];

                    if (variable.type === 'Identifier') {
                        const varName = `$${variable.name}`;
                        if (init) {
                            this.visit(init);
                        } else {
                            this.append(`call $make_nil`);
                        }
                        this.append(`local.set ${varName}`);
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
                    this.append('call $make_nil');
                }
                this.append('return');
                break;
            case 'BinaryExpression':
                this.visit(node.left);
                this.visit(node.right);
                switch (node.operator) {
                    case '+': this.append('call $val_add'); break;
                    case '-': this.append('call $val_sub'); break;
                    case '<': this.append('call $val_lt'); break;
                    case '<=': this.append('call $val_le'); break;
                    case '==':
                        this.append('call $val_eq');
                        this.append('call $make_bool');
                        break;
                    default:
                        console.warn(`Unsupported binary operator: ${node.operator}`);
                        this.append('call $make_nil');
                }
                break;
            case 'NumericLiteral':
                this.append(`f64.const ${node.value}`);
                this.append(`call $make_num`);
                break;
            case 'StringLiteral':
                const strVal = node.raw.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
                const {offset, len} = this.getStringOffset(strVal);
                this.append(`i32.const ${offset}`);
                this.append(`i32.const ${len}`);
                this.append(`call $make_str`);
                break;
            case 'Identifier':
                this.append(`local.get $${node.name}`);
                break;
            case 'AssignmentStatement':
                for (let i = 0; i < node.variables.length; i++) {
                    const v = node.variables[i];
                    if (v.type === 'Identifier') {
                        this.visit(node.init[i]);
                        this.append(`local.set $${v.name}`);
                    } else if (v.type === 'IndexExpression' || v.type === 'MemberExpression') {
                        this.visit(v.base);
                        if (v.type === 'MemberExpression') {
                            const {offset: o, len: l} = this.getStringOffset(v.identifier.name);
                            this.append(`i32.const ${o}`);
                            this.append(`i32.const ${l}`);
                            this.append(`call $make_str`);
                        } else {
                            this.visit(v.index);
                        }
                        this.visit(node.init[i]);
                        this.append(`call $table_set`);
                    }
                }
                break;
            case 'IfStatement':
                const clause = node.clauses[0];
                if (clause.type === 'IfClause') {
                    this.visit(clause.condition);
                    this.append(`call $is_truthy`);
                    this.append(`if`);
                    this.indentLevel++;

                    for (const stat of clause.body) {
                        this.visit(stat);
                    }

                    this.indentLevel--;

                    if (node.clauses.length > 1 && node.clauses[1].type === 'ElseClause') {
                        this.append(`else`);
                        this.indentLevel++;
                        for (const stat of node.clauses[1].body) {
                            this.visit(stat);
                        }
                        this.indentLevel--;
                    }
                    this.append(`end`);
                }
                break;
            case 'CallExpression':
                if (node.base.type === 'Identifier' && node.base.name === 'print') {
                    if (node.arguments.length > 0) {
                        this.visit(node.arguments[0]);
                        this.append('call $print_val');
                    }
                } else {
                    for (const arg of node.arguments) {
                        this.visit(arg);
                    }
                    if (node.base.type === 'Identifier') {
                        this.append(`call $${node.base.name}`);
                    } else {
                        console.warn('Indirect calls not implemented');
                    }
                }
                break;
            case 'TableConstructorExpression':
                this.append(`call $make_table`);
                if (node.fields && node.fields.length > 0) {
                    this.append(`local.set $tmp_table`);

                    let arrayIndex = 1;
                    for (const field of node.fields) {
                        this.append(`local.get $tmp_table`);
                        if (field.type === 'TableKeyString') {
                            const {offset: o, len: l} = this.getStringOffset(field.key.name);
                            this.append(`i32.const ${o}`);
                            this.append(`i32.const ${l}`);
                            this.append(`call $make_str`);
                            this.visit(field.value);
                            this.append(`call $table_set`);
                        } else if (field.type === 'TableKey') {
                            this.visit(field.key);
                            this.visit(field.value);
                            this.append(`call $table_set`);
                        } else if (field.type === 'TableValue') {
                            this.append(`f64.const ${arrayIndex++}`);
                            this.append(`call $make_num`);
                            this.visit(field.value);
                            this.append(`call $table_set`);
                        }
                    }
                    this.append(`local.get $tmp_table`);
                }
                break;
            case 'IndexExpression':
                this.visit(node.base);
                this.visit(node.index);
                this.append(`call $table_get`);
                break;
            case 'MemberExpression':
                this.visit(node.base);
                const {offset: ko, len: kl} = this.getStringOffset(node.identifier.name);
                this.append(`i32.const ${ko}`);
                this.append(`i32.const ${kl}`);
                this.append(`call $make_str`);
                this.append(`call $table_get`);
                break;
            case 'CallStatement':
                this.visit(node.expression);
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

        const params = node.parameters.map((p: any) => `(param $${p.name} (ref null $Val))`).join(' ');
        let exportStr = `(export "${funcName}") `;

        this.append(`(func $${funcName} ${exportStr}${params} (result (ref null $Val))`);
        this.indentLevel++;

        this.currentFuncLocals = new Set();
        const locals = this.currentFuncLocals;

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
            this.append(`(local $${loc} (ref null $Val))`);
        }

        // Add tmp_table if needed
        this.append(`(local $tmp_table (ref null $Val))`);

        for (const stat of node.body) {
            this.visit(stat);
        }

        this.append('call $make_nil');
        this.append('return');

        this.indentLevel--;
        this.append(`)`);
    }
}
