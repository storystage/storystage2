/**
 * Settings › Class set-up › Pupils and folders (`07-ux.md` section 9.4, Direction A screen 11):
 * the class list with each pupil's films, a pupil's own page (Rename, Remove, their films with
 * Move to the bin), Add pupil, and Import class list by paste.
 */
import type { ClassFolders, ProductionInfo, Pupil } from '@storystage/host';
import { Button, Dialog, Icon, NeutralNote, TextField } from '@storystage/ui';
import { useState, type FormEvent } from 'react';
import { GridList, GridListItem, type Key } from 'react-aria-components';
import { sinceWords } from '../lesson/LessonPages.tsx';
import { words } from '../strings.ts';
import { PUPIL_NAME_LIMIT, nameProblem, readPastedNames, type NameProblem } from './names.ts';

/** A pupil and their films, newest first. */
export interface PupilFilms {
  readonly pupil: Pupil;
  readonly films: readonly ProductionInfo[];
}

/** What's open in the studio now, which Settings won't remove or move to the bin. */
export interface OpenNow {
  readonly pupil: string | null;
  readonly film: string | null;
}

type View =
  | { readonly kind: 'list' }
  | { readonly kind: 'pupil'; readonly id: string }
  | {
      readonly kind: 'import';
    };

const problemWords = (problem: NameProblem, name: string) =>
  problem === 'empty'
    ? words.t('settings.name.empty')
    : problem === 'tooLong'
      ? words.t('settings.name.tooLong', { limit: PUPIL_NAME_LIMIT })
      : words.t('settings.name.taken', { name: name.trim() });

export function PupilsCard({
  classes,
  pupils,
  open,
  act,
}: {
  classes: ClassFolders;
  pupils: readonly PupilFilms[];
  open: OpenNow;
  /** Runs a change to the class, then reloads the page; says so if it fails. */
  act: (work: () => Promise<unknown>) => Promise<boolean>;
}) {
  const [view, setView] = useState<View>({ kind: 'list' });
  const [adding, setAdding] = useState(false);
  const names = pupils.map((p) => p.pupil.name);
  const shown = view.kind === 'pupil' ? pupils.find((p) => p.pupil.id === view.id) : undefined;
  const toList = () => setView({ kind: 'list' });

  return (
    <section className="st-card st-pupils" aria-labelledby="st-pupils-title">
      <div className="st-card-head">
        <h3 id="st-pupils-title" className="st-card-title">
          {words.t('settings.pupils')}
        </h3>
        {view.kind === 'list' && (
          <Button variant="secondary" icon="person_add" onPress={() => setAdding(true)}>
            {words.t('settings.addPupil')}
          </Button>
        )}
      </div>
      {view.kind === 'list' && (
        <PupilList
          pupils={pupils}
          onOpen={(id) => setView({ kind: 'pupil', id })}
          onImport={() => setView({ kind: 'import' })}
        />
      )}
      {view.kind === 'pupil' && shown && (
        <PupilPage
          entry={shown}
          others={names.filter((n) => n !== shown.pupil.name)}
          classes={classes}
          open={open}
          act={act}
          onBack={toList}
        />
      )}
      {view.kind === 'pupil' && !shown && (
        <Button variant="quiet" icon="arrow_back" onPress={toList}>
          {words.t('settings.allPupils')}
        </Button>
      )}
      {view.kind === 'import' && (
        <ImportNames
          taken={names}
          onCancel={toList}
          onAdd={async (list) => {
            const done = await act(async () => {
              for (const name of list) await classes.addPupil(name);
            });
            if (done) toList();
          }}
        />
      )}
      <NameDialog
        isOpen={adding}
        title={words.t('settings.addPupil')}
        icon="person_add"
        action={words.t('settings.add')}
        start=""
        taken={names}
        onClose={() => setAdding(false)}
        onDone={(name) => act(() => classes.addPupil(name))}
      />
    </section>
  );
}

