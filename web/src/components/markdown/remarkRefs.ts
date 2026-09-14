import { tokenizeRefs } from '../../lib/refs';

// Minimal mdast types (avoid pulling @types/mdast).
interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

const SKIP = new Set(['code', 'inlineCode', 'link', 'linkReference', 'definition', 'html', 'image']);

/** Turns #123, [[Title]] and @handle inside text into "qg-ref:" links. */
export default function remarkRefs() {
  return (tree: MdNode) => {
    const walk = (node: MdNode) => {
      if (!node.children || SKIP.has(node.type)) return;
      const next: MdNode[] = [];
      for (const child of node.children) {
        if (child.type === 'text' && child.value) {
          const tokens = tokenizeRefs(child.value);
          if (tokens.length === 1 && tokens[0].type === 'text') {
            next.push(child);
            continue;
          }
          for (const t of tokens) {
            if (t.type === 'text') next.push({ type: 'text', value: t.value });
            else if (t.type === 'requirement')
              next.push({ type: 'link', url: `qg-ref:requirement:${encodeURIComponent(t.key)}`, children: [{ type: 'text', value: t.raw }] });
            else if (t.type === 'wikilink')
              next.push({ type: 'link', url: `qg-ref:wikilink:${encodeURIComponent(t.target)}`, children: [{ type: 'text', value: t.alias ?? t.target }] });
            else next.push({ type: 'link', url: `qg-ref:user:${encodeURIComponent(t.handle)}`, children: [{ type: 'text', value: t.raw }] });
          }
        } else {
          walk(child);
          next.push(child);
        }
      }
      node.children = next;
    };
    walk(tree);
  };
}
