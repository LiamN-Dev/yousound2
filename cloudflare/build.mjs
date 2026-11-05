import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const sourceUrl = "https://github.com/EvanBacon/Expo-Crossy-Road.git";
const workDir = join(tmpdir(), "yousound-crossy-road-build");
const sourceDir = join(workDir, "source");
const outputDir = join(sourceDir, "dist");
const targetDir = resolve("game-assets/crossy-road");

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

rmSync(workDir, { recursive: true, force: true });
mkdirSync(workDir, { recursive: true });

console.log("Cloning the authorized Crossy Road source...");
run("git", ["clone", "--depth", "1", sourceUrl, sourceDir], workDir);

const appConfigPath = join(sourceDir, "app.json");
const appConfig = JSON.parse(readFileSync(appConfigPath, "utf8"));
appConfig.expo = appConfig.expo || {};
appConfig.expo.experiments = {
  ...(appConfig.expo.experiments || {}),
  baseUrl: "/crossy-road",
};
writeFileSync(appConfigPath, JSON.stringify(appConfig, null, 2) + "\n");

console.log("Installing game dependencies...");
run("npm", ["install", "--no-audit", "--no-fund", "--legacy-peer-deps"], sourceDir);

console.log("Building the browser version...");
run("npx", ["expo", "export", "-p", "web", "--output-dir", "dist"], sourceDir);

if (!existsSync(join(outputDir, "index.html"))) {
  throw new Error("Expo export did not produce dist/index.html; refusing to deploy an incomplete game.");
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(targetDir, { recursive: true });
cpSync(outputDir, targetDir, { recursive: true });

const licensePath = join(sourceDir, "LICENSE");
if (existsSync(licensePath)) {
  cpSync(licensePath, join(targetDir, "SOURCE-LICENSE"));
}

writeFileSync(
  join(targetDir, "SOURCE-INFO.txt"),
  "Crossy Road browser game source: https://github.com/EvanBacon/Expo-Crossy-Road\n" +
    "The source project is licensed under MIT. Its README also contains a third-party trademark/copyright disclaimer.\n" +
    "Built for YouSound2 and hosted from the YouSound Cloudflare asset worker.\n"
);

console.log("Crossy Road build copied to cloudflare/game-assets/crossy-road.");
