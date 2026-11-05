import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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


function replaceOnce(filePath, before, after, label) {
  const source = readFileSync(filePath, "utf8");
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error("Could not apply Crossy Road integration patch: " + label);
  writeFileSync(filePath, source.replace(before, after));
}

const providerPath = join(sourceDir, "src/context/GameProvider.tsx");
replaceOnce(
  providerPath,
  'const defaultState = { character: "chicken", highscore: 0 };',
  'const defaultState = { character: "chicken", highscore: 0, coins: 0 };',
  "provider defaults"
);
replaceOnce(
  providerPath,
  '  const [highscore, setHighscore] = React.useState(defaultState.highscore);',
  '  const [highscore, setHighscore] = React.useState(defaultState.highscore);\n  const [coins, setCoins] = React.useState(defaultState.coins);',
  "provider coin state"
);
replaceOnce(
  providerPath,
  '        const { character, highscore } = await rehydrateAsync();',
  '        const { character, highscore, coins } = await rehydrateAsync();',
  "provider hydration"
);
replaceOnce(
  providerPath,
  '        setHighscore(highscore);',
  '        setHighscore(highscore);\n        setCoins(Number(coins) || 0);',
  "provider hydrated coins"
);
replaceOnce(
  providerPath,
  '    parseModulesAsync();\n  }, []);',
  '    parseModulesAsync();\n    const onParentMessage = (event) => {\n      const data = event?.data;\n      if (data?.type === "yousound-crossy-road:account-update") {\n        setCoins(Math.max(0, Number(data.coins) || 0));\n        setHighscore(Math.max(0, Number(data.highScore) || 0));\n      }\n    };\n    if (typeof window !== "undefined") window.addEventListener("message", onParentMessage);\n    return () => { if (typeof window !== "undefined") window.removeEventListener("message", onParentMessage); };\n  }, []);',
  "parent account message listener"
);
replaceOnce(
  providerPath,
  '        highscore,\n        setHighscore: (highscore) => {',
  '        highscore,\n        coins,\n        setCoins: (coins) => {\n          setCoins(Math.max(0, Number(coins) || 0));\n        },\n        setHighscore: (highscore) => {',
  "provider context value"
);

const contextPath = join(sourceDir, "src/context/GameContext.ts");
replaceOnce(
  contextPath,
  '  highscore: 0,\n  setHighscore() {},',
  '  highscore: 0,\n  setHighscore() {},\n  coins: 0,\n  setCoins() {},',
  "game context defaults"
);

const audioPath = join(sourceDir, "src/AudioManager.ts");
replaceOnce(
  audioPath,
  'const MUTED = process.env.EXPO_OS === "web";',
  'const MUTED = false;',
  "enable browser game audio"
);

replaceOnce(
  join(sourceDir, "src/app/index.tsx"),
  '            web: { position: "fixed" },',
  '            web: { position: "absolute" },',
  "keep game inside YouSound panel"
);

const gameScreenPath = join(sourceDir, "src/app/index.tsx");
replaceOnce(
  gameScreenPath,
  '    this.engine.onGameInit = () => {\n      this.setState({ score: 0 });\n    };',
  '    this.engine.onGameInit = () => {\n      if (typeof window !== "undefined" && window.parent && window.parent !== window) {\n        window.parent.postMessage({ type: "yousound-crossy-road:run-started" }, "*");\n      }\n      this.setState({ score: 0 });\n    };',
  "game-start event"
);
replaceOnce(
  gameScreenPath,
  '  async componentDidMount() {',
  '  async componentDidMount() {\n    window.addEventListener("yousound-crossy-road:unmount", this.onCrossyUnmount);',
  "game unmount listener"
);
replaceOnce(
  gameScreenPath,
  '  componentWillUnmount() {\n    cancelAnimationFrame(this.engine.raf);',
  '  componentWillUnmount() {\n    window.removeEventListener("yousound-crossy-road:unmount", this.onCrossyUnmount);\n    cancelAnimationFrame(this.engine.raf);',
  "game unmount cleanup"
);
replaceOnce(
  gameScreenPath,
  '  componentWillUnmount() {',
  '  onCrossyUnmount = () => {\n    cancelAnimationFrame(this.engine.raf);\n  };\n\n  componentWillUnmount() {',
  "game unmount handler"
);

replaceOnce(
  gameScreenPath,
  '    this.engine.onGameEnded = () => {\n      this.setState({ gameState: State.Game.gameOver });',
  '    this.engine.onGameEnded = () => {\n      if (typeof window !== "undefined" && window.parent && window.parent !== window) {\n        window.parent.postMessage({ type: "yousound-crossy-road:run-finished", score: this.state.score }, "*");\n      }\n      this.setState({ gameState: State.Game.gameOver });',
  "game-over score event"
);
replaceOnce(
  gameScreenPath,
  '        <HomeScreen\n          onPlay={() => {',
  '        <HomeScreen\n          coins={this.props.coins}\n          onPlay={() => {',
  "home screen coin display"
);
replaceOnce(
  gameScreenPath,
  '  const { character, setCharacter } = React.useContext(GameContext);',
  '  const { character, setCharacter, coins } = React.useContext(GameContext);',
  "game screen coin context"
);
replaceOnce(
  gameScreenPath,
  '      character={character}\n      setCharacter={setCharacter}',
  '      character={character}\n      setCharacter={setCharacter}\n      coins={coins}',
  "game component coin prop"
);

console.log("Installing game dependencies...");
run("npm", ["install", "--no-audit", "--no-fund", "--legacy-peer-deps"], sourceDir);

console.log("Building the browser version...");
run("npx", ["expo", "export", "-p", "web", "--output-dir", "dist"], sourceDir);


console.log("Preparing the Crossy Road app for direct in-page mounting...");
const htmlPath = join(outputDir, "index.html");
let html = readFileSync(htmlPath, "utf8");
if (!html.includes('id="root"')) throw new Error("Expected Expo root element was not found.");
html = html.replace('id="root"', 'id="yousound-crossy-road-root"');
writeFileSync(htmlPath, html);

function patchBundleFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      patchBundleFiles(filePath);
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      let source = readFileSync(filePath, "utf8");
      source = source
        .replaceAll('getElementById("root")', 'getElementById("yousound-crossy-road-root")')
        .replaceAll("getElementById('root')", 'getElementById("yousound-crossy-road-root")');
      writeFileSync(filePath, source);
    }
  }
}
patchBundleFiles(outputDir);

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
