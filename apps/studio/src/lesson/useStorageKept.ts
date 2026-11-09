/**
 * Whether the browser agreed to keep pupils' films (S8's `storagePersistent`, #272): `null` until
 * it answers, which in Firefox waits for the person to answer its own prompt. Nothing waits on
 * it: pages draw at once, and add the warning (`save.mayClear`) when it answers `false`.
 */
import type { HostInterface } from '@storystage/host';
import { useEffect, useState } from 'react';

export function useStorageKept(host: HostInterface): boolean | null {
  const [kept, setKept] = useState<boolean | null>(null);
  useEffect(() => {
    let gone = false;
    host.storagePersistent().then(
      (answer) => {
        if (!gone) setKept(answer);
      },
      () => {
        // Not knowing is not a warning: the store keeps working either way.
      },
    );
    return () => {
      gone = true;
    };
  }, [host]);
  return kept;
}
