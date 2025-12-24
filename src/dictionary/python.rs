use std::collections::HashSet;
use super::Dictionary;
use wasmtime::*;
use wasi_common::sync::WasiCtxBuilder;
use std::sync::{Arc, Mutex};

pub struct PythonDictionary {
    pub identifier: String,
    pub code: String,
    pub enabled: bool,
    pub longest_key: usize,

    // Wasmtime handles are Copy/Clone and thread-safe (they are just indices).
    // Store is the only thing that needs mutable access and is not thread-safe.
    store: Arc<Mutex<Store<wasi_common::WasiCtx>>>,
    memory: Memory,
    alloc_func: TypedFunc<i32, i32>,
    dealloc_func: TypedFunc<(i32, i32), ()>,
    lookup_func: TypedFunc<(i32, i32), i32>,
    free_string_func: TypedFunc<i32, ()>,
}

impl PythonDictionary {
    pub fn new(identifier: String, code: String, enabled: bool) -> Self {
        println!("Initializing PythonDictionary: {}", identifier);
        let engine = Engine::default();
        let mut linker = Linker::new(&engine);
        wasi_common::sync::add_to_linker(&mut linker, |s| s).unwrap();

        let wasi = WasiCtxBuilder::new()
            .inherit_stdio()
            .build();
        let mut store = Store::new(&engine, wasi);

        let wasm_bytes = include_bytes!("../../assets/python_runner.wasm");
        let module = Module::new(&engine, wasm_bytes).expect("Failed to load python_runner.wasm");

        let instance = linker.instantiate(&mut store, &module).expect("Failed to instantiate");
        let memory = instance.get_memory(&mut store, "memory").expect("Failed to get memory");

        let alloc_func = instance.get_typed_func::<i32, i32>(&mut store, "alloc").unwrap();
        let dealloc_func = instance.get_typed_func::<(i32, i32), ()>(&mut store, "dealloc").unwrap();
        let load_dict_func = instance.get_typed_func::<(i32, i32), i32>(&mut store, "load_dictionary").unwrap();
        let lookup_func = instance.get_typed_func::<(i32, i32), i32>(&mut store, "lookup").unwrap();
        let free_string_func = instance.get_typed_func::<i32, ()>(&mut store, "free_string").unwrap();
        let init_func = instance.get_typed_func::<(), ()>(&mut store, "init").unwrap();

        // Initialize
        init_func.call(&mut store, ()).unwrap();

        // Load code
        let code_bytes = code.as_bytes();
        let len = code_bytes.len() as i32;
        let ptr = alloc_func.call(&mut store, len).unwrap();
        memory.write(&mut store, ptr as usize, code_bytes).unwrap();
        let result = load_dict_func.call(&mut store, (ptr, len)).unwrap();
        dealloc_func.call(&mut store, (ptr, len)).unwrap();

        let longest_key = if result >= 0 { result as usize } else { 0 };
        println!("Loaded dictionary {}. Result: {}, Longest Key: {}", identifier, result, longest_key);
        if result < 0 {
             eprintln!("Failed to load python dictionary: error code {}", result);
        }

        PythonDictionary {
            identifier,
            code,
            enabled,
            longest_key,
            store: Arc::new(Mutex::new(store)),
            memory,
            alloc_func,
            dealloc_func,
            lookup_func,
            free_string_func,
        }
    }
}

impl Dictionary for PythonDictionary {
    fn identifier(&self) -> &str {
        &self.identifier
    }

    fn enabled(&self) -> bool {
        self.enabled
    }

    fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
    }

    fn readonly(&self) -> bool {
        true
    }

    fn longest_key(&self) -> usize {
        self.longest_key
    }

    fn lookup(&self, keys: &[String]) -> Option<String> {
        let mut store = self.store.lock().unwrap();

        let json_keys = serde_json::to_string(keys).ok()?;
        println!("Python lookup keys: {}", json_keys);

        let bytes = json_keys.as_bytes();
        let len = bytes.len() as i32;

        let ptr = self.alloc_func.call(&mut *store, len).ok()?;
        self.memory.write(&mut *store, ptr as usize, bytes).ok()?;

        let res_ptr = self.lookup_func.call(&mut *store, (ptr, len)).ok()?;

        self.dealloc_func.call(&mut *store, (ptr, len)).ok()?;

        if res_ptr == 0 {
            println!("Python lookup returned None");
            return None;
        }

        let mut result_bytes = Vec::new();
        let mut cur = res_ptr;
        loop {
            let mut buf = [0u8; 1];
            self.memory.read(&mut *store, cur as usize, &mut buf).ok()?;
            if buf[0] == 0 {
                break;
            }
            result_bytes.push(buf[0]);
            cur += 1;
        }

        self.free_string_func.call(&mut *store, res_ptr).ok()?;

        let s = String::from_utf8(result_bytes).ok();
        println!("Python lookup result: {:?}", s);
        s
    }

    fn reverse_lookup(&self, _translation: &str) -> HashSet<Vec<String>> {
        HashSet::new()
    }
}
