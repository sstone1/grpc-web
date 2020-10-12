import { Builder } from 'selenium-webdriver';
import { corsHost, testHost } from "./hosts-config";

const username = process.env.SAUCELABS_USERNAME;
const accessKey = process.env.SAUCELABS_ACCESS_KEY;
const buildName = process.env.TRAVIS_BUILD_NUMBER ? `travis_${process.env.TRAVIS_BUILD_NUMBER}` : `local_${new Date().getTime()}`;
const sauceLabsTunnelWithSSLBumping = process.env.SAUCELABS_TUNNEL_ID_WITH_SSL_BUMP;
const sauceLabsTunnelNoSSLBumping = process.env.SAUCELABS_TUNNEL_ID_NO_SSL_BUMP;

const viaUrls = [
  // HTTP 1.1
  "https://" + testHost + ":9090",
  "https://" + testHost + ":9095",
  "https://" + corsHost + ":9090",
  "https://" + corsHost + ":9095",
  // HTTP 2
  "https://" + testHost + ":9100",
  "https://" + testHost + ":9105",
  "https://" + corsHost + ":9100",
  "https://" + corsHost + ":9105"
];

function CustomWebdriverBrowser(id, baseBrowserDecorator, args, logger) {
  baseBrowserDecorator(this);
  const self = this;

  self.name = args.configName;
  self.log = logger.create(`launcher.selenium-webdriver: ${self.name}`);
  self.captured = false;
  self.ended = false;
  self.id = id;
  const caps = args.capabilities;
  self._start = (testUrl) => {
    const testUrlWithSuite = `${testUrl}#${caps.disableWebsocketTests ? 'disableWebsocketTests' : ''}`;
    const tunnelIdentifier = caps.useSslBumping ? sauceLabsTunnelWithSSLBumping : sauceLabsTunnelNoSSLBumping;
    self.log.debug('Local Tunnel Connected. Now testing...');
    let browser = new Builder()
      .withCapabilities({
        ...(caps.custom || {}),
        'browserName': caps.browserName,
        'platform': caps.os,
        'version': caps.browserVersion,
        'build': buildName,
        'username': username,
        'accessKey': accessKey,
        'tunnelIdentifier': tunnelIdentifier,
        'recordScreenshots': false,
        'acceptSslCerts': true,
        'javascriptEnabled': true,
        'commandTimeout': 600,
        'idleTimeout': 600,
        'maxDuration': 600,
      })
      .usingServer("https://" + username + ":" + accessKey + "@ondemand.saucelabs.com:443/wd/hub")
      .build();

    console.log("Built webdriver");

    self.browser = browser;
    if (caps.certOverrideJSElement) {
      const next = (i) => {
        const via = viaUrls[i];
        if (!via) {
          console.log("Navigating to ", testUrlWithSuite);
          browser.get(testUrlWithSuite).then(() => {
            console.log("Did capture");
            self.captured = true;

            console.log("Attempting to bypass cert issue on final")
            browser.executeScript(`var el = document.getElementById('${caps.certOverrideJSElement}'); if (el) {el.click()}`);
            // This will wait on the page until the browser is killed
          });
        } else {
          browser.get(via).then(() => {
            console.log("Attempting to bypass cert issue")
            browser.executeScript(`var el = document.getElementById('${caps.certOverrideJSElement}'); if (el) {el.click()}`).then(() => {
              setTimeout(() => {
                next(i + 1);
              }, 5000);
            });
          }).catch(err => {
            console.error("Failed to navigate via page", err);
          });
        }
      };
      next(0);
    } else {
      console.log("Navigating to ", testUrlWithSuite);
      browser.get(testUrlWithSuite).then(() => {
        console.log("Did capture");
        self.captured = true;
      });
    }
  };

  this.on('kill', function (done) {
    console.log("KarmaDriver.kill")
    self.ended = true;
    console.log("KarmaDriver.quit()")
    self.browser.quit().finally(() => {
      console.log("KarmaDriver.quit.finally")
      self._done();
      done();
    });
  });

  self.isCaptured = function () {
    return self.captured;
  };
}

export default {
  'launcher:CustomWebDriver': ['type', CustomWebdriverBrowser]
};
