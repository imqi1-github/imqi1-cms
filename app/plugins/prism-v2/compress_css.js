const { readFile, writeFile } = require("fs");
const postcss = require("postcss");
const cssnano = require("cssnano");

// 读取输入文件
const inputFile = "A:\\NewImQi1\\usr\\themes\\NewImQi1\\public\\css\\prism.css";
// 输出文件（这里是原地覆盖）
const outputFile = inputFile;

readFile(inputFile, (err, css) => {
  if (err) {
    console.error("读取 CSS 文件失败:", err);
    return;
  }

  // 使用 PostCSS 和 cssnano 压缩 CSS
  postcss([cssnano()])
      .process(css, {
        from: inputFile,
        to: outputFile,
      })
      .then((result) => {
        writeFile(outputFile, result.css, (writeErr) => {
          if (writeErr) {
            console.error("写入压缩文件失败:", writeErr);
          } else {
            console.log("CSS 文件已压缩并保存为 " + outputFile);
          }
        });
      })
      .catch((error) => {
        console.error("CSS 压缩失败:", error);
      });
});
