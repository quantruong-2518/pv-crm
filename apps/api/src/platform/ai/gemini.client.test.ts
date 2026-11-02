// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AnthropicClient } from './anthropic.client'
import { AiVendorError, type AiRequest } from './ai-client'
import { GeminiClient } from './gemini.client'

/** The recording path against a stubbed SDK: what an upload leaves behind when
 *  the call around it fails. No network: `GoogleGenAI` is replaced whole. */
const sdk = vi.hoisted(() => ({
  upload: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
  stream: vi.fn(),
}))

vi.mock('@google/genai', async (original) => ({
  ...(await original<typeof import('@google/genai')>()),
  GoogleGenAI: class {
    files = { upload: sdk.upload, get: sdk.get, delete: sdk.remove }
    models = { generateContentStream: sdk.stream }
  },
}))

const LIMITS = { maxTokensOut: 100, timeoutMs: 60_000 }
const request: AiRequest = {
  system: 'sys',
  parts: [
    { text: 'before' },
    { recording: { mime: 'audio/mpeg', bytes: Buffer.from('fake') } },
    { text: 'after' },
  ],
}
const chunks = async function* () {
  await Promise.resolve()
  yield { text: '{"a":', candidates: [{}] }
  yield {
    text: '1}',
    candidates: [{ finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 2, thoughtsTokenCount: 1 },
  }
}

describe('GeminiClient with a recording', () => {
  const client = new GeminiClient('stub')

  beforeEach(() => {
    vi.resetAllMocks()
    sdk.upload.mockResolvedValue({ name: 'files/1', uri: 'https://f/1', state: 'ACTIVE' })
    sdk.remove.mockResolvedValue({})
  })

  it('sends the upload as fileData and deletes it after the answer', async () => {
    sdk.stream.mockResolvedValue(chunks())
    const answer = await client.generate('gemini-x', request, {}, LIMITS)
    expect(answer).toMatchObject({ text: '{"a":1}', complete: true, tokensIn: 7, tokensOut: 3 })
    const params = sdk.stream.mock.calls[0]?.[0] as { contents: [{ parts: unknown[] }] }
    expect(params.contents[0].parts).toEqual([
      { text: 'before' },
      { fileData: { fileUri: 'https://f/1', mimeType: 'audio/mpeg' } },
      { text: 'after' },
    ])
    expect(sdk.remove.mock.calls[0]?.[0]).toMatchObject({ name: 'files/1' })
  })

  it('deletes the uploaded file when the call throws', async () => {
    sdk.stream.mockRejectedValue(new Error('socket hang up'))
    await expect(client.generate('gemini-x', request, {}, LIMITS)).rejects.toMatchObject({
      kind: 'transient',
    })
    expect(sdk.remove).toHaveBeenCalledTimes(1)
  })

  it('deletes a file that failed processing, as a transient failure', async () => {
    sdk.upload.mockResolvedValue({ name: 'files/1', uri: 'https://f/1', state: 'FAILED' })
    await expect(client.generate('gemini-x', request, {}, LIMITS)).rejects.toMatchObject({
      kind: 'transient',
    })
    expect(sdk.stream).not.toHaveBeenCalled()
    expect(sdk.remove).toHaveBeenCalledTimes(1)
  })

  it('does not fail the call on a failed delete', async () => {
    sdk.stream.mockResolvedValue(chunks())
    sdk.remove.mockRejectedValue(new Error('gone'))
    await expect(client.generate('gemini-x', request, {}, LIMITS)).resolves.toMatchObject({
      complete: true,
    })
  })

  it('reads a dropped stream as transient, not as a bad answer to retry', async () => {
    sdk.stream.mockResolvedValue(
      (async function* () {
        await Promise.resolve()
        yield { text: '{' }
      })(),
    )
    await expect(client.generate('gemini-x', request, {}, LIMITS)).rejects.toMatchObject({
      kind: 'transient',
    })
  })

  it('carries what a dying stream had counted', async () => {
    sdk.stream.mockResolvedValue(
      (async function* () {
        await Promise.resolve()
        yield {
          text: '{',
          usageMetadata: {
            promptTokenCount: 900,
            candidatesTokenCount: 30,
            thoughtsTokenCount: 10,
          },
        }
        throw new Error('socket hang up')
      })(),
    )
    await expect(client.generate('gemini-x', request, {}, LIMITS)).rejects.toMatchObject({
      kind: 'transient',
      spent: { tokensIn: 900, tokensOut: 40 },
    })
    expect(sdk.remove).toHaveBeenCalledTimes(1)
  })

  it('refuses to count a recording', async () => {
    const failure = client.countTokens('gemini-x', request, 1000)
    await expect(failure).rejects.toBeInstanceOf(AiVendorError)
    await expect(failure).rejects.toMatchObject({ kind: 'refused' })
    expect(sdk.upload).not.toHaveBeenCalled()
  })
})

describe('AnthropicClient with a recording', () => {
  it('refuses before any request', async () => {
    const client = new AnthropicClient('stub')
    await expect(client.generate('claude-x', request, {}, LIMITS)).rejects.toMatchObject({
      kind: 'refused',
    })
  })
})
