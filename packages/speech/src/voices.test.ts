import { describe, expect, it } from 'vitest';
import { chooseVoice, onDeviceVoices, type VoiceInfo } from './voices.ts';

const voice = (name: string, lang: string, extra: Partial<VoiceInfo> = {}): VoiceInfo => ({
  name,
  lang,
  voiceURI: `uri:${name}`,
  localService: true,
  default: false,
  ...extra,
});

describe('onDeviceVoices (spec 06, section 2.1)', () => {
  it('never offers a voice that runs online', () => {
    const voices = [
      voice('Google UK English', 'en-GB', { localService: false }),
      voice('Daniel', 'en-GB'),
    ];
    expect(onDeviceVoices(voices).map((v) => v.name)).toEqual(['Daniel']);
  });

  it('offers English voices only, en-GB first, then the default, then by name', () => {
    const voices = [
      voice('Zoe', 'en-US'),
      voice('Amélie', 'fr-FR'),
      voice('Karen', 'en_AU'),
      voice('Serena', 'en-GB'),
      voice('Alex', 'en-US', { default: true }),
      voice('Daniel', 'en-GB'),
    ];
    expect(onDeviceVoices(voices).map((v) => v.name)).toEqual([
      'Daniel',
      'Serena',
      'Alex',
      'Karen',
      'Zoe',
    ]);
  });

  it('puts the default en-GB voice before other en-GB voices', () => {
    const voices = [voice('Arthur', 'en-GB'), voice('Martha', 'en-GB', { default: true })];
    expect(onDeviceVoices(voices).map((v) => v.name)).toEqual(['Martha', 'Arthur']);
  });
});

describe('chooseVoice', () => {
  const voices = [voice('Daniel', 'en-GB'), voice('Alex', 'en-US')];

  it('takes the first on-device English voice', () => {
    expect(chooseVoice(voices)?.name).toBe('Daniel');
  });

  it("takes the learner's choice while it is still on the device and allowed", () => {
    expect(chooseVoice(voices, 'uri:Alex')?.name).toBe('Alex');
    expect(chooseVoice(voices, 'uri:Gone')?.name).toBe('Daniel');
  });

  it("won't take an online voice even if the learner chose it", () => {
    const online = [...voices, voice('Cloud', 'en-GB', { localService: false })];
    expect(chooseVoice(online, 'uri:Cloud')?.name).toBe('Daniel');
  });

  it('gives none when there is nothing on the device, which is a normal state', () => {
    expect(chooseVoice([])).toBeNull();
    expect(chooseVoice([voice('Cloud', 'en-GB', { localService: false })])).toBeNull();
  });
});
