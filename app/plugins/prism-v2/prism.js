import {Prism} from "./prismjs-src/core/prism";
import bash from "./prismjs-src/languages/bash";
import clike from "./prismjs-src/languages/clike";
import css from "./prismjs-src/languages/css";
import ini from "./prismjs-src/languages/ini";
import java from "./prismjs-src/languages/java";
import javascript from "./prismjs-src/languages/javascript";
import json from "./prismjs-src/languages/json";
import markup from "./prismjs-src/languages/markup";
import php from "./prismjs-src/languages/php";
import powershell from "./prismjs-src/languages/powershell";
import python from "./prismjs-src/languages/python";
import sql from "./prismjs-src/languages/sql";
import typescript from "./prismjs-src/languages/typescript";
import yaml from "./prismjs-src/languages/yaml";

import CopyToClipboard from "./prismjs-src/plugins/copy-to-clipboard/copy-to-clipboard";
import LineNumbers from "./prismjs-src/plugins/line-numbers/line-numbers";
import ShowLanguage from "./prismjs-src/plugins/show-language/show-language";
import Toolbar from "./prismjs-src/plugins/toolbar/toolbar";

export let GlobalPrism;

function highlightAll(bindEvent, forEach) {
  if (!GlobalPrism) {
    GlobalPrism = new Prism({bindEvent});

    GlobalPrism.languageRegistry.add(bash);
    GlobalPrism.languageRegistry.add(clike);
    GlobalPrism.languageRegistry.add(css);
    GlobalPrism.languageRegistry.add(ini);
    GlobalPrism.languageRegistry.add(java);
    GlobalPrism.languageRegistry.add(javascript);
    GlobalPrism.languageRegistry.add(json);
    GlobalPrism.languageRegistry.add(markup);
    GlobalPrism.languageRegistry.add(php);
    GlobalPrism.languageRegistry.add(python);
    GlobalPrism.languageRegistry.add(powershell);
    GlobalPrism.languageRegistry.add(sql);
    GlobalPrism.languageRegistry.add(typescript);
    GlobalPrism.languageRegistry.add(yaml);

    GlobalPrism.pluginRegistry.add(LineNumbers);
    GlobalPrism.pluginRegistry.add(Toolbar);
    GlobalPrism.pluginRegistry.add(ShowLanguage);
    GlobalPrism.pluginRegistry.add(CopyToClipboard);

    GlobalPrism.prefix = (function () {
      let cached;

      function readFromDOM() {
        let el = document.querySelector('[name="resource-prefix"]');
        if (!el) return "";

        return el.getAttribute("content");
      }

      return function prefix() {
        if (cached !== undefined) {
          return cached;
        }

        cached = readFromDOM();
        return cached;
      };
    })();
  }

  forEach()

  GlobalPrism.highlightAll();
}

export default highlightAll

