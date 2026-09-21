import { describe, expect, it } from 'vitest'
import { CAMPAIGN_START_MAX_WAVES } from '@pv/contracts'
import {
  commitDraft,
  composerBlocker,
  effectiveWaves,
  emptyComposerState,
  type ComposerState,
} from './wave-draft'

const valid = (state: ComposerState, n: number): ComposerState => ({
  ...state,
  label: `Phase ${n}`,
  subject: `Subject ${n}`,
  body: `Body ${n}`,
})

describe('shared mail wave draft', () => {
  it('does not silently discard a partially written next phase', () => {
    const first = commitDraft(valid(emptyComposerState(), 1))
    const partial = { ...first, subject: 'Đang viết đợt hai' }

    expect(effectiveWaves(partial)).toHaveLength(1)
    expect(composerBlocker(partial)).toContain('tên đợt')
  })

  it('allows a finished chain with an untouched empty next row', () => {
    const state = commitDraft(valid(emptyComposerState(), 1))
    expect(composerBlocker(state)).toBeNull()
  })

  it('never emits more than the shared wave ceiling', () => {
    let state = emptyComposerState()
    for (let n = 1; n <= CAMPAIGN_START_MAX_WAVES; n += 1) {
      state = commitDraft(valid(state, n))
    }
    state = valid(state, CAMPAIGN_START_MAX_WAVES + 1)

    expect(effectiveWaves(state)).toHaveLength(CAMPAIGN_START_MAX_WAVES)
  })
})
