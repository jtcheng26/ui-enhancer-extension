import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

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
    plugins: [tailwindcss()],
  }),
});
