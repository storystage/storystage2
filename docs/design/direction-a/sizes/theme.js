// The light theme (decision 0032), drawn by swapping each Direction A colour for its light value by
// role: a fill, text, a border, a shadow or a gradient. Open any screen with ?theme=light.
// The 3D scene, the film player and the white sketch paper are art, not theme, and keep their colours.
// The values are tabled in ../README.md, "Colour, light theme". Mock-ups only: the app will swap
// token values, not inline styles.
const LIGHT = {
  fill: {
    '#13100E': '#F6F1E9', // stage-0: page and stage
    '#0E0C0B': '#F1EBE1', // stage-0b: Screening room
    '#15120F': '#F3EEE6',
    '#161412': '#F3EEE6',
    '#1E1915': '#F0EAE1', // panel-1: rails, code area
    '#241E1A': '#FBF8F3', // panel-2: panels, sidebars
    '#2F2822': '#FFFFFF', // panel-3: cards
    '#2E2822': '#FFFFFF',
    '#3A3129': '#E9E1D5', // panel-4: raised chips, thumbnails
    '#342B24': '#EFE6D9', // band: panel title bands
    '#3A3027': '#EFE6D9', // event hat
    '#2A231E': '#EDE5D9', // inactive mode tab
    '#2B2520': '#ECE6DD', // unavailable button
    '#2E2519': '#FCEFD0', // amber-tint: selected card
    '#3A2E1A': '#F9E5BC',
    '#5A4628': '#F2D79B',
    '#2A1E19': '#FDECE5', // flag-bg
    '#173A36': '#D3F2EE', // prompter-bg: Prompter icon disc
    '#F5EFE6': '#2A2420', // chalk as a fill: selected segment, strong button
    '#5A4B3D': '#CDBFAE', // line-1 used as a fill: dividers, timeline
  },
  text: {
    '#F5EFE6': '#1F1A17', // chalk: primary text
    '#E3D9CC': '#3A322B', // chalk-2: body text
    '#C2B6A7': '#665A4E', // muted
    '#8A7E70': '#6E6253',
    '#AFA394': '#74685B', // placeholder
    '#8F8476': '#8A7D70', // unavailable
    '#F4B740': '#8F5600', // amber as text
    '#6FD3C7': '#0B6E64', // the Prompter as text
    '#7BD88F': '#1C7431', // ok, Checked, Matches
    '#FFB59A': '#B13D14', // flag, Look at
    '#E58A6A': '#B0412A', // stop
    '#D8CDBF': '#5A4F44', // Planned
    '#8FBBFF': '#2357B5', // Staged
    '#BBA6FF': '#6443C0', // Coded
  },
  border: {
    '#5A4B3D': '#D5C8B8', // line-1: dividers
    '#3D342C': '#DDD3C6',
    '#6A5E52': '#9C8E7E',
    '#7A6A58': '#8C7B68', // dashed drop zones
    '#8A7B6A': '#7D6E5D', // line-2: control outlines, 3:1 or more
    '#8A7E70': '#7D6E5D',
    '#F4B740': '#B87300', // amber outlines: selection
    '#6FD3C7': '#0E7C70', // the Prompter's outline
    '#FFB59A': '#C2522B', // flag outline
    '#E58A6A': '#B0412A', // stop outline
  },
  shadow: {
    '#13100E': '#F6F1E9', // the 2px gap of a focus ring takes its surface's colour
    '#241E1A': '#FBF8F3',
    '#2A1E19': '#FDECE5',
    '#2E2519': '#FCEFD0',
    '#2F2822': '#FFFFFF',
    '#F4B740': '#A35F00', // focus ring
    '#F5EFE6': '#1F1A17', // focus ring on amber surfaces
    '#5A4B3D': '#CDBFAE', // inset borders
  },
  gradient: {
    '#13100E': '#F6F1E9',
    '#3A2E22': '#F1E2C6', // the warm glow behind the frame canvas
    '#5A4630': '#EED8AE',
    '#3D342C': '#E4D9CB',
  },
};

const ART = '[data-r=scene-view], [data-r=player], [data-r=frame-canvas], svg, [data-art]';
const USES = {
  fill: ['background-color'],
  text: ['color'],
  border: ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline-color'],
  shadow: ['box-shadow'],
  gradient: ['background-image'],
};

const hex = (r, g, b) => '#' + [r, g, b].map((v) => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase();

function swap(value, map, keepAmber) {
  return value.replace(/rgba?\(([^)]+)\)/g, (whole, inner) => {
    const [r, g, b, a = '1'] = inner.split(/[\s,/]+/).filter(Boolean);
    const from = hex(r, g, b);
    if (keepAmber && from === '#F4B740') return whole;
    if (Number(a) < 1) {
      if (from === '#000000') return 'rgba(60, 40, 20, 0.22)';
      return whole; // glows and scrims keep their colour
    }
    return map[from] ?? whole;
  });
}

function applyLight() {
  const screen = document.querySelector('[data-r=screen]');
  document.body.style.background = '#F6F1E9';
  // Art keeps its own colours, including the chips and captions drawn over it.
  for (const art of screen.querySelectorAll('[data-r=scene-view], [data-r=player]')) art.style.color = '#F5EFE6';
  const elements = [screen, ...screen.querySelectorAll('[style]')].filter((el) => el === screen || !el.closest(ART));
  // Chalk fills (selected segments, strong buttons, number discs) become ink, so the sketch-ink
  // text on them turns light; on white cards it stays dark.
  for (const el of elements) {
    if (/245, 239, 230/.test(el.style.backgroundColor)) el.dataset.inverted = '';
  }
  for (const el of elements) {
    for (const [use, props] of Object.entries(USES)) {
      for (const prop of props) {
        const value = el.style.getPropertyValue(prop);
        if (!value) continue;
        if (use === 'text' && /22, 20, 18/.test(value)) {
          if (el.closest('[data-inverted]')) el.style.setProperty(prop, '#FBF8F3');
          continue;
        }
        // Gradients: only the big warm glows change; thumbnails are art.
        if (use === 'gradient' && el.offsetWidth < 300) continue;
        // The 3 px amber frame stays amber: with the active tab it reads as one shape.
        const frame = use === 'border' && parseFloat(el.style.borderTopWidth) >= 3;
        el.style.setProperty(prop, swap(value, LIGHT[use], frame));
      }
    }
  }
  document.documentElement.dataset.theme = 'light';
}

if (new URLSearchParams(location.search).get('theme') === 'light') applyLight();
