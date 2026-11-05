const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");
const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "../..");
const config = getDefaultConfig(projectRoot);
config.watchFolders = [path.join(repoRoot, "src/lib")];
config.resolver.nodeModulesPaths = [path.join(projectRoot, "node_modules")];
// Preserve nested Expo dependency resolution; shared files import no third-party runtime modules.
// A native bundle must never import a server module, even accidentally.
config.resolver.blockList = [
  /[/\\][^/\\]+\.server\.[cm]?[jt]sx?$/,
  /[/\\]supabase[/\\]migrations[/\\]/,
];
module.exports = config;
