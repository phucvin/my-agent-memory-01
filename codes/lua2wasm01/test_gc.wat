(module
  (type $struct (struct (field i32)))
  (func $main (export "main") (result i32)
    (local $s (ref $struct))
    (local.set $s (struct.new $struct (i32.const 42)))
    (struct.get $struct 0 (local.get $s))
  )
)
