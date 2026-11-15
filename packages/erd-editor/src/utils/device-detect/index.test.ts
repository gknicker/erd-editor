import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

const UA = {
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  macElectron:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.88.0 Chrome/118.0.5993.159 Electron/27.3.2 Safari/537.36',
  iPhone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  iPadDesktopMode:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  windowsPhone:
    'Mozilla/5.0 (Windows Phone 10.0; Android 6.0.1; Microsoft; Lumia 950) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0 Mobile Safari/537.36 Edge/15.15063',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36',
  linux:
    'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
};

const CHROMIUM_BRANDS = [
  { brand: 'Chromium', version: '124' },
  { brand: 'Google Chrome', version: '124' },
];

async function detect(navigator: object | undefined) {
  vi.stubGlobal('navigator', navigator);
  vi.resetModules();
  const { hasAppleDevice } = await import('@/utils/device-detect');
  return hasAppleDevice();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('hasAppleDevice from the user agent', () => {
  it.each([
    ['macOS Safari', UA.macSafari],
    ['an Electron host on macOS', UA.macElectron],
    ['an iPhone', UA.iPhone],
    ['an iPad asking for the desktop site', UA.iPadDesktopMode],
  ])('is true for %s', async (_, userAgent) => {
    expect(await detect({ userAgent })).toBe(true);
  });

  it.each([
    ['Windows', UA.windowsChrome],
    ['Android', UA.android],
    ['Linux', UA.linux],
    ['an empty user agent', ''],
  ])('is false for %s', async (_, userAgent) => {
    expect(await detect({ userAgent })).toBe(false);
  });

  it('lets the first system named decide, Windows before Apple', async () => {
    // Windows Phone names Android too, and a Windows name anywhere rules an
    // Apple one out, as the preset order @egjs/agent read with did.
    expect(await detect({ userAgent: UA.windowsPhone })).toBe(false);
    expect(await detect({ userAgent: 'windows nt 10.0; mac os x' })).toBe(
      false
    );
    expect(await detect({ userAgent: 'android 14; iphone' })).toBe(true);
  });

  it('is false where there is no navigator at all', async () => {
    expect(await detect(undefined)).toBe(false);
  });
});

describe('hasAppleDevice from client hints', () => {
  it('reads the hinted platform over the user agent', async () => {
    const macUa = { userAgent: UA.macSafari };
    expect(
      await detect({
        ...macUa,
        userAgentData: { brands: CHROMIUM_BRANDS, platform: 'Windows' },
      })
    ).toBe(false);
    expect(
      await detect({
        userAgent: UA.windowsChrome,
        userAgentData: { brands: CHROMIUM_BRANDS, platform: 'macOS' },
      })
    ).toBe(true);
  });

  it('falls back to navigator.platform when the hint leaves it empty', async () => {
    expect(
      await detect({
        userAgent: UA.windowsChrome,
        platform: 'MacIntel',
        userAgentData: { brands: CHROMIUM_BRANDS, platform: '' },
      })
    ).toBe(true);
  });

  it('answers false rather than throwing with no platform anywhere', async () => {
    // @egjs/agent threw here, at import; no browser leaves both empty.
    expect(
      await detect({
        userAgent: UA.macSafari,
        userAgentData: { brands: CHROMIUM_BRANDS, platform: '' },
      })
    ).toBe(false);
  });

  it('takes an AppleWebKit brand for an Apple host whatever the platform', async () => {
    expect(
      await detect({
        userAgent: UA.windowsChrome,
        userAgentData: {
          brands: [
            ...CHROMIUM_BRANDS,
            { brand: 'AppleWebKit', version: '605' },
          ],
          platform: 'Windows',
        },
      })
    ).toBe(true);
  });

  it('reads the early uaList like brands', async () => {
    expect(
      await detect({
        userAgent: UA.windowsChrome,
        userAgentData: { uaList: CHROMIUM_BRANDS, platform: 'macOS' },
      })
    ).toBe(true);
  });

  it('uses the user agent when the hints carry no brands', async () => {
    expect(
      await detect({
        userAgent: UA.macSafari,
        userAgentData: { brands: [], platform: 'Windows' },
      })
    ).toBe(true);
  });
});

describe('when it reads', () => {
  it('reads nothing on import, and once on first use', async () => {
    const userAgent = vi.fn(() => UA.macSafari);
    vi.stubGlobal('navigator', {
      get userAgent() {
        return userAgent();
      },
    });
    vi.resetModules();
    const { hasAppleDevice } = await import('@/utils/device-detect');

    expect(userAgent).not.toHaveBeenCalled();
    expect(hasAppleDevice()).toBe(true);
    expect(hasAppleDevice()).toBe(true);
    expect(userAgent).toHaveBeenCalledTimes(1);
  });
});
