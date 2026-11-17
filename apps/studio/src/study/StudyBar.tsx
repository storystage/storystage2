/**
 * The study bar (spec 14 section 6.3) and the question a device with no class list asks (6.2).
 * The bar is the working area's first row, in a session only: the session's code, so a school
 * that keeps a private list of codes can write it down. StoryStage never sees that list.
 */
import { showCode, t, type StudySession } from '@storystage/study';
import { Button, Dialog, Icon } from '@storystage/ui';
import { useEffect, useRef } from 'react';
import { words } from '../strings.ts';

export function StudyBar({ session }: { session: StudySession }) {
  return (
    <section className="studio-study-bar" aria-label={words.t('study.bar')}>
      <Icon name="description" size={20} />
      <span className="studio-study-code">
        {t('bar.session', { code: showCode(session.code) })}
      </span>
    </section>
  );
}

/** "Is this learner taking part in the study?", with No first and focused (6.2). */
export function StudyQuestion({
  isOpen,
  onAnswer,
}: {
  isOpen: boolean;
  onAnswer: (yes: boolean) => void;
}) {
  // React Aria's dialog takes focus as it opens; then No takes it, as 6.2 asks.
  const actions = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => actions.current?.querySelector('button')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);
  return (
    <Dialog
      isOpen={isOpen}
      // Closing it without an answer is No: nothing is kept for a learner not taking part.
      onOpenChange={(open) => !open && onAnswer(false)}
      title={words.t('study.ask')}
      icon="groups"
      width={520}
    >
      <p className="st-dialog-text">{words.t('study.askWhy')}</p>
      <div className="st-actions" ref={actions}>
        <Button variant="primary" onPress={() => onAnswer(false)}>
          {words.t('study.no')}
        </Button>
        <Button variant="secondary" onPress={() => onAnswer(true)}>
          {words.t('study.yes')}
        </Button>
      </div>
    </Dialog>
  );
}
