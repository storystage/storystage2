/**
 * **Inputs ▾** beside the method tabs (decision 0074, workplan 7.14; spec 14 section 3a): the open
 * procedure's or function's inputs, with "Add an input (parameter)…", and Rename and Remove for
 * each. The tab row serves both editors, so Blocks and Tiles both get it. Each change is one undo
 * step, from S6's `addParameter`, `renameParameter` and `removeParameter`. A scene's script and a
 * listener take no inputs, so there's no menu for them.
 */
import type {
  EditOperation,
  MethodDecl,
  NodeId,
  ParameterDecl,
  Program,
  TypeRef,
} from '@storystage/ast';
import type { EditorHost, EditorId } from '@storystage/editor-contract';
import {
  addParameter,
  fill,
  parameterNameProblem,
  parameterProblemWords,
  parameterWords,
  removeParameter,
  renameParameter,
  word as storyWord,
} from '@storystage/story-api/editing';
import {
  Button,
  Dialog,
  Icon,
  NeutralNote,
  Segmented,
  messages,
  useThemeStyle,
} from '@storystage/ui';
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
import { GIVES, type Gives } from './newMethodEdits.ts';

export interface InputsMenuProps {
  host: EditorHost;
  /** The program as the Code editor shows it. */
  program: Program;
  /** The open procedure or function. */
  method: MethodDecl;
  /** The editor showing, which the edits come from. */
  source?: EditorId;
  /** Opens the Code editor at a block: where an input that can't be removed is used. */
  onReveal?: (node: NodeId) => void;
}

type Open =
  | { readonly kind: 'add'; readonly name: string; readonly type: Gives }
  | { readonly kind: 'rename'; readonly input: ParameterDecl; readonly name: string }
  | { readonly kind: 'used'; readonly words: string; readonly at: NodeId | null };

