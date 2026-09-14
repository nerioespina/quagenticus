const PROPS = [
  'boxSizing', 'width', 'height', 'overflowX', 'overflowY', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
  'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent', 'letterSpacing', 'wordSpacing', 'tabSize', 'whiteSpace', 'wordWrap',
] as const;

/** Viewport coordinates of a textarea caret (mirror-div technique). */
export function caretCoordinates(el: HTMLTextAreaElement, position: number): { top: number; left: number; height: number } {
  const div = document.createElement('div');
  const style = window.getComputedStyle(el);
  const s = div.style as unknown as Record<string, string>;
  for (const p of PROPS) s[p] = (style as unknown as Record<string, string>)[p];
  s.position = 'absolute';
  s.visibility = 'hidden';
  s.whiteSpace = 'pre-wrap';
  s.wordWrap = 'break-word';
  div.textContent = el.value.slice(0, position);
  const span = document.createElement('span');
  span.textContent = el.value.slice(position) || '.';
  div.appendChild(span);
  document.body.appendChild(div);
  const rect = el.getBoundingClientRect();
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4;
  const coords = {
    top: rect.top + span.offsetTop + parseFloat(style.borderTopWidth) - el.scrollTop,
    left: rect.left + span.offsetLeft + parseFloat(style.borderLeftWidth) - el.scrollLeft,
    height: lineHeight,
  };
  document.body.removeChild(div);
  return coords;
}
