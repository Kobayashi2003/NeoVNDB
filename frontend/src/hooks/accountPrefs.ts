/** Preferences that follow the reader between devices. The cookie still
 *  renders every page (lib/prefs.ts); the account is where a device signing in
 *  finds what the reader chose elsewhere.
 *
 *  On signing in, or on a page load already signed in, the account's copy wins:
 *  a second device takes on the first one's choices. An account with none yet
 *  is given this device's. From then on every change is sent, the last device
 *  to change something setting it for all. A device that comes back to a
 *  changed account re-renders with it once, on its first page. */

import { prefsFrom } from '@/lib/prefs';
import { accountPrefs, saveAccountPrefs } from '@/lib/user';
import { adoptPrefs, currentPrefs, keepPrefsWith } from './usePrefs';

/** Which session the link belongs to, so a late answer for one that has
 *  ended does not link the next. */
let generation = 0;

export function linkPrefs(signedIn: boolean): void {
  const mine = ++generation;
  keepPrefsWith(null);
  if (!signedIn) return;

  accountPrefs().then(
    saved => {
      if (mine !== generation) return;
      if (saved === null) void saveAccountPrefs(currentPrefs()).catch(() => {});
      else adoptPrefs(prefsFrom(saved));
      // In order, one at a time: two quick changes must not land swapped.
      let queue = Promise.resolve();
      keepPrefsWith(prefs => {
        queue = queue.then(() => saveAccountPrefs(prefs).catch(() => {}));
      });
    },
    // Unreachable: this device stays as it is and sends nothing, rather than
    // overwrite choices it never saw.
    () => {},
  );
}
