/** The MP4 encoder module (WP11.3, 11.5). Owner: S1, inside S2's `packages/export`. */
export type {
  AudioChunk,
  AudioCodecChoice,
  EncoderBackend,
  EncoderSession,
  Frame,
  SessionConfig,
} from './backend.ts';
export {
  EXPORT_ERROR_CODES,
  ExportError,
  exportMp4,
  probeExport,
  type ExportErrorCode,
  type ExportOptions,
  type ExportResult,
} from './export-mp4.ts';
export { mediabunnyBackend } from './mediabunny-backend.ts';
