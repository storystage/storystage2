// Scales each fixed-size drawing (data-fit="WxH": the frame canvas, the film player) to the
// room its column leaves, as the app will. Mock-ups only.
function fit() {
  for (const el of document.querySelectorAll('[data-fit]')) {
    const [w, h] = el.dataset.fit.split('x').map(Number);
    el.style.zoom = '1';
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    const parent = el.parentElement;
    const cs = getComputedStyle(parent);
    const gap = parseFloat(cs.rowGap) || 0;
    const siblings = [...parent.children].filter(
      (c) => c !== el && getComputedStyle(c).position !== 'absolute' && c.offsetHeight > 0,
    );
    const used = siblings.reduce((sum, c) => sum + c.offsetHeight + gap, 0);
    const roomW = parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const roomH = parent.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - used;
    el.style.zoom = String(Math.min(1.4, roomW / w, roomH / h));
  }
}
addEventListener('resize', fit);
document.fonts.ready.then(fit);
fit();
