/**
 * **New** beside the method tabs (`07-ux.md` section 7.3; WP7.2): a procedure or a function,
 * named in a dialog, or a listener for one of the Story API's events. With a character chosen, a
 * move or a question for it, which every one of its model in every scene can use (decision 0074).
 * Each is one undo step, and its tab opens.
 */
import type { NodeId } from '@storystage/ast';
import type { EditorHost, EditorId } from '@storystage/editor-contract';
import { Button, Dialog, Icon, NeutralNote, Segmented, useThemeStyle } from '@storystage/ui';
import { useState, type FormEvent } from 'react';
import {
  Button as AriaButton,
  Header,
  Menu,
  MenuItem,
  MenuSection,
  MenuTrigger,
  Popover,
} from 'react-aria-components';
import { SpokenField } from '../speech/SpokenField.tsx';
import { words, type WordKey } from '../strings.ts';
import { parameterProblemWords, word as storyWord } from '@storystage/story-api/editing';
import {
  GIVES,
  NEW_EVENTS,
  eventWords,
  inputProblems,
  nameProblem,
  newListener,
  newCharacterMethod,
  newMethodWithInputs,
  suggestedName,
  type Declared,
  type Gives,
  type NewInput,
} from './newMethodEdits.ts';
import { listWords } from './inputWords.ts';
import type { Character } from './characters.ts';

export interface NewMethodProps {
  host: EditorHost;
  /** The scene's class, which the new method or listener joins. */
  type: NodeId;
  /** The scene's number, for the words. */
  n: number;
  /** Opens the new method's tab. */
  onAdded: (id: NodeId) => void;
  /** The character chosen in "Blocks for", or open: New offers a move and a question for it. */
  character?: Character | null;
  /** The editor showing, which the edits come from. */
  source?: EditorId;
}

type Making = 'procedure' | 'function' | 'move' | 'question';
const MAKING: readonly Making[] = ['procedure', 'function', 'move', 'question'];
/** Each one's part of its words' keys ("production.addMove"), and the name it suggests. */
const KEY: Record<Making, string> = {
  procedure: 'Procedure',
  function: 'Function',
  move: 'Move',
  question: 'Question',
};
const BASE: Record<Making, string> = {
  procedure: 'newProcedure',
  function: 'newFunction',
  move: 'newMove',
  question: 'newQuestion',
};

