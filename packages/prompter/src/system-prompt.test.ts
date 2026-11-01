import { describe, expect, it } from 'vitest';
import {
  DATA_TAGS,
  INSTRUCTIONS,
  REQUEST_TAG,
  buildSystem,
  modeMessage,
  pinnedSystemMessages,
} from './system-prompt.ts';
import { PROMPTER_MODES } from './transport.ts';

const catalogs = { storyApi: 'Biped.move(direction, amount)', backstage: 'Cast: cat' };
const words = (text: string) => text.toLowerCase();

describe('buildSystem', () => {
  it('puts the instructions first, then the Story API, then Backstage', () => {
    expect(buildSystem(catalogs)).toEqual([
      { type: 'text', text: INSTRUCTIONS },
      { type: 'text', text: expect.stringContaining(catalogs.storyApi) },
      { type: 'text', text: expect.stringContaining(catalogs.backstage) },
    ]);
  });

  it('gives the same bytes every time, so the native layer can pin its hash', () => {
    expect(JSON.stringify(buildSystem(catalogs))).toBe(JSON.stringify(buildSystem(catalogs)));
  });

  it('changes only in the catalog blocks when a catalog changes', () => {
    const other = buildSystem({ ...catalogs, backstage: 'Cast: dog' });
    expect(other[0]).toEqual(buildSystem(catalogs)[0]);
    expect(other[2]).not.toEqual(buildSystem(catalogs)[2]);
  });
});

describe('the instructions', () => {
  it('say who the Prompter is and who it is talking to', () => {
    expect(INSTRUCTIONS).toMatch(/You are the Prompter in StoryStage/);
    expect(INSTRUCTIONS).toMatch(/aged 6 to 13/);
  });

  it('keep the story with the learner (rule 4)', () => {
    const text = words(INSTRUCTIONS);
    for (const part of ['logline', 'synopsis', 'scene heading', 'caption', 'script'])
      expect(text).toContain(part);
    expect(text).toMatch(/never write/);
    expect(text).toMatch(/make up a line/);
  });

  it('treat every data tag as material, never as instructions (13.2)', () => {
    for (const tag of DATA_TAGS) expect(INSTRUCTIONS).toContain(`<${tag}>`);
    expect(INSTRUCTIONS).toContain(`<${REQUEST_TAG}>`);
    expect(INSTRUCTIONS).toMatch(/never instructions/);
    expect(INSTRUCTIONS).toMatch(/shared/);
  });

  it('require an agreed plan before anything changes (13.9)', () => {
    expect(INSTRUCTIONS).toContain('propose_plan');
    expect(INSTRUCTIONS).toContain('revise_plan');
    expect(INSTRUCTIONS).toContain('<agreed_plan>');
    expect(INSTRUCTIONS).toContain('plan_step');
    expect(INSTRUCTIONS).toMatch(/end your turn/i);
  });

  it('carry over the audience and safety rules from StoryStage 1', () => {
    const text = words(INSTRUCTIONS);
    expect(text).toMatch(/personal information/);
    expect(text).toMatch(/violent/);
    expect(text).toMatch(/suggest/);
    expect(text).toMatch(/trusted adult/);
  });

  it('say no pictures are sent (rule 3)', () => {
    expect(words(INSTRUCTIONS)).toMatch(/you never see pictures/);
  });

  it("list rule 9's words, so they never reach the learner", () => {
    for (const word of ['AST', 'node', 'field', 'invocation', 'edit', 'token', 'schema', 'API'])
      expect(INSTRUCTIONS).toContain(`"${word}"`);
    expect(INSTRUCTIONS).toContain('narration');
  });

  it('tell the Prompter to stick to the catalogs and ask when unsure', () => {
    const text = words(INSTRUCTIONS);
    expect(text).toMatch(/only what is in the catalog/);
    expect(text).toMatch(/one question/);
  });
});

describe('modeMessage', () => {
  it('has a message for every mode', () => {
    for (const mode of PROMPTER_MODES) expect(modeMessage(mode).length).toBeGreaterThan(20);
    expect(new Set(PROMPTER_MODES.map((m) => modeMessage(m))).size).toBe(PROMPTER_MODES.length);
  });

  it('keeps the read-only modes read-only', () => {
    for (const mode of ['explain', 'storyCoach', 'scriptCheck'] as const)
      expect(modeMessage(mode)).toMatch(/Change nothing/);
  });

  it('never lets the coach write the story', () => {
    expect(words(modeMessage('storyCoach'))).toMatch(/never write/);
    expect(words(modeMessage('storyCoach'))).toMatch(/one question/);
  });

  it('builds only after a plan in Show me how and Build it', () => {
    for (const mode of ['showMeHow', 'buildIt'] as const)
      expect(modeMessage(mode)).toContain('propose_plan');
  });

  it('stops building at the Plan only level (decision 0034)', () => {
    for (const mode of ['showMeHow', 'buildIt'] as const) {
      const message = modeMessage(mode, { planOnly: true });
      expect(message).toContain('propose_plan');
      expect(message).toMatch(/the learner builds every block/i);
    }
  });

  it('leaves the read-only modes alone at the Plan only level', () => {
    expect(modeMessage('explain', { planOnly: true })).toBe(modeMessage('explain'));
  });
});

describe('pinnedSystemMessages', () => {
  it('lists every message the native layer may see, once each (spec 04, 1.8)', () => {
    const pinned = pinnedSystemMessages();
    expect(new Set(pinned).size).toBe(pinned.length);
    expect(pinned).toHaveLength(PROMPTER_MODES.length + 2);
    for (const mode of PROMPTER_MODES) {
      expect(pinned).toContain(modeMessage(mode));
      expect(pinned).toContain(modeMessage(mode, { planOnly: true }));
    }
  });

  it('holds instructions only: no place for learner text', () => {
    for (const message of pinnedSystemMessages()) expect(message).not.toMatch(/[<>{}$]/);
  });
});
