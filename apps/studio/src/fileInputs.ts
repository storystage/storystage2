/**
 * The `accept` of the studio's file inputs (Open Alice world, Open model pack, Import a script).
 *
 * On Android, wry 0.57's file chooser maps each extension in `accept` through Android's
 * MimeTypeMap and drops the ones it doesn't know, then filters by the first type left. So `.a3p`
 * and `.storystage-models` leave nothing to filter by, and the chooser fails, and `.fountain,.txt`
 * becomes text files only (S8's reading of wry, 21 Nov; not yet run on a device, until M6's Android
 * run). There, every file is offered: each reader checks a file's contents before it uses it.
 * The user agent is the system's (the app sets none), and Chrome on Android matches it too, where
 * offering every file does no harm.
 */
export const onAndroid = (userAgent: string = globalThis.navigator?.userAgent ?? ''): boolean =>
  /Android/i.test(userAgent);

/** `types` as given, or every file on Android. */
export const acceptFor = (types: string, userAgent?: string): string =>
  onAndroid(userAgent) ? '*/*' : types;
