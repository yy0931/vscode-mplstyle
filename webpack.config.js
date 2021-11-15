const path = require("path")
const TerserPlugin = require("terser-webpack-plugin")
const webpack = require("webpack")

/** @type {import("webpack").Configuration} */
module.exports = {
    mode: "production",
    target: 'webworker',
    entry: './src/extension.js',
    output: {
        path: path.resolve(__dirname, 'browser'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2',
    },
    devtool: 'source-map',
    externals: {
        vscode: 'commonjs vscode'
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    optimization: {
        minimizer: [new TerserPlugin({ extractComments: false })]
    },
    plugins: [
        new webpack.DefinePlugin({
            'process.env': {
                WEBPACKED: true,
            }
        }),
    ]
}
