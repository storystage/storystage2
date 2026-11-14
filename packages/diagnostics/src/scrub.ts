/**
 * Taking out what must never leave the device in a problem report (WP18.5; spec 05, section
 * 2.2; threat W8 in spec 15): Claude keys and anything key-shaped, email addresses, the user's
 * name in file paths, the query and fragment of web addresses, and the names of the class's
 * pupils. It runs on every line as it's logged and once more on the whole report.
 *
 * Every pattern runs in time proportional to the text (no nested or overlapping repeats, and
 * addresses checked word by word), since it runs on whatever an error happened to say.
 */

const KEY = /\bsk-ant-[\w-]+/g;
/** Long unbroken runs of letters, digits, _ and -: a token if it has both letters and digits. */
const RUN = /[\w-]{32,}/g;
/** C:\Users\name\, /Users/name/ and /home/name/. */
const USER_PATH = /([A-Za-z]:\\Users\\|\/Users\/|\/home\/)[^\\/\s'"]+/gi;
const WORD = /\S+/g;
/** One word that is an email address. */
const EMAIL_WORD = /^[\w.%+-]+@[\w-]+(?:\.[\w-]+)+$/;
const TRAILING = /[.,;:!?)\]}'"’”]+$/;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A word with any web address in it cut before its query and fragment, which can hold anything. */
function address(word: string): string {
  const start = word.toLowerCase().indexOf('http');
  if (start < 0 || !/^https?:\/\//i.test(word.slice(start, start + 8))) return word;
  const rest = word.slice(start);
  const cut = rest.search(/[?#]/);
  if (cut < 0) return word;
  const quote = rest.slice(cut).search(/['"]/);
  return word.slice(0, start + cut) + (quote < 0 ? '' : rest.slice(cut + quote));
}

/** The word, or a stand-in if it's an email address (punctuation around it kept). */
function email(word: string): string {
  const at = word.indexOf('@');
  if (at < 0) return word;
  const tail = TRAILING.exec(word)?.[0] ?? '';
  const body = word.slice(0, word.length - tail.length);
  // Where the address starts: after any punctuation before it, such as "(" or "<".
  let start = at;
  while (start > 0 && /[\w.%+-]/.test(body[start - 1]!)) start--;
  const candidate = body.slice(start);
  return EMAIL_WORD.test(candidate) ? `${body.slice(0, start)}(an email address)${tail}` : word;
}

/** `text` with keys, email addresses, user names in paths, queries and `names` taken out. */
export function scrub(text: string, names: readonly string[] = []): string {
  let out = text
    .replace(KEY, '(hidden)')
    .replace(RUN, (run) => (/\d/.test(run) && /[A-Za-z]/.test(run) ? '(hidden)' : run))
    .replace(WORD, (word) => email(address(word)))
    .replace(USER_PATH, '$1…');
  // Longest first, so "Ana Maria" goes before "Ana". Names of one letter are left: they'd take
  // out too much and say too little.
  const longestFirst = [...names]
    .map((n) => n.trim())
    .filter((n) => n.length > 1)
    .sort((a, b) => b.length - a.length);
  for (const name of longestFirst)
    out = out.replace(
      new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`, 'giu'),
      '(a name)',
    );
  return out;
}