function PupilList({
  pupils,
  onOpen,
  onImport,
}: {
  pupils: readonly PupilFilms[];
  onOpen: (id: string) => void;
  onImport: () => void;
}) {
  const [search, setSearch] = useState('');
  const wanted = search.trim().toLocaleLowerCase('en-GB');
  const shown = wanted
    ? pupils.filter((p) => p.pupil.name.toLocaleLowerCase('en-GB').includes(wanted))
    : pupils;
  return (
    <>
      {pupils.length > 0 && (
        <TextField
          label={words.t('settings.searchPupils')}
          hideLabel
          placeholder={words.t('settings.searchPupils')}
          value={search}
          onChange={setSearch}
        />
      )}
      {pupils.length === 0 ? (
        <p className="st-note">{words.t('settings.noPupils')}</p>
      ) : shown.length === 0 ? (
        <p className="st-note">{words.t('settings.noPupilMatch')}</p>
      ) : (
        <GridList
          className="st-list"
          aria-label={words.t('settings.pupils')}
          items={shown.map((p) => ({ id: p.pupil.id, ...p }))}
          onAction={(key: Key) => onOpen(String(key))}
        >
          {(p) => (
            <GridListItem
              id={p.id}
              textValue={p.pupil.name}
              aria-label={words.t('settings.openPupil', { name: p.pupil.name })}
              className="st-row"
            >
              <Icon name="folder" />
              <span className="st-row-name">{p.pupil.name}</span>
              <span className="st-row-count">
                {words.plural('settings.filmCount', p.films.length)}
              </span>
              <Icon name="chevron_right" />
            </GridListItem>
          )}
        </GridList>
      )}
      <Button variant="quiet" icon="upload_file" onPress={onImport}>
        {words.t('settings.importList')}
      </Button>
    </>
  );
}

