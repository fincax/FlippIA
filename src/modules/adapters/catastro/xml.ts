/**
 * Minimal XML → object converter for the Catastro OVC `.asmx` responses.
 * Elements become keys (namespaces stripped), repeated siblings become arrays,
 * leaf text becomes strings. Attributes are ignored: the OVC never uses them
 * for data. No external dependency, no entity expansion beyond the five basics.
 */
type Node = Record<string, unknown>;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decode(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e] ?? "";
  });
}

export function xmlToObject(xml: string): Node {
  const src = xml
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, t: string) =>
      t.replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;")),
    );
  let i = 0;
  const root: Node = {};

  const localName = (raw: string) => raw.replace(/^[^:]*:/, "");

  function add(parent: Node, name: string, value: unknown) {
    const existing = parent[name];
    if (existing === undefined) parent[name] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else parent[name] = [existing, value];
  }

  function parseChildren(parent: Node, closing: string | null): void {
    let text = "";
    while (i < src.length) {
      const lt = src.indexOf("<", i);
      if (lt === -1) {
        text += src.slice(i);
        i = src.length;
        break;
      }
      text += src.slice(i, lt);
      i = lt;
      if (src.startsWith("</", i)) {
        const end = src.indexOf(">", i);
        const name = localName(src.slice(i + 2, end).trim());
        i = end + 1;
        if (closing !== null && name === closing) {
          if (Object.keys(parent).length === 0 && text.trim()) parent.__text = decode(text.trim());
          return;
        }
        continue;
      }
      const end = src.indexOf(">", i);
      const rawTag = src.slice(i + 1, end);
      const selfClosing = rawTag.endsWith("/");
      const name = localName(rawTag.replace(/\/$/, "").split(/\s/)[0] ?? "");
      i = end + 1;
      if (!name) continue;
      if (selfClosing) {
        add(parent, name, "");
        continue;
      }
      const child: Node = {};
      parseChildren(child, name);
      const value =
        Object.keys(child).length === 1 && "__text" in child
          ? child.__text
          : Object.keys(child).length
            ? child
            : "";
      add(parent, name, value);
    }
    if (closing === null && Object.keys(parent).length === 0 && text.trim())
      parent.__text = decode(text.trim());
  }

  parseChildren(root, null);
  return root;
}

/** Whether a response body is XML (the OVC `.asmx` services) rather than JSON. */
export function looksLikeXml(body: string): boolean {
  return body.trimStart().startsWith("<");
}

/**
 * Parse an OVC body of either kind into the same shape the JSON services use:
 * the value of the single root element for XML, the parsed JSON otherwise.
 */
export function parseOvcBody(body: string): unknown {
  if (!looksLikeXml(body)) return JSON.parse(body) as unknown;
  const obj = xmlToObject(body);
  const keys = Object.keys(obj);
  return keys.length === 1 ? obj[keys[0]!] : obj;
}
