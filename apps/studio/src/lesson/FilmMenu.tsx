/**
 * The Film menu on the production's title (`07-ux.md` section 9.3): New film, My films, Open a
 * copy, Save a copy and, with a class list, Switch pupil.
 */
import { Icon, useThemeStyle } from '@storystage/ui';
import { Button as AriaButton, Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components';
import { words } from '../strings.ts';

export type FilmAction = 'new' | 'myFilms' | 'openCopy' | 'saveCopy' | 'switchPupil';

export function FilmMenu({
  title,
  pupilName,
  canSwitch,
  onAction,
}: {
  title: string;
  /** The open folder's pupil; `null` for the device's own folder. */
  pupilName: string | null;
  canSwitch: boolean;
  onAction: (action: FilmAction) => void;
}) {
  const themeStyle = useThemeStyle();
  const items: { id: FilmAction; label: string }[] = [
    { id: 'new', label: words.t('film.new') },
    { id: 'myFilms', label: words.t('film.myFilms') },
    { id: 'openCopy', label: words.t('film.openCopy') },
    { id: 'saveCopy', label: words.t('film.saveCopy') },
    ...(canSwitch ? [{ id: 'switchPupil' as const, label: words.t('film.switchPupil') }] : []),
  ];
  return (
    <MenuTrigger>
      <AriaButton className="ls-film-button" aria-label={words.t('film.menu', { title })}>
        <span className="ls-film-title">{title}</span>
        {pupilName && <span className="ls-film-pupil"> · {pupilName}</span>}
        <Icon name="arrow_drop_down" size={20} />
      </AriaButton>
      <Popover className="ss-root sb-popover" style={themeStyle}>
        <Menu className="sb-menu" items={items} onAction={(key) => onAction(key as FilmAction)}>
          {(item) => (
            <MenuItem id={item.id} className="sb-menu-item">
              {item.label}
            </MenuItem>
          )}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
