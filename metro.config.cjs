const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Configure resolver for Node.js polyfills
config.resolver.alias = {
  ...config.resolver.alias,
  crypto: "crypto-browserify",
  stream: "readable-stream",
  buffer: "buffer",
  "crypto-browserify": "crypto-browserify",
  // Web Crypto API polyfills
  "react-native-webview-crypto": "react-native-webview-crypto",
  "react-native-quick-crypto": "react-native-quick-crypto",
};

// Add Node.js core modules to resolver platforms
config.resolver.platforms = ["native", "ios", "android", "web"];

// Configure transformer to handle Node.js modules
config.resolver.resolverMainFields = ["react-native", "browser", "main"];

// Enable unstable_allowRequireContext for better module resolution
config.transformer = {
  ...config.transformer,
  unstable_allowRequireContext: true,
};

// Configure metro to resolve Node.js core modules
config.resolver.nodeModulesPaths = [
  ...config.resolver.nodeModulesPaths,
  "./node_modules",
];

module.exports = config;
