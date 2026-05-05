const wabt = require('wabt')();
wabt.then(w => {
    try {
        const wasmModule = w.parseWat('test_gc.wat', `
        (module
          (type $struct (struct (field i32)))
        )`, { gc: true });
        console.log("GC supported.");
    } catch(e) {
        console.log("GC not supported:", e);
    }
});
