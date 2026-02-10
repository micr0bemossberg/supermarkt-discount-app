module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Transform import.meta.env.X to process.env.X for web compatibility
      function transformImportMeta() {
        return {
          visitor: {
            MetaProperty(path) {
              // Transform import.meta.env.MODE -> process.env.NODE_ENV
              // Transform import.meta.env -> process.env
              const { parent } = path;
              if (
                parent.type === 'MemberExpression' &&
                parent.property.name === 'env'
              ) {
                path.replaceWithSourceString('process');
              }
            },
          },
        };
      },
      [
        'module-resolver',
        {
          root: ['./src'],
          alias: {
            '@': './src',
            '@shared': '../shared/src'
          },
          extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json']
        }
      ],
      'react-native-paper/babel'
    ]
  };
};
