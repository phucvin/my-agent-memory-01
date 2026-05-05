(module
  (type $my_struct (struct (field i32)))
  (func $main (export "main") (result i32)
    (local $s (ref $my_struct))
    (local.set $s (struct.new $my_struct (i32.const 42)))
    (struct.get $my_struct 0 (local.get $s))
  )
)
