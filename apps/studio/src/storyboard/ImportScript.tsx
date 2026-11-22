import {
  FOUNTAIN_LIMITS,
  type Production,
  type SceneId,
  type SceneStep,
} from '@storystage/production';
import { Button, messages } from '@storystage/ui';
import { useRef, useState } from 'react';
import { acceptFor } from '../fileInputs.ts';
import { words } from '../strings.ts';
import { canAddScene } from './edits.ts';
import { SCRIPT_FILE_TYPES, importScript, type ImportRefusal } from './scriptFile.ts';

export interface ImportScriptProps {
  production: Production;
  /** A film opened to look at: nothing is imported. */
  readOnly: boolean;
  /** The import, one undo step; `ok: false` with the session's reason if it refused it. */
  onStep: (step: SceneStep) => { ok: true } | { ok: false; reason: string };
  /** The first imported scene, to open it, and what to say. */
  onImported: (scene: SceneId, said: string) => void;
  /** Says why nothing was imported, to a screen reader as well. */
  onAnnounce: (said: string) => void;
}

/** Why a script wasn't imported, in the learner's words (07-ux section 6.9: "told why"). */
export function refusalWords(refusal: ImportRefusal): string {
  switch (refusal.code) {
    case 'tooBig':
      return words.t('storyboard.import.tooBig', { kb: Math.round(refusal.limit / 1024) });
    case 'tooManyScenes':
    case 'tooManyLines':
    case 'lineTooLong':
    case 'headingTooLong':
    case 'nameTooLong':
      return words.t(`storyboard.import.${refusal.code}`, { limit: refusal.limit });
    case 'refused':
      return refusal.reason || words.t('storyboard.import.failed');
    default:
      return words.t(`storyboard.import.${refusal.code}`);
  }
}

/**
 * Import a script (`07-ux.md` section 6.6; WP10.4): offered beside Add a scene while the production
 * has no scenes. The learner picks a Fountain or text file; each heading becomes a scene, with its
 * lines, as one undo step. A file over spec 03's limits isn't opened, and the learner is told why.
 */
export function ImportScript({
  production: p,
  readOnly,
  onStep,
  onImported,
  onAnnounce,
}: ImportScriptProps) {
  const input = useRef<HTMLInputElement>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const say = (text: string) => {
    setSaid(text);
    onAnnounce(text);
  };

  const open = async (file: File) => {
    // Too big, and it isn't read.
    if (file.size > FOUNTAIN_LIMITS.bytes)
      return say(refusalWords({ code: 'tooBig', limit: FOUNTAIN_LIMITS.bytes }));
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = importScript(p, bytes, words.t('step.importScript'));
      if (!result.ok) return say(refusalWords(result.refusal));
      const stepped = onStep(result.step);
      if (!stepped.ok) return say(stepped.reason || words.t('storyboard.import.failed'));
      // The button goes once there are scenes, so the Storyboard says it was done.
      onImported(
        result.step.production.manifest.runningOrder[0]!.scene,
        words.t('storyboard.import.done', {
          scenes: messages.plural('count.scenes', result.scenes),
          lines: words.plural('storyboard.import.lines', result.lines),
        }),
      );
    } catch {
      say(words.t('storyboard.import.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        icon="upload"
        isDisabled={busy || readOnly || !canAddScene(p.storyboard)}
        onPress={() => {
          setSaid(null);
          input.current?.click();
        }}
      >
        {words.t('storyboard.import')}
      </Button>
      <input
        ref={input}
        type="file"
        accept={acceptFor(SCRIPT_FILE_TYPES)}
        hidden
        aria-label={words.t('storyboard.import.file')}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (file) void open(file);
        }}
      />
      {said && <span className="sb-scene-add-why">{said}</span>}
    </>
  );
}
