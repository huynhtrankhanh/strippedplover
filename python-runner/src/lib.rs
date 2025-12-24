use rustpython_vm as vm;
use std::ffi::CString;
use std::os::raw::c_char;
use std::mem;

// Global interpreter state
static mut INTERPRETER: Option<vm::Interpreter> = None;
static mut SCOPE: Option<vm::scope::Scope> = None;
static mut LONGEST_KEY: usize = 0;

#[no_mangle]
pub extern "C" fn init() {
    let interp = vm::Interpreter::without_stdlib(Default::default());
    unsafe {
        INTERPRETER = Some(interp);
    }
}

// Simple ABI: pass string ptr/len, return string ptr/len
// We need memory allocation exported

#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::with_capacity(len);
    let ptr = buf.as_mut_ptr();
    mem::forget(buf);
    ptr
}

#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    let _ = Vec::from_raw_parts(ptr, 0, len);
}

#[no_mangle]
pub extern "C" fn load_dictionary(ptr: *const u8, len: usize) -> i32 {
    let slice = unsafe { std::slice::from_raw_parts(ptr, len) };
    let code = match std::str::from_utf8(slice) {
        Ok(s) => s,
        Err(_) => return -1,
    };

    unsafe {
        if let Some(interp) = &INTERPRETER {
            let scope = interp.enter(|vm| {
                let scope = vm.new_scope_with_builtins();
                // TODO: restrict builtins?
                scope
            });

            let result: Result<(), ()> = interp.enter(|vm| {
                let code_obj = vm.compile(code, vm::compiler::Mode::Exec, "<string>".to_owned())
                    .map_err(|_| ())?;
                vm.run_code_obj(code_obj, scope.clone()).map_err(|_| ())?;

                // Get LONGEST_KEY
                let longest_key_obj = scope.globals.get_item("LONGEST_KEY", vm).map_err(|_| ())?;
                let val: usize = longest_key_obj.try_into_value(vm).map_err(|_| ())?;
                LONGEST_KEY = val;

                Ok(())
            });

            if result.is_err() {
                return -2;
            }
            SCOPE = Some(scope);
            return LONGEST_KEY as i32;
        }
    }
    -3
}

#[no_mangle]
pub extern "C" fn lookup(ptr: *const u8, len: usize) -> *mut c_char {
    let slice = unsafe { std::slice::from_raw_parts(ptr, len) };
    let json_keys = match std::str::from_utf8(slice) {
        Ok(s) => s,
        Err(_) => return std::ptr::null_mut(),
    };

    let keys: Vec<String> = match serde_json::from_str(json_keys) {
        Ok(k) => k,
        Err(_) => return std::ptr::null_mut(),
    };

    unsafe {
        if let (Some(interp), Some(scope)) = (&INTERPRETER, &SCOPE) {
            let res = interp.enter(|vm| {
                let elements: Vec<vm::PyObjectRef> = keys.iter().map(|k| vm.ctx.new_str(k.as_str()).into()).collect();
                let key_tuple = vm.ctx.new_tuple(elements);

                let lookup_func = scope.globals.get_item("lookup", vm).ok()?;
                let result = lookup_func.call((key_tuple,), vm).ok()?;

                if vm.is_none(&result) {
                    return None;
                }

                result.try_into_value::<String>(vm).ok()
            });

            if let Some(s) = res {
                let c_str = CString::new(s).unwrap();
                return c_str.into_raw();
            }
        }
    }
    std::ptr::null_mut()
}

#[no_mangle]
pub unsafe extern "C" fn free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        let _ = CString::from_raw(ptr);
    }
}
