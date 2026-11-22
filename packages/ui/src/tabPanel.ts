/**
 * A tab panel of our own, named by its tab as React Aria's `TabPanel` names it (S6, #526).
 *
 * React Aria's `TabPanel` walks every element inside it, after each render and each change in
 * the panel, to see whether the panel itself needs a tab stop; while a menu or popover makes the
 * rest of the page inert, the walk finds nothing and goes through every element. Over a big
 * method in either code editor that was much of an edit's time with the CPU slowed fourfold
 * (spec 14, 3h.3). A panel whose content always has a tab stop of its own doesn't need it.
 *
 * Draw `<div ref={panelRef} role="tabpanel">` beside `<Tabs>`, not in it (React Aria draws what
 * is in `Tabs` twice, once hidden), and give the selected `Tab` `ref={tabRef}`.
 */
import { useCallback, useLayoutEffect, useRef } from 'react';

/** Gives the panel the id the tab's `aria-controls` names, and names it by the tab. */
export function linkTabPanel(tab: Element | null, panel: HTMLElement | null): void {
  const controls = tab?.getAttribute('aria-controls');
  if (!tab || !panel || !controls) return;
  if (panel.id !== controls) panel.id = controls;
  if (panel.getAttribute('aria-labelledby') !== tab.id)
    panel.setAttribute('aria-labelledby', tab.id);
}

/** Refs for the selected tab and the panel, kept linked as either is put on the page. */
export function useTabPanel<T extends HTMLElement = HTMLDivElement>() {
  const panelRef = useRef<T>(null);
  const selected = useRef<HTMLElement | null>(null);
  // The selected tab, linked as it's put on the page: React Aria finds its tabs in a later pass,
  // so an effect alone would run before they're there (S6).
  const tabRef = useCallback((tab: HTMLElement | null) => {
    selected.current = tab;
    linkTabPanel(tab, panelRef.current);
  }, []);
  // And the panel, when it's put on the page after the tab.
  useLayoutEffect(() => linkTabPanel(selected.current, panelRef.current));
  return { tabRef, panelRef };
}
