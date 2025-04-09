const path = require('node:path');

module.exports = {
  // Main entry for your main process code
  entry: './src/main.js',
  output: {
    // Name the output file as index.js (the default for the main process)
    filename: 'index.js',
    path: path.resolve(__dirname, '.webpack', 'main'),
  },
  module: {
    rules: require('./webpack.rules'),
  },
};
