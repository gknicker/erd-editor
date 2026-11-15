type Brand = { brand: string };

type UserAgentData = {
  brands?: ReadonlyArray<Brand>;
  /** What early Chromium named brands. */
  uaList?: ReadonlyArray<Brand>;
  platform?: string;
};

const WINDOWS = /win32|windows/;
const APPLE = /iphone|ipad|ipod|macos|macintel|mac os x/;

/**
 * Whether a lower-cased platform or user agent names an Apple system. The
 * first system named decides, so the Windows names, listed ahead of Apple's in
 * @egjs/agent's presets, which this reproduces, rule an Apple one out.
 */
const namesApple = (text: string) => !WINDOWS.test(text) && APPLE.test(text);

/**
 * What @egjs/agent reported as mac or ios, without it: the client hints platform
 * where there are brands, else the user agent. Both are synchronous, in workers
 * too, so this gives at once what its getAccurateAgent refined to later.
 */
function detectAppleDevice(): boolean {
  if (typeof navigator === 'undefined' || !navigator) return false;

  const data = (navigator as Navigator & { userAgentData?: UserAgentData })
    .userAgentData;
  const hinted = data?.brands ?? data?.uaList;
  if (!data || !hinted?.length) {
    return namesApple((navigator.userAgent || '').toLowerCase());
  }

  // Any AppleWebKit brand made the agent call the host mac or ios, whatever
  // the platform said and whether or not a Chromium brand stood beside it.
  const brands = data.uaList ?? data.brands ?? [];
  if (brands.some(({ brand }) => brand.toLowerCase().includes('applewebkit'))) {
    return true;
  }

  return namesApple((data.platform || navigator.platform || '').toLowerCase());
}

let appleDevice: boolean | undefined;

/**
 * Whether the command key stands in for control here. Read on first use and
 * kept, so importing this does no work in a realm that never asks.
 */
export const hasAppleDevice = (): boolean =>
  (appleDevice ??= detectAppleDevice());
