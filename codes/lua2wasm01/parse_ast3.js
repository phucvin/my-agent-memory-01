const wabt = require('wabt')();
wabt.then(w => {
    try {
        const wasmModule = w.parseWat('test_gc.wat', `
        (module
          (type $struct (struct (field i32)))
          (func $main (result i32)
            (local $s (ref $struct))
            (local.set $s (struct.new $struct (i32.const 42)))
            (struct.get $struct 0 (local.get $s))
          )
        )`, { gc: true });
        console.log("GC supported.");
    } catch(e) {
        console.log("GC not supported:", e);
    }
});
