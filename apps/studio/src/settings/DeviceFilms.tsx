/**
 * Films kept from before the class list (`07-ux.md` section 9.4): a device used without names
 * keeps its films in its own folder, which no pupil can open once the class has names. This card
 * lists them and moves them all to one pupil (S8's `deviceFilms` and `moveDeviceFilms`, #259).
 */
import type { ClassFolders, ProductionInfo } from '@storystage/host';
import { Button, Icon, NeutralNote, useThemeStyle } from '@storystage/ui';
import { Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components';
import { sinceWords } from '../lesson/LessonPages.tsx';
import { words } from '../strings.ts';
import type { PupilFilms } from './Pupils.tsx';

export function DeviceFilmsCard({
  films,
  pupils,
  deviceOpen,
  classes,
  act,
  onMoved,
}: {
  films: readonly ProductionInfo[];
  pupils: readonly PupilFilms[];
  /** The device's own folder is open in the studio, so its films stay where they are for now. */
  deviceOpen: boolean;
  classes: ClassFolders;
  act: (work: () => Promise<unknown>) => Promise<boolean>;
  /** What moved, for the page to say: this card goes once the films have. */
  onMoved: (said: string) => void;
}) {
  const themeStyle = useThemeStyle();
  const move = async (id: string) => {
    const name = pupils.find((p) => p.pupil.id === id)?.pupil.name ?? '';
    let count = 0;
    const done = await act(async () => {
      count = await classes.moveDeviceFilms(id);
    });
    if (done) onMoved(words.plural('settings.device.moved', count, { name }));
  };
  return (
    <section className="st-card" aria-labelledby="st-device-title">
      <h3 id="st-device-title" className="st-card-title">
        {words.t('settings.device.title')}
      </h3>
      <p className="st-note">{words.t('settings.device.help')}</p>
      <ul className="st-films">
        {films.map((film) => (
          <li key={film.key} className="st-film">
            <Icon name="movie" />
            <span className="st-row-name">{film.name}</span>
            <span className="st-row-count">
              {words.t('lesson.savedWhen', { when: sinceWords(film.savedAt) })}
            </span>
          </li>
        ))}
      </ul>
      {deviceOpen ? (
        <NeutralNote>{words.t('settings.device.open')}</NeutralNote>
      ) : (
        <MenuTrigger>
          <Button variant="secondary" icon="person_add">
            {words.t('settings.device.move')}
          </Button>
          <Popover className="ss-root sb-popover" style={themeStyle}>
            <Menu
              className="sb-menu"
              aria-label={words.t('settings.device.move')}
              items={pupils.map((p) => ({ id: p.pupil.id, name: p.pupil.name }))}
              onAction={(key) => void move(String(key))}
            >
              {(item) => (
                <MenuItem id={item.id} className="sb-menu-item">
                  {item.name}
                </MenuItem>
              )}
            </Menu>
          </Popover>
        </MenuTrigger>
      )}
    </section>
  );
}