export function InputsMenu({
  host,
  program,
  method,
  source = 'blocks',
  onReveal,
}: InputsMenuProps) {
  const themeStyle = useThemeStyle();
  const [open, setOpen] = useState<Open | null>(null);
  const [tried, setTried] = useState(false);

  const apply = (edits: readonly EditOperation[], label: string) => {
    const result = host.apply(edits, label, source);
    host.announce(result.ok ? label : result.reason);
    return result.ok;
  };

  const startAdd = () => {
    const taken = new Set(method.params.map((p) => p.name));
    let k = method.params.length + 1;
    while (taken.has(`input${k}`)) k++;
    setTried(false);
    setOpen({ kind: 'add', name: `input${k}`, type: 'Number' });
  };

  const remove = (input: ParameterDecl) => {
    const label = fill(storyWord('parameter.removed'), { name: input.name, method: method.name });
    const removed = removeParameter(program, input.id, label);
    if (!removed) return;
    if ('usedBy' in removed) {
      const said = fill(storyWord('parameter.inUse'), { name: input.name, method: method.name });
      host.announce(said);
      setOpen({ kind: 'used', words: said, at: removed.usedBy[0] ?? null });
      return;
    }
    apply(removed.edits, label);
  };

  const chosen = open && open.kind !== 'used' ? open.name.trim() : '';
  const problem =
    open?.kind === 'add'
      ? parameterNameProblem(program, method.id, chosen)
      : open?.kind === 'rename'
        ? parameterNameProblem(program, method.id, chosen, open.input.id)
        : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!open || open.kind === 'used' || problem) return;
    if (open.kind === 'add') {
      const label = fill(storyWord('parameter.added'), { name: chosen, method: method.name });
      const type: TypeRef = { kind: 'story', name: open.type };
      const added = addParameter(program, method.id, chosen, type, label);
      if (added && apply(added.edits, label)) setOpen(null);
      return;
    }
    const label = fill(storyWord('parameter.renamed'), { old: open.input.name, name: chosen });
    const renamed = renameParameter(program, open.input.id, chosen, label);
    if (renamed === null) return;
    if (renamed.length === 0 || apply(renamed, label)) setOpen(null);
  };

  const title =
    open?.kind === 'add'
      ? words.t('production.inputNew', { method: method.name })
      : open?.kind === 'rename'
        ? words.t('production.inputRenameTitle', { name: open.input.name })
        : storyWord('parameter.remove').replace(/…$/, '');

  return (
    <>
      <MenuTrigger>
        <AriaButton
          className="pr-new"
          aria-label={words.t('production.inputsOf', { method: method.name })}
        >
          <Icon name="edit_note" size={20} />
          {words.t('production.inputs')}
          <Icon name="arrow_drop_down" size={20} />
        </AriaButton>
        <Popover
          className="ss-root sb-popover pr-new-popover"
          style={themeStyle}
          placement="bottom end"
        >
          <Menu
            className="sb-menu"
            aria-label={words.t('production.inputsOf', { method: method.name })}
            onAction={(key) => {
              const k = String(key);
              if (k === 'add') return startAdd();
              const input = method.params.find((p) => k.endsWith(`:${p.id}`));
              if (!input) return;
              if (k.startsWith('rename:')) {
                setTried(false);
                setOpen({ kind: 'rename', input, name: input.name });
              } else remove(input);
            }}
          >
            <MenuSection>
              <MenuItem id="add" className="sb-menu-item">
                {storyWord('parameter.firstOffer')}
              </MenuItem>
            </MenuSection>
            {method.params.map((input) => (
              <MenuSection key={input.id}>
                <Header className="pr-new-heading">{parameterWords(program, input)}</Header>
                <MenuItem
                  id={`rename:${input.id}`}
                  className="sb-menu-item"
                  textValue={`${storyWord('parameter.rename')} ${input.name}`}
                >
                  {storyWord('parameter.rename')}
                </MenuItem>
                <MenuItem
                  id={`remove:${input.id}`}
                  className="sb-menu-item"
                  textValue={`${storyWord('parameter.remove')} ${input.name}`}
                >
                  {storyWord('parameter.remove')}
                </MenuItem>
              </MenuSection>
            ))}
          </Menu>
        </Popover>
      </MenuTrigger>
      <Dialog
        isOpen={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        title={title}
        width={520}
      >
        {open?.kind === 'used' ? (
          <div className="pr-new-form">
            <NeutralNote>{open.words}</NeutralNote>
            <div className="sb-dialog-actions">
              {/* Where it's used, as Remove's refusal in Objects in this scene shows it. */}
              {open.at && onReveal && (
                <Button
                  variant="primary"
                  icon="arrow_forward"
                  onPress={() => {
                    const at = open.at!;
                    setOpen(null);
                    onReveal(at);
                  }}
                >
                  {words.t('production.check.block')}
                </Button>
              )}
              <Button
                variant={open.at && onReveal ? 'secondary' : 'primary'}
                onPress={() => setOpen(null)}
              >
                {messages.t('dialog.close')}
              </Button>
            </div>
          </div>
        ) : (
          open && (
            <form className="pr-new-form" onSubmit={submit}>
              <SpokenField
                field="production.inputNameOnly"
                label={words.t('production.inputNameOnly')}
                description={tried && problem ? parameterProblemWords(problem) : undefined}
                isInvalid={tried && problem !== null}
                validationBehavior="aria"
                value={open.name}
                onChange={(v) => setOpen({ ...open, name: v })}
                autoFocus
              />
              {open.kind === 'add' && (
                <Segmented
                  label={words.t('production.inputHoldsOnly')}
                  options={GIVES.map((g) => ({
                    id: g,
                    label: words.t(`production.gives.${g}` as WordKey),
                  }))}
                  value={open.type}
                  onChange={(type) => setOpen({ ...open, type })}
                />
              )}
              <div className="sb-dialog-actions">
                <Button
                  variant="primary"
                  icon={open.kind === 'add' ? 'add' : undefined}
                  type="submit"
                >
                  {words.t(open.kind === 'add' ? 'production.add' : 'production.rename')}
                </Button>
                <Button variant="secondary" onPress={() => setOpen(null)}>
                  {words.t('production.cancel')}
                </Button>
              </div>
            </form>
          )
        )}
      </Dialog>
    </>
  );
}
