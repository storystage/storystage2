/**
 * Talk to type in the studio (`docs/spec/06-speech.md` section 1): the learner's setting, the
 * studio's one take for every field (`Takes`), and the hook a field asks for its mic with. A
 * field's mic shows only where the host allows dictation (`host.speech`), the page is
 * cross-origin isolated, and Talk to type is on (section 1.1). S7's speech code loads only then.
 */
import type { HostInterface } from '@storystage/host';
import type { Dictation } from '@storystage/speech';
import { Toggle, type FieldSpeech } from '@storystage/ui';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { words } from '../strings.ts';
import { Takes } from './takes.ts';

const KEY = 'storystage.talkToType';

/** The learner's Talk to type setting, on this device. Off until they turn it on. */
export const talkToTypeSetting = (() => {
  const listeners = new Set<() => void>();
  const read = () => {
    try {
      return window.localStorage.getItem(KEY) === 'on';
    } catch {
      return false;
    }
  };
  return {
    get: read,
    set(on: boolean) {
      try {
        if (on) window.localStorage.setItem(KEY, 'on');
        else window.localStorage.removeItem(KEY);
      } catch {
        // Storage refused: the setting lasts until the page closes.
      }
      for (const l of [...listeners]) l();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
})();

export function useTalkToTypeSetting(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(talkToTypeSetting.subscribe, talkToTypeSetting.get, () => false);
  return [on, talkToTypeSetting.set];
}

/** Whether this device can offer Talk to type at all: the host allows it and whisper can run. */
export function talkToTypeAvailable(host: HostInterface): boolean {
  return host.speech !== null && globalThis.crossOriginIsolated === true;
}

/** The address of whisper.cpp's `whisper.js`, which the app serves itself (spec 06 section 1.11). */
export const WHISPER_SCRIPT = `${import.meta.env.BASE_URL}speech/whisper.js`;

/** Makes the studio's one `Dictation`: S7's browser one, loaded on demand. Tests give a fake. */
export type DictationMaker = (host: HostInterface) => Promise<Dictation | null>;

const browserDictation: DictationMaker = async (host) => {
  const { createBrowserDictation } = await import('@storystage/speech');
  return createBrowserDictation(host.speech, { whisperScript: WHISPER_SCRIPT });
};

const TakesContext = createContext<Takes | null>(null);

/**
 * Talk to type for the fields inside: one take at a time across the studio. `seal` closes the
 * studio's open undo step, so dictated words are a step of their own.
 */
export function TalkToType({
  host,
  seal,
  makeDictation = browserDictation,
  children,
}: {
  host: HostInterface;
  seal: () => void;
  makeDictation?: DictationMaker;
  children: ReactNode;
}) {
  const [on] = useTalkToTypeSetting();
  const allowed = on && talkToTypeAvailable(host);
  const [takes, setTakes] = useState<Takes | null>(null);
  const sealing = useRef(seal);
  useEffect(() => {
    sealing.current = seal;
  });
  useEffect(() => {
    if (!allowed) return;
    let live = true;
    let made: Takes | null = null;
    makeDictation(host).then(
      (dictation) => {
        if (!live || !dictation) return;
        made = new Takes(dictation, () => sealing.current());
        setTakes(made);
      },
      (e: unknown) => console.error('Talk to type could not start.', e),
    );
    return () => {
      live = false;
      made?.dispose();
      setTakes(null);
    };
    // `makeDictation` lasts as long as the studio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, host]);
  return <TakesContext.Provider value={takes}>{children}</TakesContext.Provider>;
}

const NO_TAKES = () => () => {};

/** The mic for one field, named by `field` (unique in the studio), or nothing where it isn't offered. */
export function useFieldSpeech(field: string): FieldSpeech | undefined {
  const takes = useContext(TakesContext);
  useSyncExternalStore(takes ? (l) => takes.subscribe(l) : NO_TAKES, () => takes?.state ?? null);
  return takes ? takes.forField(field) : undefined;
}

/** Settings › Talk to type: on this device, for the learner. Only where it can be offered. */
export function TalkToTypeCard({ host }: { host: HostInterface }) {
  const [on, setOn] = useTalkToTypeSetting();
  if (!talkToTypeAvailable(host)) return null;
  return (
    <div className="st-page">
      <section className="st-card" aria-labelledby="st-talk-title">
        <h3 id="st-talk-title" className="st-card-title">
          {words.t('settings.talkToType')}
        </h3>
        <Toggle isSelected={on} onChange={setOn}>
          {words.t('settings.talkToType.switch')}
        </Toggle>
        <p className="st-note">{words.t('settings.talkToType.help')}</p>
      </section>
    </div>
  );
}
