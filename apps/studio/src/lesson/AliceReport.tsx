/**
 * What came across from an Alice world (spec 19, section 7): after the import, a list grouped by
 * kind (models, set-up, blocks…) with the count of each, every gap with what it was in Alice,
 * where, and why. A world with no gaps says so in one line.
 */
import type { GapKind, ImportReport } from '@storystage/a3p-import';
import { Button, Dialog } from '@storystage/ui';
import { words, type WordKey } from '../strings.ts';

/** The order the report's groups are shown in. */
const KINDS: readonly GapKind[] = ['model', 'setUp', 'class', 'block', 'value', 'event', 'unknown'];

export function AliceReport({
  title,
  report,
  onClose,
}: {
  title: string;
  report: ImportReport;
  onClose: () => void;
}) {
  const kinds = KINDS.filter((k) => report.counts[k] > 0);
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={words.t('alice.reportTitle', { title })}
      icon="description"
      width={680}
    >
      <div className="al-report">
        {kinds.length === 0 ? (
          <p className="al-summary">{words.t('alice.allCame')}</p>
        ) : (
          <>
            <p className="al-summary">{words.plural('alice.gaps', report.gaps.length)}</p>
            {kinds.map((kind) => (
              <section key={kind} aria-labelledby={`al-${kind}`}>
                <h3 id={`al-${kind}`} className="al-kind">
                  {words.t(`alice.kind.${kind}` as WordKey)} ({report.counts[kind]})
                </h3>
                <ul className="al-gaps">
                  {report.gaps
                    .filter((g) => g.kind === kind)
                    .map((g, i) => (
                      <li key={`${kind}-${i}`}>
                        <span className="al-what">{g.what}</span>
                        <span className="al-where">{g.where}</span>
                        <span className="al-why">{g.why}</span>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </>
        )}
        <div className="al-actions">
          <Button variant="primary" onPress={onClose}>
            {words.t('alice.close')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
