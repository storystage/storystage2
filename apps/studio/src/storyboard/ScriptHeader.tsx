import type { Production } from '@storystage/production';
import { Segmented, TextField, messages } from '@storystage/ui';
import { hasWord, words } from '../strings.ts';
import { ARC_TEMPLATES, BUILT_IN_ARCS, isBuiltIn, type BuiltInArc } from './arc.ts';
import { LIMITS, planLength, setArc, setLogline, setSynopsis, setTitle } from './edits.ts';

export interface ScriptHeaderProps {
  production: Production;
  /** Records a change as an undo step; changes with the same `key` join one step while typing. */
  onChange: (label: string, next: Production, key?: string) => void;
  /** The learner left a field, so the next change is a new step. */
  onLeave: () => void;
}

/** "3 scenes · 1 min 12 s" */
function summary(p: Production): string {
  const { scenes, seconds } = planLength(p);
  const length =
    seconds >= 60
      ? words.t('storyboard.minutes', { minutes: Math.floor(seconds / 60), seconds: seconds % 60 })
      : words.t('storyboard.seconds', { seconds });
  return words.t('storyboard.summary', {
    scenes: messages.plural('count.scenes', scenes),
    length,
  });
}

/** An arc part's words: built-in parts have their own; a curriculum template's parts are shown as written. */
export function partName(part: string): string {
  const key = `storyboard.arc.part.${part}`;
  return hasWord(key) ? words.t(key) : part;
}

/**
 * The script header (Direction A screen 01; `07-ux.md` sections 6.2, 6.3): the title, logline and
 * synopsis, the plan's size, and the arc. The Prompter never writes these (rule 4).
 */
export function ScriptHeader({ production: p, onChange, onLeave }: ScriptHeaderProps) {
  const { arc } = p.storyboard;
  const arcId: BuiltInArc | null = isBuiltIn(arc.template) ? arc.template : null;
  return (
    <section className="sb-header" aria-labelledby="sb-header-title">
      <h2 id="sb-header-title" className="ss-visually-hidden">
        {words.t('storyboard.header')}
      </h2>
      <div className="sb-header-top">
        <div className="sb-title">
          <TextField
            label={words.t('storyboard.title')}
            hideLabel
            placeholder={words.t('storyboard.titlePlaceholder')}
            value={p.manifest.title}
            maxLength={LIMITS.title}
            onChange={(v) => onChange(words.t('step.title'), setTitle(p, v), 'title')}
            onBlur={onLeave}
          />
        </div>
        <span className="sb-pill">{summary(p)}</span>
      </div>
      <div className="sb-row">
        <TextField
          label={words.t('storyboard.logline')}
          placeholder={words.t('storyboard.loglinePlaceholder')}
          value={p.storyboard.logline}
          maxLength={LIMITS.logline}
          onChange={(v) => onChange(words.t('step.logline'), setLogline(p, v), 'logline')}
          onBlur={onLeave}
        />
      </div>
      <div className="sb-row">
        <TextField
          label={words.t('storyboard.synopsis')}
          placeholder={words.t('storyboard.synopsisPlaceholder')}
          multiline
          value={p.storyboard.synopsis}
          maxLength={LIMITS.synopsis}
          onChange={(v) => onChange(words.t('step.synopsis'), setSynopsis(p, v), 'synopsis')}
          onBlur={onLeave}
        />
      </div>
      <div className="sb-arc">
        <span className="sb-arc-label" aria-hidden="true">
          {words.t('storyboard.arc')}
        </span>
        {arcId !== null && (
          <Segmented
            label={words.t('storyboard.arc')}
            options={BUILT_IN_ARCS.map((id) => ({ id, label: words.t(`storyboard.arc.${id}`) }))}
            value={arcId}
            onChange={(id) => {
              const def = ARC_TEMPLATES.find((a) => a.template === id)!;
              onChange(
                words.t('step.arc', { arc: words.t(`storyboard.arc.${id}`) }),
                setArc(p, def),
              );
            }}
          />
        )}
        <span className="sb-arc-parts">
          {arc.parts.length === 0
            ? words.t('storyboard.arc.freeHint')
            : arc.parts.map(partName).join(' · ')}
        </span>
      </div>
    </section>
  );
}
