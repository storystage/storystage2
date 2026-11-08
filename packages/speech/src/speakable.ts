/**
 * The sanitiser (`docs/spec/06-speech.md` section 2.2, carried over from StoryStage 1): plain text
 * only, in utterances short enough that no speech engine cuts them off.
 */

/** Some engines stop a long utterance part way (Chrome's at about 15 seconds). */
export const MAX_UTTERANCE = 300;

/**
 * Tags become a space. One pass, with no regular expression: text from the Prompter or a learner
 * could hold thousands of unclosed `<`, and `/<[^>]*>/` rescans to the end from each one.
 */
function withoutTags(text: string): string {
  let out = '';
  let i = 0;
  for (;;) {
    const open = text.indexOf('<', i);
    const close = open < 0 ? -1 : text.indexOf('>', open + 1);
    if (close < 0) return out + text.slice(i);
    out += `${text.slice(i, open)} `;
    i = close + 1;
  }
}

/** Markdown links keep their words, `[this](url)` becoming `this`. One pass, as above. */
function withoutLinks(text: string): string {
  let out = '';
  let i = 0;
  for (;;) {
    const open = text.indexOf('[', i);
    const close = open < 0 ? -1 : text.indexOf(']', open + 1);
    if (close < 0) break;
    if (text[close + 1] !== '(') {
      out += text.slice(i, close + 1);
      i = close + 1;
      continue;
    }
    const end = text.indexOf(')', close + 2);
    if (end < 0) break;
    out += text.slice(i, open) + text.slice(open + 1, close);
    i = end + 1;
  }
  return out + text.slice(i);
}

function plain(text: string): string {
  return withoutLinks(withoutTags(text))
    .replace(/^[ \t]*(#+|>)[ \t]*/gm, '')
    .replace(/[*`~]/g, '')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/ ([.,!?;:])/g, '$1')
    .trim();
}

/** Splits text that is too long at spaces, and a word that is too long anywhere. */
function byWords(text: string): string[] {
  const pieces: string[] = [];
  let current = '';
  for (const word of text.split(' ')) {
    for (let i = 0; i < word.length; i += MAX_UTTERANCE) {
      const part = word.slice(i, i + MAX_UTTERANCE);
      if (!current) current = part;
      else if (current.length + 1 + part.length <= MAX_UTTERANCE) current += ` ${part}`;
      else {
        pieces.push(current);
        current = part;
      }
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/** The utterances to speak for a piece of text, in order. Empty when there's nothing to say. */
export function speakable(text: string): string[] {
  const clean = plain(text);
  if (!/[\p{L}\p{N}]/u.test(clean)) return [];
  const utterances: string[] = [];
  let current = '';
  for (const sentence of clean.split(/(?<=[.!?])\s+/)) {
    for (const piece of sentence.length > MAX_UTTERANCE ? byWords(sentence) : [sentence]) {
      if (!current) current = piece;
      else if (current.length + 1 + piece.length <= MAX_UTTERANCE) current += ` ${piece}`;
      else {
        utterances.push(current);
        current = piece;
      }
    }
  }
  if (current) utterances.push(current);
  return utterances;
}
