import HtmlWebpackPlugin from 'html-webpack-plugin';

// No devtool of its own: webpack's development default, `eval`, gives the page no source maps.
export default {
  mode: 'development',
  entry: './src/main.tsx',
  ...(process.env.DEVTOOL ? { devtool: process.env.DEVTOOL } : {}),
  resolve: { extensions: ['.tsx', '.ts', '.js'] },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: { presets: [['@babel/preset-react', { runtime: 'automatic', development: true }], '@babel/preset-typescript'] },
        },
      },
    ],
  },
  plugins: [new HtmlWebpackPlugin({ templateContent: '<!doctype html><html><body><div id="root"></div></body></html>' })],
  devServer: { port: Number(process.env.FIXTURE_PORT ?? 5397), hot: true, client: { overlay: false } },
};
