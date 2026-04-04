import path from "path";
import TerserPlugin from "terser-webpack-plugin";
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  entry: "./prism.js",
  output: {
    filename: "prism.js",
    path: path.resolve(__dirname, "A:\\NewImQi1\\usr\\themes\\NewImQi1\\public\\js"),
    library: {
      type: "module",
    },
    module: true, // 输出 ES6 模块
  },
  mode: "production",
  optimization: {
    moduleIds: "natural",
    mangleWasmImports: true,
    mangleExports: "size",
    chunkIds: "total-size",
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          mangle: {
            keep_classnames: false,
            keep_fnames: false,
          },
          compress: {
            toplevel: true,
            drop_console: false,
            drop_debugger: true,
            unsafe: true,
            unsafe_arrows: true,
          },
          output: {
            comments: false,
            ascii_only: true,
          },
          module: "compress",
          ie8: true,
          safari10: true,
        },
        extractComments: false,
      }),
    ],
  },
  experiments: {
    outputModule: true,
  },
};
