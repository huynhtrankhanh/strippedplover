"use strict";
// TODO: Very preliminary!
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchPackages = void 0;
const debug_1 = __importDefault(require("debug"));
const log = (0, debug_1.default)("python-wasm:packages");
const numpy_tar_xz_1 = __importDefault(require("./numpy.tar.xz"));
const mpmath_tar_xz_1 = __importDefault(require("./mpmath.tar.xz"));
const sympy_tar_xz_1 = __importDefault(require("./sympy.tar.xz"));
const pandas_tar_xz_1 = __importDefault(require("./pandas.tar.xz"));
const six_tar_xz_1 = __importDefault(require("./six.tar.xz"));
const pytz_tar_xz_1 = __importDefault(require("./pytz.tar.xz"));
const dateutil_tar_xz_1 = __importDefault(require("./dateutil.tar.xz"));
async function fetchPackages(kernel) {
    log("fetching demo packages in parallel: numpy, mpmath, sympy");
    await Promise.all([
        kernel.fetch(numpy_tar_xz_1.default, "/usr/lib/python3.11/numpy.tar.xz"),
        kernel.fetch(mpmath_tar_xz_1.default, "/usr/lib/python3.11/mpmath.tar.xz"),
        kernel.fetch(sympy_tar_xz_1.default, "/usr/lib/python3.11/sympy.tar.xz"),
        kernel.fetch(pandas_tar_xz_1.default, "/usr/lib/python3.11/pandas.tar.xz"),
        kernel.fetch(six_tar_xz_1.default, "/usr/lib/python3.11/six.tar.xz"),
        kernel.fetch(pytz_tar_xz_1.default, "/usr/lib/python3.11/pytz.tar.xz"),
        kernel.fetch(dateutil_tar_xz_1.default, "/usr/lib/python3.11/dateutil.tar.xz"),
    ]);
    log("fetched packages");
}
exports.fetchPackages = fetchPackages;
//# sourceMappingURL=packages.js.map