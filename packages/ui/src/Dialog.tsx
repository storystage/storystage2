import type { ReactNode } from 'react';
import { Dialog as AriaDialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { Button } from './Button.tsx';
import { Icon, type IconName } from './Icon.tsx';
import { messages } from './messages.ts';
import { useThemeStyle } from './ThemeRoot.tsx';

export interface DialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  icon?: IconName;
  /** Width in px; Direction A's dialogs are 900–920 (set-up, editor switch) or narrower. */
  width?: number;
  /** Whether Escape and a click outside close it. Off for steps that must be finished, such as set-up. */
  isDismissable?: boolean;
  children: ReactNode;
}

/**
 * A dialog (Direction A): radius 20 over a dark scrim, titled, with a 44 px Close button. Focus
 * moves into it, stays inside while it is open, and returns where it was when it closes.
 */
export function Dialog({
  isOpen,
  onOpenChange,
  title,
  icon,
  width = 640,
  isDismissable = true,
  children,
}: DialogProps) {
  // The dialog is drawn in a portal, outside ThemeRoot, so it carries the theme itself.
  const themeStyle = useThemeStyle();
  return (
    <ModalOverlay
      className="ss-root ss-scrim"
      style={themeStyle}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={isDismissable}
      isKeyboardDismissDisabled={!isDismissable}
    >
      <Modal className="ss-modal" style={{ width: `min(${width}px, calc(100vw - 32px))` }}>
        <AriaDialog className="ss-dialog">
          {({ close }) => (
            <>
              <div className="ss-dialog-head">
                {icon && <Icon name={icon} size={28} />}
                <Heading slot="title" className="ss-dialog-title">
                  {title}
                </Heading>
                {isDismissable && (
                  <Button
                    variant="quiet"
                    icon="close"
                    aria-label={messages.t('dialog.close')}
                    onPress={close}
                  />
                )}
              </div>
              {children}
            </>
          )}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}
