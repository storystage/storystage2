/**
 * The current frame's links over the Code editor (WP10.8; `07-ux.md` section 7.3): the "When
 * frame 2.3 starts" heading, how many blocks play the frame (they're marked in the code), and
 * Link or Unlink for the block chosen in the code. A frame whose blocks have all gone says it
 * isn't linked, with no error; its links stay in the film, so undo brings them back.
 */
import type { NodeId } from '@storystage/ast';
import type { Frame, Production } from '@storystage/production';
import { Button } from '@storystage/ui';
import { useState } from 'react';
import { words } from '../strings.ts';
import { linkableBlock, liveLinks } from './links.ts';

export interface FrameLinksProps {
  readonly production: Production;
  readonly frame: Frame;
  /** "2.3" */
  readonly number: string;
  readonly readOnly: boolean;
  /** The block last chosen in the code. */
  readonly chosen: NodeId | null;
  /** Links the block to the frame, or unlinks it, as one undo step. */
  onLink(block: NodeId, linked: boolean): void;
}

export function FrameLinks({
  production: p,
  frame,
  number,
  readOnly,
  chosen,
  onLink,
}: FrameLinksProps) {
  const [note, setNote] = useState<string | null>(null);
  const live = liveLinks(p, frame);
  const block = chosen ? linkableBlock(p, chosen) : null;
  const linked = block !== null && frame.links.includes(block);
  const summary =
    live.length > 0
      ? words.plural('production.links.count', live.length)
      : frame.links.length > 0
        ? words.t('production.links.gone')
        : words.t('production.links.none');
  return (
    <section className="pr-links" aria-labelledby="pr-links-title">
      <div className="pr-links-text">
        <h2 id="pr-links-title" className="pr-links-title">
          {words.t('production.links.heading', { n: number })}
        </h2>
        <p className="pr-links-summary">{summary}</p>
        {note && <p className="pr-links-note">{note}</p>}
      </div>
      {!readOnly && (
        <Button
          variant="secondary"
          icon={linked ? 'link_off' : 'link'}
          onPress={() => {
            if (!block) return setNote(words.t('production.links.chooseBlock'));
            setNote(null);
            onLink(block, !linked);
          }}
        >
          {words.t(linked ? 'production.links.unlink' : 'production.links.link', { n: number })}
        </Button>
      )}
    </section>
  );
}