export function NewMethod({
  host,
  type,
  n,
  onAdded,
  character = null,
  source = 'blocks',
}: NewMethodProps) {
  const themeStyle = useThemeStyle();
  const [making, setMaking] = useState<Making | null>(null);
  const [name, setName] = useState('');
  const [gives, setGives] = useState<Gives>('Number');
  const [inputs, setInputs] = useState<NewInput[]>([]);
  const [tried, setTried] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  // A move or question joins the character's class, which the first one makes.
  const forCharacter = making === 'move' || making === 'question';
  const owner = forCharacter ? (character?.type ?? null) : type;
  const model = character?.model.name ?? '';
  const isFunction = making === 'function' || making === 'question';

  const start = (kind: Making) => {
    setMaking(kind);
    const base = BASE[kind];
    const into = kind === 'move' || kind === 'question' ? (character?.type ?? null) : type;
    setName(into ? suggestedName(host.program(), into, base) : base);
    setGives('Number');
    setInputs([]);
    setTried(false);
    setRefusal(null);
  };

  /** A new input, named input1, input2… after the ones already there. */
  const addInput = () => {
    const taken = new Set(inputs.map((i) => i.name.trim()));
    let k = inputs.length + 1;
    while (taken.has(`input${k}`)) k++;
    setInputs([...inputs, { name: `input${k}`, type: 'Number' }]);
  };
  const changeInput = (at: number, change: Partial<NewInput>) =>
    setInputs(inputs.map((i, k) => (k === at ? { ...i, ...change } : i)));

  const apply = (made: Declared | null, label: string) => {
    if (!made) return false;
    const result = host.apply([made.edit], label, source);
    if (!result.ok) {
      setRefusal(result.reason);
      host.announce(result.reason);
      return false;
    }
    host.announce(words.t('production.added', { what: label }));
    onAdded(made.id);
    return true;
  };

  const listen = (event: string) => {
    const label = words.t('production.addListener', { event: eventWords(event) });
    apply(newListener(host.program(), type, event, label), label);
  };

  const chosen = name.trim();
  // A class not made yet has no names taken.
  const problem = making ? nameProblem(host.program(), owner ?? ('' as NodeId), chosen) : null;
  const problems = inputProblems(inputs);
  const add = (e?: FormEvent) => {
    e?.preventDefault();
    setTried(true);
    if (!making || problem || problems.some((p) => p !== null)) return;
    const named = inputs.map((i) => i.name.trim());
    const key = KEY[making];
    const label =
      named.length === 0
        ? words.t(`production.add${key}` as WordKey, { name: chosen, model })
        : words.t(`production.add${key}With` as WordKey, {
            name: chosen,
            model,
            inputs: listWords(named),
          });
    const returns = isFunction ? gives : null;
    const made =
      forCharacter && character
        ? newCharacterMethod(
            host.program(),
            character.model,
            character.fields,
            chosen,
            returns,
            inputs,
            label,
          )
        : newMethodWithInputs(host.program(), type, chosen, returns, inputs, label);
    if (!made) return;
    const result = host.apply(made.edits, label, source);
    if (!result.ok) {
      setRefusal(result.reason);
      host.announce(result.reason);
      return;
    }
    host.announce(words.t('production.added', { what: label }));
    onAdded(made.id);
    setMaking(null);
  };

  return (
    <>
      <MenuTrigger>
        <AriaButton className="pr-new" aria-label={words.t('production.newIn', { n })}>
          <Icon name="add" size={20} />
          {words.t('production.new')}
          <Icon name="arrow_drop_down" size={20} />
        </AriaButton>
        <Popover
          className="ss-root sb-popover pr-new-popover"
          style={themeStyle}
          placement="bottom end"
        >
          <Menu
            className="sb-menu"
            aria-label={words.t('production.newIn', { n })}
            onAction={(key) => {
              const k = String(key);
              if ((MAKING as readonly string[]).includes(k)) start(k as Making);
              else listen(k.slice('event:'.length));
            }}
          >
            <MenuSection>
              <MenuItem id="procedure" className="sb-menu-item">
                {words.t('production.newProcedure')}
              </MenuItem>
              <MenuItem id="function" className="sb-menu-item">
                {words.t('production.newFunction')}
              </MenuItem>
            </MenuSection>
            {character ? (
              <MenuSection>
                <MenuItem id="move" className="sb-menu-item">
                  {words.t('production.newMove', { model: character.model.name })}
                </MenuItem>
                <MenuItem id="question" className="sb-menu-item">
                  {words.t('production.newQuestion', { model: character.model.name })}
                </MenuItem>
              </MenuSection>
            ) : null}
            <MenuSection>
              <Header className="pr-new-heading">{words.t('production.newListener')}</Header>
              {NEW_EVENTS.map((event) => (
                <MenuItem key={event} id={`event:${event}`} className="sb-menu-item">
                  {eventWords(event)}
                </MenuItem>
              ))}
            </MenuSection>
          </Menu>
        </Popover>
      </MenuTrigger>
      <Dialog
        isOpen={making !== null}
        onOpenChange={(open) => !open && setMaking(null)}
        title={words.t(`production.new${KEY[making ?? 'procedure']}Title` as WordKey, { model })}
        width={520}
      >
        <form className="pr-new-form" onSubmit={add}>
          {forCharacter && (
            <p className="pr-new-note">{words.t('production.characterNote', { model })}</p>
          )}
          <SpokenField
            field="production.newName"
            label={words.t('production.newName')}
            description={
              tried && problem
                ? words.t(`production.name.${problem}` as WordKey, { n, name: chosen })
                : words.t('production.newNameHint')
            }
            isInvalid={tried && problem !== null}
            validationBehavior="aria"
            value={name}
            onChange={(v) => {
              setName(v);
              setRefusal(null);
            }}
            autoFocus
          />
          {isFunction && (
            <div className="pr-new-gives">
              {/* Seen; the choices themselves are named by Segmented's own label. */}
              <span className="ss-field-label" aria-hidden="true">
                {words.t('production.gives')}
              </span>
              <Segmented
                label={words.t('production.gives')}
                options={GIVES.map((g) => ({
                  id: g,
                  label: words.t(`production.gives.${g}` as WordKey),
                }))}
                value={gives}
                onChange={setGives}
              />
            </div>
          )}
          {/* Its inputs (decision 0074): "parameter" in brackets where they're first offered. */}
          <fieldset className="pr-new-inputs">
            <legend className="ss-field-label">{words.t('production.inputs')}</legend>
            {inputs.map((input, at) => (
              <div key={at} className="pr-new-input">
                <SpokenField
                  field="production.inputName"
                  label={words.t('production.inputName', { n: at + 1 })}
                  description={
                    tried && problems[at] ? parameterProblemWords(problems[at]!) : undefined
                  }
                  isInvalid={tried && problems[at] !== null}
                  validationBehavior="aria"
                  value={input.name}
                  onChange={(v) => changeInput(at, { name: v })}
                />
                <Segmented
                  label={words.t('production.inputHolds', { n: at + 1 })}
                  options={GIVES.map((g) => ({
                    id: g,
                    label: words.t(`production.gives.${g}` as WordKey),
                  }))}
                  value={input.type}
                  onChange={(t) => changeInput(at, { type: t })}
                />
                <Button
                  variant="quiet"
                  icon="close"
                  onPress={() => setInputs(inputs.filter((_, k) => k !== at))}
                >
                  {words.t('production.inputRemove', { n: at + 1 })}
                </Button>
              </div>
            ))}
            <Button variant="secondary" icon="add" onPress={addInput}>
              {storyWord('parameter.firstOffer')}
            </Button>
          </fieldset>
          {refusal && <NeutralNote>{refusal}</NeutralNote>}
          <div className="sb-dialog-actions">
            <Button variant="primary" icon="add" type="submit">
              {words.t('production.add')}
            </Button>
            <Button variant="secondary" onPress={() => setMaking(null)}>
              {words.t('production.cancel')}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
