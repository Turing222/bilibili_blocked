import globals from "globals";
import js from "@eslint/js";

export default [
    js.configs.recommended,
    {
        files: ["src/**/*.js"],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.es2021,
                GM_setValue: "readonly",
                GM_getValue: "readonly",
                GM_addStyle: "readonly",
                GM_registerMenuCommand: "readonly"
            }
        },
        rules: {
            "no-unused-vars": "warn",
            "no-undef": "error"
        }
    },
    {
        files: ["tests/**/*.js"],
        languageOptions: {
            globals: {
                ...globals.node,
                document: "readonly",
                window: "readonly"
            }
        },
        rules: {
            "no-unused-vars": "warn",
            "no-undef": "error"
        }
    },
    {
        files: ["scripts/lib/harness.js", "scripts/lib/browser-harness.js"],
        languageOptions: {
            globals: {
                ...globals.node
            }
        },
        rules: {
            "no-unused-vars": "warn",
            "no-undef": "error"
        }
    },
    {
        files: ["scripts/lib/bilibili-dom.js", "scripts/lib/userscript-runtime.js"],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.es2021
            }
        },
        rules: {
            "no-unused-vars": "warn",
            "no-undef": "error"
        }
    }
];