function PupilPage({
  entry,
  others,
  classes,
  open,
  act,
  onBack,
}: {
  entry: PupilFilms;
  others: readonly string[];
  classes: ClassFolders;
  open: OpenNow;
  act: (work: () => Promise<unknown>) => Promise<boolean>;
  onBack: () => void;
}) {
  const { pupil, films } = entry;
  const [renaming, setRenaming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const isOpen = open.pupil === pupil.id;
  return (
    <div className="st-pupil">
      <Button variant="quiet" icon="arrow_back" onPress={onBack}>
        {words.t('settings.allPupils')}
      </Button>
      <h4 className="st-pupil-name">{pupil.name}</h4>
      <div className="st-actions">
        <Button variant="secondary" icon="edit" onPress={() => setRenaming(true)}>
          {words.t('settings.rename')}
        </Button>
        <Button
          variant="secondary"
          icon="person_remove"
          isDisabled={isOpen}
          onPress={() => setRemoving(true)}
        >
          {words.t('settings.remove')}
        </Button>
      </div>
      {isOpen && <NeutralNote>{words.t('settings.removeOpen', { name: pupil.name })}</NeutralNote>}
      <h5 className="st-subtitle">{words.t('settings.pupilFilms')}</h5>
      {films.length === 0 ? (
        <p className="st-note">{words.t('settings.noFilms')}</p>
      ) : (
        <ul className="st-films">
          {films.map((film) => {
            const filmOpen = isOpen && open.film === film.key;
            return (
              <li key={film.key} className="st-film">
                <Icon name="movie" />
                <span className="st-row-name">{film.name}</span>
                <span className="st-row-count">
                  {filmOpen
                    ? words.t('settings.filmOpen')
                    : words.t('lesson.savedWhen', { when: sinceWords(film.savedAt) })}
                </span>
                <Button
                  variant="quiet"
                  icon="delete"
                  isDisabled={filmOpen}
                  aria-label={words.t('settings.toBinNamed', { name: film.name })}
                  onPress={() =>
                    void act(async () => (await classes.folder(pupil.id)).remove(film.key))
                  }
                >
                  {words.t('settings.toBin')}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <NameDialog
        isOpen={renaming}
        title={words.t('settings.renameTitle', { name: pupil.name })}
        icon="edit"
        action={words.t('settings.save')}
        start={pupil.name}
        taken={others}
        onClose={() => setRenaming(false)}
        onDone={(name) => act(() => classes.renamePupil(pupil.id, name, pupil.picture))}
      />
      <Dialog
        isOpen={removing}
        onOpenChange={setRemoving}
        title={words.t('settings.removeTitle', { name: pupil.name })}
        icon="person_remove"
      >
        <p className="st-dialog-text">
          {films.length === 0
            ? words.t('settings.removeNoFilms', { name: pupil.name })
            : words.plural('settings.removeFilms', films.length, { name: pupil.name })}{' '}
          {words.t('settings.removeUndo')}
        </p>
        <div className="st-actions">
          <Button
            variant="stop"
            icon="person_remove"
            onPress={() => {
              setRemoving(false);
              void act(() => classes.removePupil(pupil.id)).then((done) => done && onBack());
            }}
          >
            {words.t('settings.remove')}
          </Button>
          <Button variant="secondary" onPress={() => setRemoving(false)}>
            {words.t('settings.cancel')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

/** Add pupil and Rename: one name, checked against the limit and the class as it is typed. */
function NameDialog({
  isOpen,
  title,
  icon,
  action,
  start,
  taken,
  onClose,
  onDone,
}: {
  isOpen: boolean;
  title: string;
  icon: 'person_add' | 'edit';
  action: string;
  start: string;
  taken: readonly string[];
  onClose: () => void;
  onDone: (name: string) => Promise<boolean>;
}) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={(next) => !next && onClose()} title={title} icon={icon}>
      {/* A fresh form each time it opens, starting from `start`. */}
      {isOpen && (
        <NameForm action={action} start={start} taken={taken} onClose={onClose} onDone={onDone} />
      )}
    </Dialog>
  );
}

function NameForm({
  action,
  start,
  taken,
  onClose,
  onDone,
}: {
  action: string;
  start: string;
  taken: readonly string[];
  onClose: () => void;
  onDone: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(start);
  const [tried, setTried] = useState(false);
  const problem = nameProblem(name, taken);
  // An empty field says nothing until the teacher tries to add it.
  const shownProblem = problem === 'empty' && !tried ? null : problem;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (problem !== null) return;
    onClose();
    void onDone(name.trim());
  };
  return (
    <form className="st-form" onSubmit={submit}>
      <TextField
        label={words.t('settings.name')}
        value={name}
        onChange={setName}
        autoFocus
        maxLength={PUPIL_NAME_LIMIT}
        isInvalid={shownProblem !== null}
      />
      {shownProblem && (
        <p role="alert" className="st-problem">
          {problemWords(shownProblem, name)}
        </p>
      )}
      <div className="st-actions">
        <Button type="submit" variant="primary">
          {action}
        </Button>
        <Button variant="secondary" onPress={onClose}>
          {words.t('settings.cancel')}
        </Button>
      </div>
    </form>
  );
}

/** Import class list: paste names, see what will be added, then add them. */
function ImportNames({
  taken,
  onCancel,
  onAdd,
}: {
  taken: readonly string[];
  onCancel: () => void;
  onAdd: (names: readonly string[]) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const read = readPastedNames(text, taken);
  const adding = read.filter((n) => n.problem === null).map((n) => n.name);
  const status = (problem: (typeof read)[number]['problem']) =>
    problem === null
      ? words.t('settings.import.added')
      : problem === 'taken'
        ? words.t('settings.import.taken')
        : problem === 'tooLong'
          ? words.t('settings.import.tooLong', { limit: PUPIL_NAME_LIMIT })
          : words.t('settings.import.repeated');
  return (
    <div className="st-import">
      <Button variant="quiet" icon="arrow_back" onPress={onCancel}>
        {words.t('settings.allPupils')}
      </Button>
      <h4 className="st-pupil-name">{words.t('settings.import.title')}</h4>
      <TextField
        label={words.t('settings.import.paste')}
        description={words.t('settings.import.help')}
        multiline
        value={text}
        onChange={setText}
      />
      {read.length > 0 && (
        <>
          <h5 className="st-subtitle">{words.t('settings.import.preview')}</h5>
          <ul className="st-preview">
            {read.map((n, i) => (
              <li
                key={`${i}-${n.name}`}
                className="st-preview-row"
                data-left-out={n.problem !== null || undefined}
              >
                <Icon name={n.problem === null ? 'person_add' : 'remove'} />
                <span className="st-row-name">{n.name}</span>
                <span className="st-row-count">{status(n.problem)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="st-actions">
        <Button
          variant="primary"
          icon="person_add"
          isDisabled={adding.length === 0}
          onPress={() => void onAdd(adding)}
        >
          {words.plural('settings.import.add', adding.length)}
        </Button>
        <Button variant="secondary" onPress={onCancel}>
          {words.t('settings.cancel')}
        </Button>
      </div>
    </div>
  );
}
