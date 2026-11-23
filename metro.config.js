// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// expo-sqlite on web loads a .wasm file. Its COOP/COEP headers are only needed for the sync API, which the app doesn't use.
config.resolver.assetExts.push('wasm');

module.exports = config;
