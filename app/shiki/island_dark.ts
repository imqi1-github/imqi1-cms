export default {
  "name": "Islands Dark",
  "type": "dark",
  "colors": {
    "editor.background": "#191a1c",
    "editor.foreground": "#bcbec4"
  },
  "tokenColors": [
    {
      "name": "Comment",
      "scope": [
        "comment",
        "comment.block",
        "comment.line"
      ],
      "settings": {
        "foreground": "#7a7e85"
      }
    },
    {
      "name": "Doc Comment",
      "scope": [
        "comment.block.documentation"
      ],
      "settings": {
        "foreground": "#5f826b",
        "fontStyle": "italic"
      }
    },
    {
      "name": "Doc Comment Tag",
      "scope": [
        "storage.type.class.jsdoc",
        "entity.name.type.instance.jsdoc"
      ],
      "settings": {
        "foreground": "#67a37c"
      }
    },
    {
      "name": "String",
      "scope": [
        "string",
        "string.quoted",
        "string.template"
      ],
      "settings": {
        "foreground": "#6aab73"
      }
    },
    {
      "name": "String Escape",
      "scope": [
        "constant.character.escape",
        "constant.other.placeholder"
      ],
      "settings": {
        "foreground": "#cf8e6d"
      }
    },
    {
      "name": "Number",
      "scope": [
        "constant.numeric",
        "constant.language.numeric"
      ],
      "settings": {
        "foreground": "#2aacb8"
      }
    },
    {
      "name": "Boolean",
      "scope": [
        "constant.language.boolean"
      ],
      "settings": {
        "foreground": "#cf8e6d"
      }
    },
    {
      "name": "Null",
      "scope": [
        "constant.language.null",
        "constant.language.undefined"
      ],
      "settings": {
        "foreground": "#cf8e6d"
      }
    },
    {
      "name": "Keyword",
      "scope": [
        "keyword",
        "keyword.control",
        "keyword.operator.new",
        "keyword.operator.expression",
        "keyword.other"
      ],
      "settings": {
        "foreground": "#cf8e6d"
      }
    },
    {
      "name": "Operator",
      "scope": [
        "keyword.operator",
        "keyword.operator.arithmetic",
        "keyword.operator.assignment",
        "keyword.operator.comparison",
        "keyword.operator.logical"
      ],
      "settings": {
        "foreground": "#bcbec4"
      }
    },
    {
      "name": "Storage Type",
      "scope": [
        "storage.type",
        "storage.modifier"
      ],
      "settings": {
        "foreground": "#cf8e6d"
      }
    },
    {
      "name": "Function",
      "scope": [
        "entity.name.function",
        "support.function"
      ],
      "settings": {
        "foreground": "#56a8f5"
      }
    },
    {
      "name": "Method",
      "scope": [
        "entity.name.function.member"
      ],
      "settings": {
        "foreground": "#57aaf7"
      }
    },
    {
      "name": "Static Method",
      "scope": [
        "entity.name.function.member.static"
      ],
      "settings": {
        "foreground": "#57aaf7",
        "fontStyle": "italic"
      }
    },
    {
      "name": "Class",
      "scope": [
        "entity.name.type.class",
        "entity.name.class",
        "support.class"
      ],
      "settings": {
        "foreground": "#bcbec4"
      }
    },
    {
      "name": "Type",
      "scope": [
        "entity.name.type",
        "support.type"
      ],
      "settings": {
        "foreground": "#bcbec4"
      }
    },
    {
      "name": "Type Parameter",
      "scope": [
        "entity.name.type.parameter"
      ],
      "settings": {
        "foreground": "#16baac"
      }
    },
    {
      "name": "Interface",
      "scope": [
        "entity.name.type.interface"
      ],
      "settings": {
        "foreground": "#16baac"
      }
    },
    {
      "name": "Variable",
      "scope": [
        "variable",
        "variable.other.readwrite",
        "variable.other.object"
      ],
      "settings": {
        "foreground": "#bcbec4"
      }
    },
    {
      "name": "Constant Variable",
      "scope": [
        "variable.other.constant",
        "constant.other"
      ],
      "settings": {
        "foreground": "#c77dbb",
        "fontStyle": "italic"
      }
    },
    {
      "name": "Property",
      "scope": [
        "variable.other.property",
        "support.variable.property"
      ],
      "settings": {
        "foreground": "#c77dbb"
      }
    },
    {
      "name": "Static Property",
      "scope": [
        "variable.other.property.static"
      ],
      "settings": {
        "foreground": "#c77dbb",
        "fontStyle": "italic"
      }
    },
    {
      "name": "Parameter",
      "scope": [
        "variable.parameter"
      ],
      "settings": {
        "foreground": "#bcbec4"
      }
    },
    {
      "name": "Language Variable",
      "scope": [
        "variable.language.this",
        "variable.language.super"
      ],
      "settings": {
        "foreground": "#cf8e6d"
      }
    },
    {
      "name": "Punctuation",
      "scope": [
        "punctuation.separator",
        "punctuation.terminator",
        "punctuation.accessor"
      ],
      "settings": {
        "foreground": "#bcbec4"
      }
    },
    {
      "name": "Brackets",
      "scope": [
        "punctuation.section",
        "meta.brace"
      ],
      "settings": {
        "foreground": "#bcbec4"
      }
    },
    {
      "name": "Tag",
      "scope": [
        "entity.name.tag"
      ],
      "settings": {
        "foreground": "#d5b778"
      }
    },
    {
      "name": "Tag Attribute",
      "scope": [
        "entity.other.attribute-name"
      ],
      "settings": {
        "foreground": "#bcbec4"
      }
    },
    {
      "name": "Decorator/Annotation",
      "scope": [
        "meta.decorator",
        "punctuation.decorator",
        "storage.type.annotation"
      ],
      "settings": {
        "foreground": "#b3ae60"
      }
    },
    {
      "name": "CSS Class",
      "scope": [
        "entity.other.attribute-name.class.css"
      ],
      "settings": {
        "foreground": "#56a8f5"
      }
    },
    {
      "name": "CSS Property",
      "scope": [
        "support.type.property-name.css"
      ],
      "settings": {
        "foreground": "#bcbec4"
      }
    },
    {
      "name": "CSS Important",
      "scope": [
        "keyword.other.important.css"
      ],
      "settings": {
        "foreground": "#cf8e6d",
        "fontStyle": "bold"
      }
    },
    {
      "name": "JSON Key",
      "scope": [
        "support.type.property-name.json"
      ],
      "settings": {
        "foreground": "#c77dbb"
      }
    },
    {
      "name": "Markdown Heading",
      "scope": [
        "markup.heading",
        "entity.name.section.markdown"
      ],
      "settings": {
        "foreground": "#56a8f5",
        "fontStyle": "bold"
      }
    },
    {
      "name": "Markdown Code",
      "scope": [
        "markup.inline.raw",
        "markup.fenced_code.block"
      ],
      "settings": {
        "foreground": "#6aab73"
      }
    },
    {
      "name": "Markdown Link",
      "scope": [
        "markup.underline.link"
      ],
      "settings": {
        "foreground": "#56a8f5"
      }
    },
    {
      "name": "RegExp",
      "scope": [
        "string.regexp"
      ],
      "settings": {
        "foreground": "#42c3d4"
      }
    },
    {
      "name": "YAML Key",
      "scope": [
        "entity.name.tag.yaml"
      ],
      "settings": {
        "foreground": "#cf8e6d"
      }
    },
    {
      "name": "Python Decorator",
      "scope": [
        "meta.function.decorator.python",
        "entity.name.function.decorator.python"
      ],
      "settings": {
        "foreground": "#b3ae60"
      }
    },
    {
      "name": "Rust Lifetime",
      "scope": [
        "storage.modifier.lifetime.rust",
        "entity.name.type.lifetime.rust"
      ],
      "settings": {
        "foreground": "#32b8af"
      }
    },
    {
      "name": "JSX Tag",
      "scope": [
        "support.class.component.jsx",
        "support.class.component.tsx"
      ],
      "settings": {
        "foreground": "#2fbaa3"
      }
    },
    {
      "name": "Diff Inserted",
      "scope": [
        "markup.inserted"
      ],
      "settings": {
        "foreground": "#6aab73"
      }
    },
    {
      "scope": [
        "markup.deleted",
        "meta.diff.header.from-file",
        "punctuation.definition.deleted"
      ],
      "settings": {
        "background": "#490202",
        "foreground": "#ffa198"
      }
    },
    {
      "name": "Error",
      "scope": [
        "invalid.illegal"
      ],
      "settings": {
        "foreground": "#f75464"
      }
    },
    {
      "name": "TODO",
      "scope": [
        "keyword.codetag"
      ],
      "settings": {
        "foreground": "#8bb33d",
        "fontStyle": "italic"
      }
    }
  ]
}