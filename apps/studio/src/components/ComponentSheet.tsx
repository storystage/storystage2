import {
  AiBadge,
  Button,
  Checkbox,
  Dialog,
  FRAME_STATUSES,
  FrameStrip,
  ModePanel,
  ModeTabList,
  ModeTabs,
  NeutralNote,
  PlanSteps,
  RadioCards,
  Segmented,
  StatusChip,
  TextField,
  ThemeRoot,
  Toggle,
  messages,
  type Mode,
  type PlanStep,
  type Theme,
} from '@storystage/ui';
import { useState, type ReactNode } from 'react';

/**
 * Every @storystage/ui component, in the dark and light themes side by side, for checking against
 * Direction A's screen 14 (WP12.3) and for the accessibility checks (12.5). Sample words only.
 */
export function ComponentSheet() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        minHeight: '100vh',
      }}
    >
      <Sheet theme="dark" />
      <Sheet theme="light" />
    </div>
  );
}

const SHOTS = [
  { id: 'wide', label: 'Wide', icon: 'landscape' },
  { id: 'medium', label: 'Medium', icon: 'photo_camera' },
  { id: 'closeUp', label: 'Close-up', icon: 'groups' },
] as const;

const LEVELS = [
  { value: 'off', label: 'Off', description: 'Not available to pupils' },
  { value: 'explain', label: 'Explain only', description: 'Answers questions, changes nothing' },
  { value: 'plan', label: 'Plan only', description: 'Suggests plans; pupils build them' },
  { value: 'full', label: 'Full', description: 'Plans and builds when asked' },
] as const;

const PLAN: PlanStep[] = [
  { id: 'a', text: 'Fly the owl down to stand by the tree.' },
  { id: 'b', text: 'Turn the owl to face the cat.' },
  { id: 'c', text: 'The owl says “Here is the key.”' },
  { id: 'd', text: 'Medium shot of both, held for 3 seconds.' },
];

const SCENES = [
  {
    id: 's1',
    title: 'Scene 1',
    frames: [
      { id: 'f11', number: '1.1', status: 'checked' },
      { id: 'f12', number: '1.2', status: 'checked' },
      { id: 'f13', number: '1.3', status: 'rehearsed' },
    ],
  },
  {
    id: 's2',
    title: 'Scene 2',
    frames: [
      { id: 'f21', number: '2.1', status: 'coded' },
      { id: 'f22', number: '2.2', status: 'staged' },
      { id: 'f23', number: '2.3', status: 'planned' },
      { id: 'f24', number: '2.4', status: 'lookAt' },
    ],
  },
] as const;

function Sheet({ theme }: { theme: Theme }) {
  const [mode, setMode] = useState<Mode>('storyboard');
  const [shot, setShot] = useState<(typeof SHOTS)[number]['id']>('medium');
  const [editor, setEditor] = useState<'blocks' | 'tiles'>('blocks');
  const [locked, setLocked] = useState(true);
  const [again, setAgain] = useState(false);
  const [level, setLevel] = useState<(typeof LEVELS)[number]['value']>('plan');
  const [plan, setPlan] = useState(PLAN);
  const [frame, setFrame] = useState('f23');
  const [dialog, setDialog] = useState(false);
  return (
    <ThemeRoot theme={theme}>
      <main
        aria-label={theme === 'dark' ? 'Dark theme' : 'Light theme'}
        style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 28, minWidth: 0 }}
      >
        <h1 style={{ margin: 0, fontFamily: 'var(--ss-font-display)', fontSize: 30 }}>
          {theme === 'dark' ? 'Dark' : 'Light'}
        </h1>

        <Section title="Buttons">
          <Row>
            <Button variant="primary" icon="play_arrow" iconFilled>
              Rehearse
            </Button>
            <Button variant="strong" icon="ios_share">
              Export film
            </Button>
            <Button variant="secondary" icon="undo">
              Undo this request
            </Button>
            <Button variant="quiet">Not now</Button>
          </Row>
          <Row>
            <Button variant="stop" icon="stop">
              {messages.t('prompter.stop')}
            </Button>
            <Button variant="prompter" icon="headset_mic">
              {messages.t('prompter.ask')}
            </Button>
            <Button variant="primary" icon="play_arrow" iconFilled isDisabled>
              Rehearse
            </Button>
            <Button variant="secondary" icon="mic" aria-label="Say it: Logline" />
          </Row>
          <Row>
            <Button variant="primary" icon="handyman" size="key">
              {messages.t('prompter.build')}
            </Button>
          </Row>
        </Section>

        <Section title="Mode tabs">
          <ModeTabs mode={mode} onModeChange={setMode}>
            <ModeTabList />
            <ModePanel mode="storyboard">
              <span />
            </ModePanel>
            <ModePanel mode="production">
              <span />
            </ModePanel>
            <ModePanel mode="screening">
              <span />
            </ModePanel>
          </ModeTabs>
        </Section>

        <Section title="Status">
          <Row>
            {FRAME_STATUSES.map((s) => (
              <StatusChip key={s} status={s} />
            ))}
            <AiBadge />
          </Row>
        </Section>

        <Section title="Frame strip">
          <FrameStrip scenes={SCENES} currentFrame={frame} onFrameChange={setFrame} />
        </Section>

        <Section title="Choices">
          <Segmented label="Shot" options={SHOTS} value={shot} onChange={setShot} />
          <Segmented
            label="Default code editor"
            options={[
              { id: 'blocks', label: 'Blocks' },
              { id: 'tiles', label: 'Tiles' },
            ]}
            value={editor}
            onChange={setEditor}
          />
          <Toggle isSelected={locked} onChange={setLocked}>
            Lock for pupils
          </Toggle>
          <Checkbox isSelected={again} onChange={setAgain}>
            Don’t explain this again
          </Checkbox>
          <RadioCards label="The Prompter" options={LEVELS} value={level} onChange={setLevel} />
        </Section>

        <Section title="Text">
          <TextField
            label="Logline"
            placeholder="Who wants what, and what stands in the way?"
            onSpeak={() => {}}
          />
          <TextField
            label="Claude key"
            placeholder="sk-…"
            description="Adults only. Never spoken aloud."
          />
          <NeutralNote>{messages.t('note.prompterOffBySchool')}</NeutralNote>
        </Section>

        <Section title="The Prompter's plan">
          <PlanSteps steps={plan} onReorder={setPlan} onEdit={() => {}} />
        </Section>

        <Section title="Dialog">
          <Row>
            <Button variant="secondary" icon="ios_share" onPress={() => setDialog(true)}>
              Open the export dialog
            </Button>
          </Row>
          <Dialog isOpen={dialog} onOpenChange={setDialog} title="Export film" icon="ios_share">
            <p style={{ margin: 0 }}>Settings are locked while exporting.</p>
            <Row>
              <Button variant="stop" icon="stop" onPress={() => setDialog(false)}>
                Stop export
              </Button>
              <Button variant="secondary" onPress={() => setDialog(false)}>
                Keep working
              </Button>
            </Row>
          </Dialog>
        </Section>
      </main>
    </ThemeRoot>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--ss-font-display)', fontSize: 19 }}>{title}</h2>
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
      {children}
    </div>
  );
}
