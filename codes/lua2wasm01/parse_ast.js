const luaparse = require('luaparse');
const ast = luaparse.parse(`
    local s = "hello"
    local t = { a = 1, [2] = "b" }
    print(t.a)
    print(t[2])
`);
console.log(JSON.stringify(ast, null, 2));
