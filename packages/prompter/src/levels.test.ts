import { describe, expect, it } from 'vitest';
import { modesAt, toolAllowed } from './levels.ts';
import { CHANGE_TOOLS, PLAN_TOOLS, READ_TOOLS, TOOL_NAMES } from './tool-names.ts';
import { PROMPTER_MODES } from './transport.ts';

const READ_ONLY_MODES = ['explain', 'storyCoach', 'scriptCheck'] as const;
const BUILD_MODES = ['showMeHow', 'buildIt'] as const;

describe('modesAt (spec 04, section 4.3)', () => {
  it('offers nothing when the Prompter is off', () => {
    expect(modesAt('off')).toEqual([]);
  });

  it('offers the read-only modes at Explain only, with the story coach', () => {
    expect(modesAt('explainOnly')).toEqual(READ_ONLY_MODES);
  });

  it('offers every mode at Plan only and Full', () => {
    expect(modesAt('planOnly')).toEqual(PROMPTER_MODES);
    expect(modesAt('full')).toEqual(PROMPTER_MODES);
  });
});

describe('toolAllowed (spec 04, section 3.4)', () => {
  const agreed = { planAgreed: true };

  it('names every tool once, in one group', () => {
    expect(new Set(TOOL_NAMES).size).toBe(TOOL_NAMES.length);
    expect(TOOL_NAMES).toHaveLength(READ_TOOLS.length + PLAN_TOOLS.length + CHANGE_TOOLS.length);
  });

  it('lets every mode read', () => {
    for (const mode of PROMPTER_MODES)
      for (const tool of READ_TOOLS) expect(toolAllowed(tool, mode, 'full')).toBe(true);
  });

  it('lets only Show me how and Build it plan', () => {
    for (const tool of PLAN_TOOLS) {
      for (const mode of BUILD_MODES) expect(toolAllowed(tool, mode, 'full')).toBe(true);
      for (const mode of READ_ONLY_MODES) expect(toolAllowed(tool, mode, 'full')).toBe(false);
    }
  });

  it('changes nothing without an agreed plan', () => {
    for (const tool of CHANGE_TOOLS)
      for (const mode of BUILD_MODES) {
        expect(toolAllowed(tool, mode, 'full')).toBe(false);
        expect(toolAllowed(tool, mode, 'full', agreed)).toBe(true);
      }
  });

  it('never changes anything in a read-only mode, plan or not', () => {
    for (const tool of CHANGE_TOOLS)
      for (const mode of READ_ONLY_MODES)
        expect(toolAllowed(tool, mode, 'full', agreed)).toBe(false);
  });

  it('plans but never builds at Plan only', () => {
    for (const mode of BUILD_MODES) {
      for (const tool of PLAN_TOOLS) expect(toolAllowed(tool, mode, 'planOnly')).toBe(true);
      for (const tool of CHANGE_TOOLS)
        expect(toolAllowed(tool, mode, 'planOnly', agreed)).toBe(false);
    }
  });

  it('allows nothing in a mode the level does not offer', () => {
    for (const tool of TOOL_NAMES) {
      expect(toolAllowed(tool, 'explain', 'off')).toBe(false);
      expect(toolAllowed(tool, 'buildIt', 'explainOnly', agreed)).toBe(false);
    }
  });
});
