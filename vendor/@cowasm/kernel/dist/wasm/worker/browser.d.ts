import type WasmInstanceSync from "./instance";
import { Options } from "./import";
export default function wasmImportBrowser(wasmUrl: string, options?: Options): Promise<WasmInstanceSync>;
