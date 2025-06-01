const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add support for importing from node_modules
config.resolver.nodeModulesPaths = [__dirname];

// Add support for importing from the root directory
config.resolver.extraNodeModules = {
  '@': __dirname,
};

module.exports = config; 