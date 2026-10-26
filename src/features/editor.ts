import { basicSetup } from "codemirror";
import { EditorView, keymap } from "@codemirror/view";
import { Compartment, EditorState, Prec, type Extension } from "@codemirror/state";
import { indentWithTab, undo, redo, undoDepth, redoDepth } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting, indentOnInput } from "@codemirror/language";
import { mermaid, mermaidTags } from "codemirror-lang-mermaid";
import { linter, lintGutter, forceLinting, type Diagnostic } from "@codemirror/lint";
import { tags as t } from "@lezer/highlight";
import { validateMermaid, type MermaidIssue } from "../core/mermaid";
import { isDarkTheme, type VisualTheme } from "../core/appearance";

/** Syntax palette, expressed with the porcelain design tokens. */
const porcelainHighlight = HighlightStyle.define([
  { tag: mermaidTags.diagramName, color: "var(--code-diagram)", fontWeight: "700" },
  { tag: t.keyword, color: "var(--code-keyword)", fontWeight: "600" },
  { tag: t.operator, color: "var(--ink-1)" },
  { tag: t.definition(t.variableName), color: "var(--code-def)", fontWeight: "600" },
  { tag: t.variableName, color: "var(--code-var)" },
  { tag: [t.typeName, t.className, t.namespace], color: "var(--code-type)" },
  { tag: [t.labelName, t.attributeName, t.propertyName], color: "var(--code-string)" },
  { tag: [t.string, t.special(t.string)], color: "var(--code-string)" },
  { tag: t.number, color: "var(--code-number)" },
  { tag: [t.atom, t.bool, t.null], color: "var(--code-atom)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--code-comment)", fontStyle: "italic" },
  { tag: [t.punctuation, t.separator, t.bracket], color: "var(--code-punct)" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "bold" },
]);

function editorTheme(theme: VisualTheme): Extension {
  return EditorView.theme(
    {
      "&": { backgroundColor: "transparent", color: "var(--text-primary)" },
      ".cm-content": { fontFamily: "var(--font-mono)", caretColor: "var(--accent)" },
      ".cm-scroller": { fontFamily: "var(--font-mono)" },
      ".cm-gutters": { backgroundColor: "transparent", color: "var(--text-subtle)", border: "none" },
      ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--accent) 8%, transparent)" },
      ".cm-activeLineGutter": { color: "var(--text-primary)" },
      ".cm-selectionBackground, ::selection": { backgroundColor: "var(--selection)" },
      "&.cm-focused": { outline: "none" },
    },
    { dark: isDarkTheme(theme) },
  );
}

export interface EditorOptions {
  parent: HTMLElement;
  initialDoc: string;
  /** Called on every keystroke with the new source. */
  onDocChanged: (code: string) => void;
  /** Called after the debounced validation finishes. */
  onValidated: (code: string, issues: MermaidIssue[]) => void;
  visualTheme: VisualTheme;
}

export interface EditorHandle {
  view: EditorView;
  focus: () => void;
  replaceDocument: (document: string, focus?: boolean) => void;
  setVisualTheme: (theme: VisualTheme) => void;
  setReadOnly: (readOnly: boolean) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

function toDiagnostic(view: EditorView, issue: MermaidIssue): Diagnostic {
  const doc = view.state.doc;
  const line = issue.line;
  let from = 0;
  let to = 0;

  if (typeof line === "number" && line >= 1) {
    const target = doc.line(Math.min(line, doc.lines));
    from = target.from;
    to = target.to;
  }

  if (to <= from) {
    to = Math.min(from + 1, doc.length);
  }

  return { from, to, severity: "error", message: issue.message };
}

export function createEditor(options: EditorOptions): EditorHandle {
  const themeCompartment = new Compartment();
  const editableCompartment = new Compartment();
  const lintSource = async (view: EditorView): Promise<Diagnostic[]> => {
    const code = view.state.doc.toString();
    if (code.trim().length === 0) {
      options.onValidated(code, []);
      return [];
    }
    const issues = await validateMermaid(code);
    options.onValidated(code, issues);
    return issues.map((issue) => toDiagnostic(view, issue));
  };

  const extensions: Extension[] = [
    basicSetup,
    keymap.of([indentWithTab]),
    EditorView.lineWrapping,
    indentOnInput(),
    Prec.highest(syntaxHighlighting(porcelainHighlight)),
    mermaid(),
    themeCompartment.of(editorTheme(options.visualTheme)),
    editableCompartment.of([EditorState.readOnly.of(false), EditorView.editable.of(true)]),
    // The editor is clipped to its well, so CodeMirror's auto-positioned hover
    // tooltip can escape the visible area. Details are available from the
    // syntax-status popup instead; retain the gutter and underlined ranges.
    lintGutter({ tooltipFilter: () => [] }),
    linter(lintSource, { delay: 340, tooltipFilter: () => [] }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        options.onDocChanged(update.state.doc.toString());
      }
    }),
  ];

  const view = new EditorView({
    parent: options.parent,
    state: EditorState.create({ doc: options.initialDoc, extensions }),
  });

  // validate the initial document (the linter only runs on change otherwise)
  requestAnimationFrame(() => forceLinting(view));

  return {
    view,
    focus: () => view.focus(),
    replaceDocument: (document, focus = true) => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: document },
      });
      if (focus) view.focus();
    },
    setVisualTheme: (theme) => {
      view.dispatch({ effects: themeCompartment.reconfigure(editorTheme(theme)) });
    },
    setReadOnly: (readOnly) => {
      view.dispatch({
        effects: editableCompartment.reconfigure([
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
        ]),
      });
    },
    undo: () => { void undo(view); },
    redo: () => { void redo(view); },
    canUndo: () => undoDepth(view.state) > 0,
    canRedo: () => redoDepth(view.state) > 0,
  };
}
