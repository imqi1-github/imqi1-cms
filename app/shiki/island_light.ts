export default {
  name: "Islands Light",
  type: "light",
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#080808",
  },
  tokenColors: [
    {
      name: "Comment",
      scope: ["comment", "comment.block", "comment.line"],
      settings: {
        foreground: "#8c8c8c",
        fontStyle: "italic",
      },
    },
    {
      name: "Doc Comment",
      scope: ["comment.block.documentation"],
      settings: {
        foreground: "#8c8c8c",
        fontStyle: "italic",
      },
    },
    {
      name: "Doc Comment Tag",
      scope: ["storage.type.class.jsdoc", "entity.name.type.instance.jsdoc"],
      settings: {
        foreground: "#999999",
      },
    },
    {
      name: "Doc Comment Tag Value",
      scope: ["variable.other.jsdoc"],
      settings: {
        foreground: "#3d3d3d",
        fontStyle: "italic",
      },
    },
    {
      name: "String",
      scope: ["string", "string.quoted", "string.template"],
      settings: {
        foreground: "#067d17",
      },
    },
    {
      name: "String Escape",
      scope: ["constant.character.escape", "constant.other.placeholder"],
      settings: {
        foreground: "#0037a6",
      },
    },
    {
      name: "Invalid String Escape",
      scope: ["invalid.illegal.escape"],
      settings: {
        foreground: "#067d17",
        background: "#ffcccc",
      },
    },
    {
      name: "Number",
      scope: ["constant.numeric", "constant.language.numeric"],
      settings: {
        foreground: "#1750eb",
      },
    },
    {
      name: "Boolean",
      scope: ["constant.language.boolean"],
      settings: {
        foreground: "#0033b3",
      },
    },
    {
      name: "Null",
      scope: ["constant.language.null", "constant.language.undefined"],
      settings: {
        foreground: "#0033b3",
      },
    },
    {
      name: "Keyword",
      scope: ["keyword", "keyword.control", "keyword.operator.new", "keyword.operator.expression", "keyword.other"],
      settings: {
        foreground: "#0033b3",
      },
    },
    {
      name: "Operator",
      scope: [
        "keyword.operator",
        "keyword.operator.arithmetic",
        "keyword.operator.assignment",
        "keyword.operator.comparison",
        "keyword.operator.logical",
      ],
      settings: {
        foreground: "#080808",
      },
    },
    {
      name: "Storage Type",
      scope: ["storage.type", "storage.modifier"],
      settings: {
        foreground: "#0033b3",
      },
    },
    {
      name: "Function",
      scope: ["entity.name.function", "support.function"],
      settings: {
        foreground: "#00627a",
      },
    },
    {
      name: "Method",
      scope: ["entity.name.function.member"],
      settings: {
        foreground: "#00627a",
      },
    },
    {
      name: "Static Method",
      scope: ["entity.name.function.member.static"],
      settings: {
        foreground: "#00627a",
        fontStyle: "italic",
      },
    },
    {
      name: "Class",
      scope: ["entity.name.type.class", "entity.name.class", "support.class"],
      settings: {
        foreground: "#080808",
      },
    },
    {
      name: "Type",
      scope: ["entity.name.type", "support.type"],
      settings: {
        foreground: "#336ecc",
      },
    },
    {
      name: "Type Parameter",
      scope: ["entity.name.type.parameter"],
      settings: {
        foreground: "#007e8a",
      },
    },
    {
      name: "Interface",
      scope: ["entity.name.type.interface"],
      settings: {
        foreground: "#336ecc",
      },
    },
    {
      name: "Variable",
      scope: ["variable", "variable.other.readwrite", "variable.other.object"],
      settings: {
        foreground: "#080808",
      },
    },
    {
      name: "Constant Variable",
      scope: ["variable.other.constant", "constant.other"],
      settings: {
        foreground: "#871094",
        fontStyle: "italic",
      },
    },
    {
      name: "Property",
      scope: ["variable.other.property", "support.variable.property"],
      settings: {
        foreground: "#871094",
      },
    },
    {
      name: "Static Property",
      scope: ["variable.other.property.static"],
      settings: {
        foreground: "#871094",
        fontStyle: "italic",
      },
    },
    {
      name: "Parameter",
      scope: ["variable.parameter"],
      settings: {
        foreground: "#080808",
      },
    },
    {
      name: "Language Variable",
      scope: ["variable.language.this", "variable.language.super"],
      settings: {
        foreground: "#0033b3",
      },
    },
    {
      name: "Punctuation",
      scope: ["punctuation.separator", "punctuation.terminator", "punctuation.accessor"],
      settings: {
        foreground: "#080808",
      },
    },
    {
      name: "Brackets",
      scope: ["punctuation.section", "meta.brace"],
      settings: {
        foreground: "#080808",
      },
    },
    {
      name: "Tag",
      scope: ["entity.name.tag"],
      settings: {
        foreground: "#000080",
      },
    },
    {
      name: "Tag Attribute",
      scope: ["entity.other.attribute-name"],
      settings: {
        foreground: "#174ad4",
      },
    },
    {
      name: "Decorator/Annotation",
      scope: ["meta.decorator", "punctuation.decorator", "storage.type.annotation"],
      settings: {
        foreground: "#9e880d",
      },
    },
    {
      name: "CSS Class",
      scope: ["entity.other.attribute-name.class.css"],
      settings: {
        foreground: "#174ad4",
      },
    },
    {
      name: "CSS Property",
      scope: ["support.type.property-name.css"],
      settings: {
        foreground: "#080808",
      },
    },
    {
      name: "CSS Important",
      scope: ["keyword.other.important.css"],
      settings: {
        foreground: "#0033b3",
        fontStyle: "bold",
      },
    },
    {
      name: "JSON Key",
      scope: ["support.type.property-name.json"],
      settings: {
        foreground: "#000083080",
      },
    },
    {
      name: "Markdown Heading",
      scope: ["markup.heading", "entity.name.section.markdown"],
      settings: {
        foreground: "#0033b3",
        fontStyle: "bold",
      },
    },
    {
      name: "Markdown Code",
      scope: ["markup.inline.raw", "markup.fenced_code.block"],
      settings: {
        foreground: "#067d17",
      },
    },
    {
      name: "Markdown Link",
      scope: ["markup.underline.link"],
      settings: {
        foreground: "#006dcc",
      },
    },
    {
      name: "RegExp",
      scope: ["string.regexp"],
      settings: {
        foreground: "#264eff",
      },
    },
    {
      name: "YAML Key",
      scope: ["entity.name.tag.yaml"],
      settings: {
        foreground: "#0033b3",
      },
    },
    {
      name: "Python Decorator",
      scope: ["meta.function.decorator.python", "entity.name.function.decorator.python"],
      settings: {
        foreground: "#9e880d",
      },
    },
    {
      name: "Rust Lifetime",
      scope: ["storage.modifier.lifetime.rust", "entity.name.type.lifetime.rust"],
      settings: {
        foreground: "#007ebd",
      },
    },
    {
      name: "JSX Tag",
      scope: ["support.class.component.jsx", "support.class.component.tsx"],
      settings: {
        foreground: "#ad6339",
      },
    },
    {
      name: "Diff Inserted",
      scope: ["markup.inserted"],
      settings: {
        foreground: "#067d17",
      },
    },
    {
      name: "Diff Deleted",
      scope: ["markup.deleted"],
      settings: {
        foreground: "#de1b2e",
      },
    },
    {
      name: "Error",
      scope: ["invalid.illegal"],
      settings: {
        foreground: "#f50000",
      },
    },
    {
      name: "TODO",
      scope: ["keyword.codetag"],
      settings: {
        foreground: "#008dde",
        fontStyle: "italic",
      },
    },
  ],
};
