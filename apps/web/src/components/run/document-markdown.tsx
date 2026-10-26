import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/* Element styles by descendant selector: the markdown tree is not ours to
   class, and the app carries no typography plugin. No rule lines (law 4). */
const PROSE =
  'text-[13.5px] leading-[1.7] [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-[20px] [&_h1]:font-semibold ' +
  '[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-[17px] [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold ' +
  '[&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline ' +
  '[&_code]:bg-surface-ink/9 [&_code]:rounded [&_code]:px-1 [&_code]:font-mono [&_pre]:bg-surface-ink/9 ' +
  '[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:p-3 [&_blockquote]:bg-surface-ink/[4.5%] ' +
  '[&_blockquote]:text-muted-foreground [&_blockquote]:rounded-md [&_blockquote]:px-3 [&_blockquote]:py-1 ' +
  '[&_table]:my-2 [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_tr]:even:bg-surface-ink/[4.5%] ' +
  '[&_img]:max-w-full'

/** Markdown as React elements — react-markdown never writes raw HTML and drops
 *  `javascript:` links, so a stranger's file cannot run in the page. */
export default function MarkdownView({ text }: { text: string }) {
  return (
    <div className={PROSE}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{ a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}
      >
        {text}
      </Markdown>
    </div>
  )
}
