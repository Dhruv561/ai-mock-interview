// Runs in the page's MAIN world (see manifest.ts — a separate content
// script entry with world: "MAIN"), not the isolated world the rest of the
// extension runs in. This is the only file with access to window.monaco,
// which LeetCode sets as a page global; isolated-world content scripts
// cannot see it. Talks to the isolated world (content/editor.ts) via
// window.postMessage, since both worlds share the same window for that
// purpose even though they don't share JS objects. See architecture.md §D.
//
// No @types/monaco-editor dependency here on purpose — pulling in the full
// type package for two method calls isn't worth it; `any` is deliberate.

const MESSAGE_SOURCE = "ai-mock-interview";
const CODE_EDITOR_CONTAINER_SELECTOR = '[data-track-load="code_editor"]';

interface CodeRequestMessage {
  source: typeof MESSAGE_SOURCE;
  type: "request-code";
}

interface CodeResponseMessage {
  source: typeof MESSAGE_SOURCE;
  type: "code-response";
  code: string | null;
  language: string | null;
}

function isCodeRequestMessage(data: unknown): data is CodeRequestMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as CodeRequestMessage).source === MESSAGE_SOURCE &&
    (data as CodeRequestMessage).type === "request-code"
  );
}

// Minimal structural typing for the slice of Monaco's API used here —
// deliberately not the full @types/monaco-editor package for two method
// calls.
interface MonacoTextModel {
  getValue(): string;
  getLanguageId(): string;
}
interface MonacoEditorInstance {
  getDomNode(): HTMLElement | null;
  getModel(): MonacoTextModel | null;
}
interface MonacoGlobal {
  editor?: {
    getEditors(): MonacoEditorInstance[];
  };
}

/**
 * Multiple Monaco models/editors can exist on a LeetCode problem page (the
 * real code editor, plus e.g. a plaintext scratch model) — disambiguated by
 * checking which editor's DOM node actually lives inside the code editor
 * container, confirmed live rather than assumed.
 */
function findActiveEditor(): MonacoTextModel | null {
  const monacoGlobal = (window as unknown as { monaco?: MonacoGlobal }).monaco;
  if (!monacoGlobal?.editor?.getEditors) return null;

  const container = document.querySelector(CODE_EDITOR_CONTAINER_SELECTOR);
  if (!container) return null;

  const editors = monacoGlobal.editor.getEditors();
  const activeEditor = editors.find((editor) => {
    const domNode = editor.getDomNode();
    return domNode && container.contains(domNode);
  });

  return activeEditor?.getModel() ?? null;
}

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return;
  if (!isCodeRequestMessage(event.data)) return;

  const model = findActiveEditor();

  const response: CodeResponseMessage = {
    source: MESSAGE_SOURCE,
    type: "code-response",
    code: model?.getValue() ?? null,
    language: model?.getLanguageId() ?? null,
  };
  window.postMessage(response, window.location.origin);
});
