module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // Worklets plugin includes reanimated functionality
      "react-native-worklets/plugin",
    ],
  };
};
