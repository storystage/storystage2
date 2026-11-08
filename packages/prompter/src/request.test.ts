import { describe, expect, it } from 'vitest';
import { MODE_SETTINGS } from './models.ts';
import { buildRequest } from './request.ts';
import { buildSystem } from './system-prompt.ts';
import { ALLOWED_BETAS, PROMPTER_MODES, containsSecret, type PrompterMode } from './transport.ts';

const system = buildSystem({ storyApi: 'class Scene', backstage: 'Cast: cat' });
const tools = [{ name: 'explain', input_schema: { type: 'object' } }];
const messages = [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }];
const build = (mode: PrompterMode) => buildRequest({ id: 'r1', mode, system, tools, messages });

describe('MODE_SETTINGS (spec 04, section 1.3)', () => {
  it('starts every mode on Opus 5.5, as decision 0019 says', () => {
    for (const mode of PROMPTER_MODES) expect(MODE_SETTINGS[mode].model).toBe('claude-opus-5-5');
  });

  it('thinks less, and caps lower, where nothing is built', () => {
    for (const mode of ['explain', 'storyCoach', 'scriptCheck'] as const)
      expect(MODE_SETTINGS[mode]).toMatchObject({ effort: 'low', maxTokens: 16000 });
    for (const mode of ['showMeHow', 'buildIt'] as const)
      expect(MODE_SETTINGS[mode]).toMatchObject({ effort: 'medium', maxTokens: 32000 });
  });

  it('never asks for a fallback on Haiku, which has none', () => {
    for (const mode of PROMPTER_MODES)
      if (MODE_SETTINGS[mode].model.startsWith('claude-haiku'))
        expect(MODE_SETTINGS[mode].fallback).toBe(false);
  });
});

describe('buildRequest (spec 04, section 1.2)', () => {
  it('builds the body for a mode, streaming, with automatic caching', () => {
    const request = build('buildIt');
    expect(request).toEqual({
      id: 'r1',
      mode: 'buildIt',
      betas: [...ALLOWED_BETAS],
      body: {
        model: 'claude-opus-5-5',
        max_tokens: 32000,
        stream: true,
        output_config: { effort: 'medium' },
        cache_control: { type: 'ephemeral' },
        fallbacks: 'default',
        tools,
        system,
        messages,
      },
    });
  });

  it('never sends what the models refuse, or a key (rule 1)', () => {
    for (const mode of PROMPTER_MODES) {
      const { body } = build(mode);
      for (const banned of ['thinking', 'tool_choice', 'temperature', 'top_p', 'top_k'])
        expect(body).not.toHaveProperty(banned);
      expect(containsSecret(build(mode))).toBe(false);
    }
  });

  it('leaves out the fallback and its beta when a mode has none', () => {
    const haiku = { ...MODE_SETTINGS.explain, model: 'claude-haiku-5-5', fallback: false };
    const request = buildRequest({ id: 'r1', mode: 'explain', system, tools, messages }, haiku);
    expect(request.body).not.toHaveProperty('fallbacks');
    expect(request).not.toHaveProperty('betas');
    expect(request.body.model).toBe('claude-haiku-5-5');
  });

  it('passes system, tools and messages through untouched, so their hashes hold', () => {
    const { body } = build('explain');
    expect(body.system).toBe(system);
    expect(body.tools).toBe(tools);
    expect(body.messages).toBe(messages);
  });
});
