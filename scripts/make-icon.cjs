const fs = require('fs');
const path = require('path');
const pngToIcoModule = require('png-to-ico');
const pngToIco = pngToIcoModule.default || pngToIcoModule;
const assets = path.join(__dirname, '..', 'public', 'assets');
(async () => {
  const buffer = await pngToIco([
    path.join(assets, 'favicon-16.png'),
    path.join(assets, 'favicon-32.png'),
    path.join(assets, 'favicon-48.png'),
    path.join(assets, 'app-logo.png')
  ]);
  fs.writeFileSync(path.join(assets, 'app-logo.ico'), buffer);
})();
