import { standingOf, type Standing } from './money'
import { ContractCard, QuoteCard } from './paper-cards'
import type { CarouselItem } from './paper-carousel'
import type { Paper } from './papers'

/** The carousel's cards for each paper. Tint follows the standing; a paper
 *  whose payments this reader may not see wears none. */

const CARD_TONE: Record<Standing['tone'], CarouselItem['tone']> = {
  danger: 'late',
  success: 'ok',
  running: 'run',
}

export function paperItems(papers: Paper[]): CarouselItem[] {
  return papers.map((paper) => {
    if (paper.kind === 'quote') {
      return {
        key: paper.key,
        tone: 'plain',
        children: <QuoteCard paper={paper} />,
      }
    }
    const standing = standingOf(paper.contract)
    return {
      key: paper.key,
      tone: standing ? CARD_TONE[standing.tone] : 'plain',
      children: <ContractCard contract={paper.contract} standing={standing} />,
    }
  })
}
