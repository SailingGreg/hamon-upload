const path = require("path");

module.exports = {
  entry: "./src/frontend/index.jsx",
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: ["babel-loader"],
      },
      {
        test: /\.css$/,
        use: [
          "style-loader",
          {
            loader: "css-loader",
            options: {
              importLoaders: 1,
              modules: true,
            },
          },
        ],
      },
    ],
  },
  resolve: {
    extensions: [".*", ".js", ".jsx"],
  },
  optimization: {
    minimize: false,
  },
  output: {
    filename: "main.js",
    path: path.resolve(__dirname, "dist/static/scripts"),
  },
  cache: false,
};
