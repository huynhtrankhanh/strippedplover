import { Options } from "./import";
import type { WasmInstanceSync } from "../types";
export default function wasmImportNode(name: string, options: Options): Promise<WasmInstanceSync>;
