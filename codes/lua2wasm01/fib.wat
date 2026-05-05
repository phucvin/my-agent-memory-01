(module
  (import "env" "print" (func $env_print (param f64)))
  (import "env" "print_str" (func $env_print_str (param i32 i32)))
  (memory $mem 1)
  (export "mem" (memory $mem))
  (rec
    (type $String (struct (field $offset i32) (field $len i32)))
    (type $TableNode (struct (field $key (ref null $Val)) (field $val (ref null $Val)) (field $next (ref null $TableNode))))
    (type $Table (struct (field $head (mut (ref null $TableNode)))))
    (type $Val (struct
      (field $tag i32)
      (field $num f64)
      (field $str (ref null $String))
      (field $table (ref null $Table))
    ))
  )

        (func $make_nil (result (ref $Val))
            (struct.new $Val (i32.const 0) (f64.const 0) (ref.null $String) (ref.null $Table))
        )


        (func $make_num (param $v f64) (result (ref $Val))
            (struct.new $Val (i32.const 2) (local.get $v) (ref.null $String) (ref.null $Table))
        )


        (func $make_bool (param $v i32) (result (ref $Val))
            (struct.new $Val (i32.const 1) (f64.convert_i32_s (local.get $v)) (ref.null $String) (ref.null $Table))
        )


        (func $make_str (param $offset i32) (param $len i32) (result (ref $Val))
            (struct.new $Val (i32.const 3) (f64.const 0) (struct.new $String (local.get $offset) (local.get $len)) (ref.null $Table))
        )


        (func $make_table (result (ref $Val))
            (struct.new $Val (i32.const 4) (f64.const 0) (ref.null $String) (struct.new $Table (ref.null $TableNode)))
        )


        (func $table_set (param $t (ref null $Val)) (param $k (ref null $Val)) (param $v (ref null $Val))
            (local $table_ref (ref null $Table))
            (local $head (ref null $TableNode))
            (local $node (ref null $TableNode))

            (local.set $table_ref (struct.get $Val $table (local.get $t)))
            (local.set $head (struct.get $Table $head (local.get $table_ref)))
            (local.set $node (struct.new $TableNode (local.get $k) (local.get $v) (local.get $head)))
            (struct.set $Table $head (local.get $table_ref) (local.get $node))
        )


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


        (func $val_eq (param $a (ref null $Val)) (param $b (ref null $Val)) (result i32)
            (if (ref.eq (local.get $a) (local.get $b)) (then (return (i32.const 1))))
            (if (ref.is_null (local.get $a)) (then (return (i32.const 0))))
            (if (ref.is_null (local.get $b)) (then (return (i32.const 0))))
            (if (i32.ne (struct.get $Val $tag (local.get $a)) (struct.get $Val $tag (local.get $b))) (then (return (i32.const 0))))

            (if (i32.eq (struct.get $Val $tag (local.get $a)) (i32.const 2))
                (then (return (f64.eq (struct.get $Val $num (local.get $a)) (struct.get $Val $num (local.get $b)))))
            )

            (if (i32.eq (struct.get $Val $tag (local.get $a)) (i32.const 3))
                (then
                    (return (i32.and
                        (i32.eq (struct.get $String $len (struct.get $Val $str (local.get $a))) (struct.get $String $len (struct.get $Val $str (local.get $b))))
                        (i32.eq (struct.get $String $offset (struct.get $Val $str (local.get $a))) (struct.get $String $offset (struct.get $Val $str (local.get $b))))
                    ))
                )
            )

            (return (i32.const 0))
        )


        (func $val_add (param $a (ref null $Val)) (param $b (ref null $Val)) (result (ref null $Val))
            (call $make_num (f64.add (struct.get $Val $num (local.get $a)) (struct.get $Val $num (local.get $b))))
        )


        (func $val_sub (param $a (ref null $Val)) (param $b (ref null $Val)) (result (ref null $Val))
            (call $make_num (f64.sub (struct.get $Val $num (local.get $a)) (struct.get $Val $num (local.get $b))))
        )


        (func $val_lt (param $a (ref null $Val)) (param $b (ref null $Val)) (result (ref null $Val))
            (call $make_bool (f64.lt (struct.get $Val $num (local.get $a)) (struct.get $Val $num (local.get $b))))
        )


        (func $val_le (param $a (ref null $Val)) (param $b (ref null $Val)) (result (ref null $Val))
            (call $make_bool (f64.le (struct.get $Val $num (local.get $a)) (struct.get $Val $num (local.get $b))))
        )


        (func $is_truthy (param $a (ref null $Val)) (result i32)
            (if (ref.is_null (local.get $a)) (then (return (i32.const 0))))
            (if (i32.eq (struct.get $Val $tag (local.get $a)) (i32.const 0)) (then (return (i32.const 0))))
            (if (i32.eq (struct.get $Val $tag (local.get $a)) (i32.const 1))
                (then (return (i32.ne (i32.trunc_f64_s (struct.get $Val $num (local.get $a))) (i32.const 0))))
            )
            (return (i32.const 1))
        )


        (func $print_val (param $v (ref null $Val))
            (if (ref.is_null (local.get $v))
                (then (return))
            )
            (if (i32.eq (struct.get $Val $tag (local.get $v)) (i32.const 2))
                (then
                    (call $env_print (struct.get $Val $num (local.get $v)))
                )
            )
            (if (i32.eq (struct.get $Val $tag (local.get $v)) (i32.const 3))
                (then
                    (call $env_print_str
                        (struct.get $String $offset (struct.get $Val $str (local.get $v)))
                        (struct.get $String $len (struct.get $Val $str (local.get $v)))
                    )
                )
            )
        )

  (func $fib (export "fib") (param $n (ref null $Val)) (result (ref null $Val))
    (local $tmp_table (ref null $Val))
    local.get $n
    f64.const 1
    call $make_num
    call $val_le
    call $is_truthy
    if
      local.get $n
      return
    else
      local.get $n
      f64.const 1
      call $make_num
      call $val_sub
      call $fib
      local.get $n
      f64.const 2
      call $make_num
      call $val_sub
      call $fib
      call $val_add
      return
    end
    call $make_nil
    return
  )
  (func $main (export "main")
    (local $tmp_table (ref null $Val))
  )
)
