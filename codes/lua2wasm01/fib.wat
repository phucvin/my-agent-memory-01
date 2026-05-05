(module
  (func $fib (export "fib") (param $n f64) (result f64)
    local.get $n
    f64.const 1
    f64.le
    if
      local.get $n
      return
    else
      local.get $n
      f64.const 1
      f64.sub
      call $fib
      local.get $n
      f64.const 2
      f64.sub
      call $fib
      f64.add
      return
    end
    f64.const 0
    return
  )
)
