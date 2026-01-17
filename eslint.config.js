import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "build",
      "node_modules",
      ".turbo",
      "*.config.js",
      "tailwind.config.js",
      "netlify/functions/mcp-message.js",
      "netlify/functions/mcp-sse.js",
      "netlify/functions/mcp.js",
    ],
  },
  // Configuration for TypeScript and React files
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-namespace": "warn",
      "@typescript-eslint/no-unsafe-function-type": "warn",
      "@typescript-eslint/no-require-imports": "warn",
    },
  },
  // Configuration for ES6 Module JavaScript files
  {
    files: [
      "**/claude-mcp-wrapper.js",
      "**/cli-integration.js",
      "**/deploy/*.js",
      "**/external-mcp-client.js",
      "**/netlify/functions/mcp-message.js",
      "**/netlify/functions/mcp-sse.js",
      "**/netlify/functions/mcp.js",
      "**/services/enhanced-*.js",
      "**/services/websocket-*.js",
      "**/stdio-mcp-server.js",
      "**/store-mcp-gateway-feedback.js",
      "**/test-*.js",
      "**/unified-router.js",
      "vendor-auth-middleware.js",
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.node,
        ...globals.browser,
      },
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "prefer-const": "error",
    },
  },
  // Configuration for CommonJS JavaScript files (most other .js files)
  {
    files: [
      "netlify/functions/*.js",
      "server/*.js",
      "scripts/*.js",
      "services/api-gateway/**/*.js",
      "services/key-manager/**/*.js",
      "functions/*.js",
      "apps/**/*.js",
      "multi-platform-router.js",
      "ai-service-router.js",
      "vendor-auth-middleware.js",
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.node,
        ...globals.browser,
      },
      sourceType: "script",
    },
    rules: {
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "prefer-const": "error",
    },
  },
  // Override: some .js files in this package are ES modules even if they match the CommonJS globs
  {
    files: [
      "scripts/cli-integration.js",
      "scripts/external-mcp-client.js",
      "services/api-gateway/tests/**/*.js",
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.node,
        ...globals.browser,
      },
      sourceType: "module",
    },
  }
);
