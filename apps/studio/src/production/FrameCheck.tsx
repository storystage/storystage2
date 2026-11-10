/**
 * The current frame's automatic check on the Production stage (spec 08 sections 9.1, 9.5 and
 * 9.6; Direction A screen 08's card): Check this frame and Check this scene, the frame's
 * checklist in plain words, flags first, each item going to its block, sketch or line, and Keep
 * it on a flag. The words come from the film, so they're drawn as plain text only.
 */
import { ITEM_ORDER, checkState } from '@storystage/check';
import type { NodeId } from '@storystage/ast';
import type { CheckItem, Frame, Production } from '@storystage/production';
import { Button, Icon, type IconName } from '@storystage/ui';
import type { CheckRun } from '../check/useCheckRun.ts';
import { inProgram } from './frameProgress.ts';
import { words } from '../strings.ts';

const OUTCOME_ICON: Record<CheckItem['outcome'], IconName> = {
  flag: 'flag',
  note: 'info',
  passed: 'check_circle',
};

export interface FrameCheckProps {
  readonly production: Production;
  readonly frame: Frame;
  /** "2.3" */
  readonly number: string;
  readonly check: CheckRun;
  readonly readOnly: boolean;
  /** Opens the Code editor at the block. */
  onGoToBlock(node: NodeId): void;
  /** Shows the frame in the Storyboard, for a sketch or a script line. */
  onGoToStoryboard(): void;
}

export function FrameCheck({
  production: p,
  frame,
  number,
  check,
  readOnly,
  onGoToBlock,
  onGoToStoryboard,
}: FrameCheckProps) {
  const state = checkState(frame, p);
  const kept = new Set(frame.check?.kept ?? []);
  const items = [...(frame.check?.items ?? [])].sort(
    (a, b) => ITEM_ORDER.indexOf(a.outcome) - ITEM_ORDER.indexOf(b.outcome),
  );
  const running = check.running;
  const idle = running === null && !readOnly;
  const summary = !state
    ? words.t('production.check.none')
    : state.stale
      ? words.t('production.check.stale')
      : state.flags > 0
        ? words.plural('production.check.flags', state.flags)
        : words.t('production.check.matches');
  return (
    <section className="pr-check" aria-labelledby="pr-check-title">
      <h2 id="pr-check-title" className="pr-check-title">
        {words.t('production.check.title', { frame: number })}
      </h2>
      <div className="pr-check-actions">
        <Button
          variant="secondary"
          icon="check_circle"
          isDisabled={!idle}
          onPress={() => void check.run({ kind: 'frame', frame: frame.id })}
        >
          {words.t('production.check.frame')}
        </Button>
        <Button
          variant="quiet"
          isDisabled={!idle}
          onPress={() => void check.run({ kind: 'scene', scene: frame.scene })}
        >
          {words.t('production.check.scene')}
        </Button>
      </div>
      <p className="pr-check-summary" role="status">
        {running
          ? words.t('production.check.running', { done: running.done, total: running.total })
          : check.failed
            ? words.t('production.check.failed')
            : summary}
      </p>
      {items.length > 0 && (
        <ul className="pr-check-items" data-stale={state?.stale || undefined}>
          {items.map((item) => {
            const isKept = item.outcome === 'flag' && kept.has(item.id);
            return (
              <li
                key={item.id}
                className="pr-check-item"
                data-outcome={item.outcome}
                data-kept={isKept || undefined}
              >
                <Icon name={OUTCOME_ICON[item.outcome]} filled={item.outcome !== 'note'} />
                <span className="pr-check-words">{item.words}</span>
                {item.outcome !== 'passed' &&
                  (() => {
                    // A stale result may name what's since gone: it's just not linked (9.6).
                    const toBlock = item.node && inProgram(p, item.node) ? item.node : null;
                    const toSketch =
                      item.sketch && frame.sketches.some((s) => s.id === item.sketch);
                    const toLine = item.line && p.script.some((l) => l.id === item.line);
                    return (
                      <span className="pr-check-item-actions">
                        {toBlock && (
                          <Button
                            variant="quiet"
                            icon="extension"
                            aria-label={words.t('production.check.blockFor', { words: item.words })}
                            onPress={() => onGoToBlock(toBlock)}
                          >
                            {words.t('production.check.block')}
                          </Button>
                        )}
                        {(toSketch || toLine) && (
                          <Button
                            variant="quiet"
                            icon={toLine ? 'edit_note' : 'draw'}
                            aria-label={words.t(
                              toLine ? 'production.check.lineFor' : 'production.check.sketchFor',
                              { words: item.words },
                            )}
                            onPress={onGoToStoryboard}
                          >
                            {words.t(toLine ? 'production.check.line' : 'production.check.sketch')}
                          </Button>
                        )}
                        {item.outcome === 'flag' && !readOnly && (
                          <Button
                            variant="quiet"
                            icon={isKept ? 'keep' : undefined}
                            aria-label={words.t(
                              isKept ? 'production.check.keptFor' : 'production.check.keepFor',
                              { words: item.words },
                            )}
                            onPress={() => check.keep(frame.id, item.id, !isKept, number)}
                          >
                            {words.t(isKept ? 'production.check.kept' : 'production.check.keep')}
                          </Button>
                        )}
                      </span>
                    );
                  })()}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
