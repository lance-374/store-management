const path = require('node:path');

module.exports = {
    // Preload entry for your preload script
    entry: './src/preload.js',
    output: {
        // Name the output file as preload.js
        filename: 'preload.js',
        // Output the preload bundle into the renderer folder
        path: path.resolve(__dirname, '.webpack', 'renderer')
    },
    module: {
        rules: require('./webpack.rules'),
    },
};
