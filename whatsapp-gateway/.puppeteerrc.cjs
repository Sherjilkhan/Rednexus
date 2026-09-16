const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Cache Chromium in the project folder so Render finds it
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
