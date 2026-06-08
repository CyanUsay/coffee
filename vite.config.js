import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// 把整个 app 打包成一个自包含的 index.html，方便部署到任意静态托管或直接分享。
// target 设低一点，兼顾老一些的设备/浏览器。
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { target: "es2019" },
});
