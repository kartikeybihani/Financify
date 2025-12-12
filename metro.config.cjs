const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Configure Fast Refresh to handle style files better
config.transformer = {
  ...config.transformer,
  // Enable Fast Refresh for all files
  unstable_allowRequireContext: true,
};

module.exports = config;
