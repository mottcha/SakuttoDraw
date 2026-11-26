// Syncs localized display labels for the 5 active SakuttoDraw fonts in Excalidraw's FontPicker.
import { FONT_FAMILY } from '@excalidraw/excalidraw';
import {
  EXCALIDRAW_FONT_PICKER_TESTIDS,
  EXCALIDRAW_SELECTORS,
} from '../../excalidraw/domContract';
import { getMessages, type MessageCatalog } from '../../i18n/messages';
import { runtime } from './runtime';

function resolveFontLabelMap(t: MessageCatalog): Readonly<Record<number, string>> {
  return {
    [FONT_FAMILY.Excalifont]: t.fontLabelHandDrawn,
    [FONT_FAMILY.Nunito]: t.fontLabelNormal,
    [FONT_FAMILY['Lilita One']]: t.fontLabelPop,
    [FONT_FAMILY.Cascadia]: t.fontLabelCode,
    [FONT_FAMILY['Comic Shanns']]: t.fontLabelCodeHandDrawn,
  };
}

const TOP_PICK_TESTID_TO_FAMILY_ID: Readonly<Record<string, number>> = {
  [EXCALIDRAW_FONT_PICKER_TESTIDS.handDrawn]: FONT_FAMILY.Excalifont,
  [EXCALIDRAW_FONT_PICKER_TESTIDS.normal]: FONT_FAMILY.Nunito,
  [EXCALIDRAW_FONT_PICKER_TESTIDS.code]: FONT_FAMILY['Comic Shanns'],
  [`${EXCALIDRAW_FONT_PICKER_TESTIDS.prefix}${FONT_FAMILY.Excalifont}`]: FONT_FAMILY.Excalifont,
  [`${EXCALIDRAW_FONT_PICKER_TESTIDS.prefix}${FONT_FAMILY.Nunito}`]: FONT_FAMILY.Nunito,
  [`${EXCALIDRAW_FONT_PICKER_TESTIDS.prefix}${FONT_FAMILY['Lilita One']}`]: FONT_FAMILY['Lilita One'],
  [`${EXCALIDRAW_FONT_PICKER_TESTIDS.prefix}${FONT_FAMILY.Cascadia}`]: FONT_FAMILY.Cascadia,
  [`${EXCALIDRAW_FONT_PICKER_TESTIDS.prefix}${FONT_FAMILY['Comic Shanns']}`]: FONT_FAMILY['Comic Shanns'],
};

/**
 * Updates font dropdown items and Top Picks tooltips to SakuttoDraw's localized labels.
 */
export function syncFontPicker(root: ParentNode = document): boolean {
  const t = getMessages(runtime.prefs.lang);
  const labelMap = resolveFontLabelMap(t);
  let touched = false;

  const menu = root.querySelector(EXCALIDRAW_SELECTORS.fontPickerMenu);
  if (menu) {
    const items = menu.querySelectorAll<HTMLButtonElement>('button[value]');
    items.forEach((btn) => {
      const id = Number(btn.value);
      const label = labelMap[id];
      if (!label) return;
      if (btn.getAttribute('title') !== label) {
        btn.setAttribute('title', label);
        touched = true;
      }
      const textSpan = btn.querySelector<HTMLElement>(`${EXCALIDRAW_SELECTORS.dropdownMenuItemText} span`);
      if (textSpan && textSpan.textContent !== label) {
        textSpan.textContent = label;
        touched = true;
      }
    });
  }

  const topPicksList = root.querySelectorAll<HTMLElement>(
    `${EXCALIDRAW_SELECTORS.fontPickerTopPicks} button[data-testid]`,
  );
  topPicksList.forEach((btn) => {
    const testId = btn.getAttribute('data-testid') || '';
    const familyId = TOP_PICK_TESTID_TO_FAMILY_ID[testId];
    if (familyId === undefined) return;
    const label = labelMap[familyId];
    if (!label) return;
    if (btn.getAttribute('title') !== label) {
      btn.setAttribute('title', label);
      btn.setAttribute('aria-label', label);
      touched = true;
    }
  });

  return touched;
}
