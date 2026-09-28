import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import {
  EditorContent,
  Node,
  mergeAttributes,
  nodeInputRule,
  nodePasteRule,
  useEditor,
  useEditorState,
} from '@tiptap/react'
import { Bold as BoldMark } from '@tiptap/extension-bold'
import { Document } from '@tiptap/extension-document'
import { HardBreak } from '@tiptap/extension-hard-break'
import { Italic as ItalicMark } from '@tiptap/extension-italic'
import { BulletList, ListItem } from '@tiptap/extension-list'
import { Paragraph } from '@tiptap/extension-paragraph'
import { Text } from '@tiptap/extension-text'
import { Placeholder, UndoRedo } from '@tiptap/extensions'
import { Bold, Button, Icon, Italic, List, Plus, cn, type IconGlyph } from '@pv/ui'
import type { MailMergeKey } from '@pv/contracts'
import { MERGE_LABEL } from '@/data/mail-hints'
import {
  MERGE_NODE,
  MERGE_PATTERN,
  docToMarkdown,
  isMergeKey,
  markdownToDoc,
} from './mail-rich-body-model'

/** A "write it like Gmail" box for the mail body — a trial option beside the
 *  markdown textarea, emitting the same markdown so either can edit one body.
 *
 *  The schema holds exactly what the mail grammar can say (paragraph, line
 *  break, flat bullet list, bold, italic, merge chip), so a paste from Word or
 *  Gmail is reduced to it by the editor itself and nothing the letter cannot
 *  carry ever shows on screen. Bold and italic exclude each other for the same
 *  reason: the grammar does not nest them. */

const QUICK_INSERT: readonly MailMergeKey[] = ['contact_name', 'account']

const MergeChip = Node.create({
  name: MERGE_NODE,
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes: () => ({
    key: {
      default: null,
      parseHTML: (el) => el.getAttribute('data-merge-key'),
      renderHTML: (attrs) => ({ 'data-merge-key': attrs['key'] as string }),
    },
  }),
  parseHTML: () => [
    {
      tag: 'span[data-merge-key]',
      getAttrs: (el) => (isMergeKey(el.getAttribute('data-merge-key') ?? '') ? null : false),
    },
  ],
  renderHTML: ({ node, HTMLAttributes }) => [
    'span',
    mergeAttributes(HTMLAttributes, {
      class:
        'bg-primary/24 text-accent-foreground rounded-sm px-1 [&.ProseMirror-selectednode]:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_55%,transparent)]',
    }),
    MERGE_LABEL[node.attrs['key'] as MailMergeKey],
  ],
  renderText: ({ node }) => `{{${node.attrs['key'] as string}}}`,
  addInputRules() {
    const find = new RegExp(`${MERGE_PATTERN}$`)
    return [nodeInputRule({ find, type: this.type, getAttributes: (m) => ({ key: m[1] }) })]
  },
  addPasteRules() {
    const find = new RegExp(MERGE_PATTERN, 'g')
    return [nodePasteRule({ find, type: this.type, getAttributes: (m) => ({ key: m[1] }) })]
  },
})

function extensionsFor(placeholder: string) {
  return [
    Document,
    Paragraph,
    Text,
    HardBreak,
    BoldMark.extend({ excludes: 'bold italic' }),
    ItalicMark.extend({ excludes: 'italic bold' }),
    BulletList,
    /* Paragraph only: the grammar has no nested list, so Tab has nowhere to sink. */
    ListItem.extend({ content: 'paragraph' }),
    MergeChip,
    UndoRedo,
    Placeholder.configure({ placeholder }),
  ]
}

/** Same ground, type and rings as `Textarea` in `@pv/ui`, so the two modes read as one field. */
const SURFACE =
  'min-h-112 p-3 text-[12.5px] leading-[1.7] outline-none [&>*+*]:mt-3 [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5 ' +
  '[&_.is-editor-empty:first-child]:before:text-muted-foreground [&_.is-editor-empty:first-child]:before:pointer-events-none [&_.is-editor-empty:first-child]:before:float-left [&_.is-editor-empty:first-child]:before:h-0 [&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]'

export function MailRichBody({
  value,
  onChange,
  invalid = false,
  placeholder = '',
}: {
  value: string
  onChange: (markdown: string) => void
  invalid?: boolean
  placeholder?: string
}) {
  /* What this box last handed up. A `value` equal to it is our own echo; any
     other value came from outside (reset on open) and replaces the doc. */
  const emitted = useRef(value)
  const [extensions] = useState(() => extensionsFor(placeholder))
  const [content] = useState(() => markdownToDoc(value))
  const editorProps = useMemo(
    () => ({
      attributes: {
        class: SURFACE,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Nội dung',
        'aria-invalid': String(invalid),
      },
    }),
    [invalid],
  )

  const editor = useEditor({
    extensions,
    content,
    editorProps,
    onUpdate: ({ editor: current }) => {
      const markdown = docToMarkdown(current.getJSON())
      if (markdown === emitted.current) return
      emitted.current = markdown
      onChange(markdown)
    },
    /* Snap the doc to what the saved markdown reads back as — e.g. a `- x` typed
       after Shift+Enter becomes the bullet the letter will show. On blur, not per
       keystroke, so the caret never jumps mid-sentence. */
    onBlur: ({ editor: current }) => {
      const saved = markdownToDoc(docToMarkdown(current.getJSON()))
      if (JSON.stringify(saved) !== JSON.stringify(current.getJSON()))
        current.commands.setContent(saved, { emitUpdate: false })
    },
  })

  useEffect(() => {
    if (value === emitted.current) return
    emitted.current = value
    editor.commands.setContent(markdownToDoc(value), { emitUpdate: false })
  }, [editor, value])

  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      list: e.isActive('bulletList'),
    }),
  })

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        <ToolButton
          icon={Bold}
          label="Đậm (Ctrl+B)"
          active={active.bold}
          onPress={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolButton
          icon={Italic}
          label="Nghiêng (Ctrl+I)"
          active={active.italic}
          onPress={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolButton
          icon={List}
          label="Danh sách chấm đầu dòng"
          active={active.list}
          onPress={() => editor.chain().focus().toggleBulletList().run()}
        />
        <span className="text-muted-foreground ml-2 text-[11px]">Chèn</span>
        {QUICK_INSERT.map((key) => (
          <Button
            key={key}
            size="sm"
            variant="ghost"
            type="button"
            className="pointer-coarse:h-12"
            onMouseDown={keepSelection}
            onClick={() =>
              editor.chain().focus().insertContent({ type: MERGE_NODE, attrs: { key } }).run()
            }
          >
            <Icon icon={Plus} size={14} />
            {MERGE_LABEL[key]}
          </Button>
        ))}
      </div>
      <div
        className={cn(
          'motion-std bg-input text-foreground rounded-md',
          'focus-within:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_55%,transparent)]',
          invalid &&
            'text-destructive-foreground shadow-[0_0_0_2px_color-mix(in_srgb,var(--destructive)_50%,transparent)]',
        )}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

/** Pressing a button would move focus off the editor and lose the selection it acts on. */
const keepSelection = (event: MouseEvent) => event.preventDefault()

function ToolButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: IconGlyph
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={keepSelection}
      onClick={onPress}
      className={cn(
        'motion-std pointer-coarse:size-12 flex size-8 items-center justify-center rounded-md focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_55%,transparent)] focus-visible:outline-none',
        active
          ? 'bg-primary/24 text-accent-foreground'
          : 'text-muted-foreground hover:bg-surface-ink/9 hover:text-foreground',
      )}
    >
      <Icon icon={icon} size={16} />
    </button>
  )
}
