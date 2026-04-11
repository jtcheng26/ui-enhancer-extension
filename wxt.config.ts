import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

function disableZodEvalPlugin() {
  return {
    name: "disable-zod-eval",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      if (!id.includes("/node_modules/zod/v4/core/util")) return null;
      if (!code.includes('new F("")')) return null;

      return {
        code: code.replace(
          /try\s*\{\s*const F = Function;\s*new F\(""\);\s*return true;\s*\}\s*catch\s*\(_\)\s*\{\s*return false;\s*\}/g,
          "return false;",
        ),
        map: null,
      };
    },
  };
}

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "AI UI Augmentation Prototype",
    description:
      "Starter architecture for an experimental AI-powered UI augmentation platform.",
    permissions: ["storage", "activeTab", "scripting"],
    host_permissions: ["<all_urls>"],
    action: {
      default_title: "AI UI Augmentation",
    },
  },
  vite: () => ({
    plugins: [tailwindcss(), disableZodEvalPlugin()],
  }),
});
