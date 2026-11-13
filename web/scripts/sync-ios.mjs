import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(webRoot, "dist");
const dest = resolve(webRoot, "../ios/InvestmentNotebook/web");

if (!existsSync(dist)) {
  console.error("找不到 web/dist。請先執行 vite build。");
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(dist, dest, { recursive: true });
console.log("已複製網頁建置到", dest);
