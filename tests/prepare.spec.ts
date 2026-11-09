import { describe, expect, it } from 'vitest'
import { classifyUpstreamError, inlineRemoteImages, prepareChatBody, regionOf } from '../src/upstream.ts'

describe('prepareChatBody', () => {
  it('forces stream true', () => {
    expect(JSON.parse(prepareChatBody('{"model":"auto","messages":[]}'))['stream']).toBe(true)
  })

  it('keeps invalid JSON untouched', () => {
    expect(prepareChatBody('not json')).toBe('not json')
  })

  it('flattens object tool_choice auto', () => {
    const body = JSON.parse(prepareChatBody(JSON.stringify({ tool_choice: { type: 'auto' } })))
    expect(body['tool_choice']).toBe('auto')
  })

  it('flattens named function tool_choice to the function name', () => {
    const body = JSON.parse(prepareChatBody(JSON.stringify({
      tool_choice: { type: 'function', function: { name: 'grep' } },
    })))
    expect(body['tool_choice']).toBe('grep')
  })

  it('drops tool_choice and tools for none', () => {
    const body = JSON.parse(prepareChatBody(JSON.stringify({
      tool_choice: { type: 'none' },
      tools: [{ type: 'function', function: { name: 'grep' } }],
    })))
    expect('tool_choice' in body).toBe(false)
    expect('tools' in body).toBe(false)
  })

  it('drops an unrecognized object tool_choice', () => {
    const body = JSON.parse(prepareChatBody(JSON.stringify({ tool_choice: { type: 'weird' } })))
    expect('tool_choice' in body).toBe(false)
  })

  it('preserves the reasoning_effort the model picker selects', () => {
    const body = JSON.parse(prepareChatBody(JSON.stringify({
      model: 'glm-5.3',
      messages: [{ role: 'user', content: 'hi' }],
      reasoning_effort: 'xhigh',
    })))
    expect(body['reasoning_effort']).toBe('xhigh')
    expect(body['stream']).toBe(true)
  })

  it('drops reasoning_effort "off" so Default means "model default"', () => {
    // Regression: `off` used to reach the wire as the string "off" (the adapter
    // mapped it to a string whenever canDisableThinking was true, and pi-ai
    // transmits a map string verbatim). CodeBuddy's ladder is low…max only and
    // rejects everything else with code 11150, so every Default selection made
    // the turn fail. Omitting the field is how "no explicit effort" is spelled.
    const body = JSON.parse(prepareChatBody(JSON.stringify({
      model: 'glm-5.3',
      messages: [{ role: 'user', content: 'hi' }],
      reasoning_effort: 'off',
    })))
    expect(body).not.toHaveProperty('reasoning_effort')
  })

  it('drops any reasoning_effort outside the upstream vocabulary', () => {
    // pi-ai resolves an unknown level through `thinkingLevelMap[level] ?? level`,
    // so a level the map holds as null falls back to its own name. Forwarding a
    // value the upstream does not recognize fails the turn; dropping it degrades
    // to the model default instead.
    //
    // `medium` is deliberately NOT in this list: it is a legitimate upstream
    // value (some models declare it), so the shim has no business removing it
    // even when the selected model's own ladder omits it — that trimming is the
    // adapter's job via `thinkingLevelMap`, and the picker never offers it.
    for (const effort of ['off', 'none', 'minimal', '', 'HIGH', 42, null]) {
      const body = JSON.parse(prepareChatBody(JSON.stringify({
        model: 'glm-5.3',
        messages: [{ role: 'user', content: 'hi' }],
        reasoning_effort: effort,
      })))
      expect(body).not.toHaveProperty('reasoning_effort')
    }
  })

  it('keeps every effort value the upstream actually accepts', () => {
    for (const effort of ['low', 'medium', 'high', 'xhigh', 'max']) {
      const body = JSON.parse(prepareChatBody(JSON.stringify({
        model: 'glm-5.3',
        messages: [{ role: 'user', content: 'hi' }],
        reasoning_effort: effort,
      })))
      expect(body['reasoning_effort']).toBe(effort)
    }
  })

  it('leaves a body without reasoning_effort untouched', () => {
    const body = JSON.parse(prepareChatBody(JSON.stringify({
      model: 'glm-5.3',
      messages: [{ role: 'user', content: 'hi' }],
    })))
    expect(body).not.toHaveProperty('reasoning_effort')
    expect(body['stream']).toBe(true)
  })

  it('rewrites developer messages to system (upstream rejects developer)', () => {
    const body = JSON.parse(prepareChatBody(JSON.stringify({
      model: 'deepseek-v4-flash',
      messages: [
        { role: 'developer', content: 'system prompt' },
        { role: 'user', content: 'hi' },
      ],
      reasoning_effort: 'max',
    })))
    const roles = body['messages'].map((message: { role: string }) => message.role)
    expect(roles).toEqual(['system', 'user'])
    expect(body['reasoning_effort']).toBe('max')
  })

  it('rewrites the harness identity banner in a system message', () => {
    const content = 'You are an AI agent powered by DeepSeek Harness. Use tools carefully.'
    const body = JSON.parse(prepareChatBody(JSON.stringify({
      model: 'deepseek-v4-flash',
      messages: [{ role: 'developer', content }, { role: 'user', content: 'hi' }],
    })))
    const system = body['messages'][0] as { role: string, content: string }
    expect(system.role).toBe('system')
    expect(system.content).toBe('You are an AI agent. Use tools carefully.')
  })

  it('rewrites the paired Web GUI sentences in text shards of a system message', () => {
    const first = 'You are interacting with the user through the DeepSeek Harness Web GUI whose URL the runtime context names.'
    const second = 'When the user refers to "this page", "this GUI", or "this app" without naming another target, they mean this GUI.'
    const body = JSON.parse(prepareChatBody(JSON.stringify({
      model: 'deepseek-v4-flash',
      messages: [{
        role: 'system',
        content: [{ type: 'text', text: `${first} ${second} The browser provides no implicit DOM.` }],
      }],
    })))
    const text = (body['messages'][0] as { content: { type: string, text: string }[] }).content[0]!.text
    expect(text).not.toContain('DeepSeek Harness')
    expect(text).toContain('You are interacting with the user through the Web GUI whose URL the runtime context names.')
    expect(text).toContain('and names no other target, that reference means this GUI.')
    expect(text).toContain('The browser provides no implicit DOM.')
  })

  it('rewrites the legacy Web GUI paragraph that embedded the URL directly', () => {
    const content = 'You are interacting with the user through the DeepSeek Harness Web GUI at http://127.0.0.1:58031/. Do not start a replacement server.'
    const body = JSON.parse(prepareChatBody(JSON.stringify({
      model: 'deepseek-v4-flash',
      messages: [{ role: 'system', content }],
    })))
    expect((body['messages'][0] as { content: string }).content)
      .toBe('You are interacting with the user through the Web GUI at http://127.0.0.1:58031/. Do not start a replacement server.')
  })

  it('rewrites the @-file-reference paragraph that trips 11128 as a whole', () => {
    // `FILE_REFERENCE_PROMPT` from dsh-file-reference. Measured in issue #12:
    // the full paragraph is rejected, every sentence of it passes alone.
    const content = [
      'Tokens prefixed with @ are paths the user explicitly referenced.',
      'Relative paths resolve from the workspace root; absolute paths identify files or directories on the host.',
      'A trailing slash marks a directory: list it when its contents matter.',
      'Anything else is a file: use the read tool when its contents are needed, and do not claim to have inspected it before reading.',
      '@"..." quotes a path containing spaces.',
    ].join(' ')
    const body = JSON.parse(prepareChatBody(JSON.stringify({
      model: 'deepseek-v4-flash',
      messages: [{ role: 'system', content }],
    })))
    const scrubbed = (body['messages'][0] as { content: string }).content
    expect(scrubbed).not.toContain('Tokens prefixed with @')
    expect(scrubbed).toContain('A token prefixed with @ names a path the user explicitly referenced.')
    // The rest of the paragraph must survive untouched — the channel check
    // needs the whole block, one reworded sentence is enough to clear it.
    expect(scrubbed).toContain('A trailing slash marks a directory: list it when its contents matter.')
    expect(scrubbed).toContain('@"..." quotes a path containing spaces.')
  })

  it('scrubs fingerprints an assistant message quotes but leaves user and tool roles verbatim', () => {
    const quoted = 'You are an AI agent powered by DeepSeek Harness. When the user refers to "this page", "this GUI", or "this app" without naming another target, they mean this GUI.'
    const body = JSON.parse(prepareChatBody(JSON.stringify({
      model: 'deepseek-v4-flash',
      messages: [
        { role: 'assistant', content: `The prompt says: ${quoted}` },
        { role: 'user', content: `Repeat after me: ${quoted}` },
        { role: 'tool', content: `grep hit: ${quoted}`, tool_call_id: 'call-1' },
      ],
    })))
    const messages = body['messages'] as { role: string, content: string }[]
    const assistant = messages[0]!
    const user = messages[1]!
    const tool = messages[2]!
    expect(assistant.content).not.toContain('DeepSeek Harness')
    expect(assistant.content).toContain('The prompt says: You are an AI agent.')
    expect(user.content).toBe(`Repeat after me: ${quoted}`)
    expect(tool.content).toBe(`grep hit: ${quoted}`)
  })

  it('rewrites the top-level system string when a body carries one', () => {
    const body = JSON.parse(prepareChatBody(JSON.stringify({
      model: 'deepseek-v4-flash',
      system: 'You are an AI agent powered by DeepSeek Harness.',
      messages: [{ role: 'user', content: 'hi' }],
    })))
    expect(body['system']).toBe('You are an AI agent.')
  })
})

describe('classifyUpstreamError', () => {
  it('classifies 402 as hard credit', () => {
    expect(classifyUpstreamError(402, '')).toBe('hard_credit')
  })

  it('classifies credit wording in a 200-shaped business error', () => {
    expect(classifyUpstreamError(200, 'code=1 msg=积分不足，请充值')).toBe('hard_credit')
  })

  it('classifies the offline session marker as session dead', () => {
    expect(classifyUpstreamError(401, 'Offline user session not found')).toBe('session_dead')
  })

  it('classifies 429 as soft rate', () => {
    expect(classifyUpstreamError(429, 'slow down')).toBe('soft_rate')
  })

  it('classifies 404 as transient not-found', () => {
    expect(classifyUpstreamError(404, '')).toBe('not_found')
  })

  it('classifies 5xx as server and other 4xx as client', () => {
    expect(classifyUpstreamError(503, '')).toBe('server')
    expect(classifyUpstreamError(400, 'bad')).toBe('client')
  })
})

describe('regionOf', () => {
  it('treats workbuddy.ai domains as global and everything else as cn', () => {
    expect(regionOf('www.codebuddy.cn')).toBe('cn')
    expect(regionOf('workbuddy.ai')).toBe('global')
    expect(regionOf('US.WorkBuddy.AI')).toBe('global')
    expect(regionOf('')).toBe('cn')
  })
})

describe('normalizeMessageContent (#13)', () => {
  it('flattens a tool-addition block to text instead of forwarding it', () => {
    // DSH inserts this after the tool registry changes mid-session. Forwarded
    // verbatim it fails the whole turn with 11101 unsupported content type.
    const body = JSON.parse(prepareChatBody(JSON.stringify({
      messages: [{ role: 'developer', content: [{ type: 'tool-addition', toolName: 'browser_click' }] }],
    })))
    expect(body['messages'][0]['content']).toEqual([{ type: 'text', text: '[tool added: browser_click]' }])
  })

  it('keeps the note when a tool-addition names no tool', () => {
    const body = JSON.parse(prepareChatBody(JSON.stringify({
      messages: [{ role: 'system', content: [{ type: 'tool-addition' }] }],
    })))
    expect(body['messages'][0]['content']).toEqual([{ type: 'text', text: '[tool added]' }])
  })

  it('flattens any unknown block type rather than passing it through', () => {
    // A host upgrade introducing a new content kind must degrade to a note, not
    // to a dead channel.
    const body = JSON.parse(prepareChatBody(JSON.stringify({
      messages: [{ role: 'user', content: [{ type: 'video_clip', url: 'x' }] }],
    })))
    expect(body['messages'][0]['content']).toEqual([{ type: 'text', text: '[unsupported content: video_clip]' }])
  })

  it('leaves supported text and image_url blocks untouched', () => {
    const content = [
      { type: 'text', text: 'hello' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
    ]
    const body = JSON.parse(prepareChatBody(JSON.stringify({
      messages: [{ role: 'user', content }],
    })))
    expect(body['messages'][0]['content']).toEqual(content)
  })

  it('leaves string content alone', () => {
    const body = JSON.parse(prepareChatBody(JSON.stringify({
      messages: [{ role: 'user', content: 'plain' }],
    })))
    expect(body['messages'][0]['content']).toBe('plain')
  })
})

describe('inlineRemoteImages (#13)', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02])
  const okFetch = (bytes, type = 'image/png') => (async () => new Response(bytes, {
    status: 200,
    headers: { 'content-type': type },
  })) as unknown as typeof fetch

  it('inlines an http image URL as a data URL', async () => {
    const body = JSON.stringify({
      messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'http://127.0.0.1:3080/a.png' } }] }],
    })
    const out = JSON.parse(await inlineRemoteImages(body, okFetch(png)))
    expect(out['messages'][0]['content'][0]['image_url']['url'])
      .toBe('data:image/png;base64,' + png.toString('base64'))
  })

  it('sniffs the type from magic bytes, not the content-type header', async () => {
    // An attachment endpoint may serve octet-stream for a good PNG.
    const body = JSON.stringify({
      messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'https://x/a' } }] }],
    })
    const out = JSON.parse(await inlineRemoteImages(body, okFetch(png, 'application/octet-stream')))
    expect(out['messages'][0]['content'][0]['image_url']['url']).toMatch(/^data:image\/png;base64,/)
  })

  it('replaces an unreachable image with a note instead of failing the turn', async () => {
    const failing = (async () => new Response('', { status: 404 })) as unknown as typeof fetch
    const body = JSON.stringify({
      messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'http://127.0.0.1:1/x.png' } }] }],
    })
    const out = JSON.parse(await inlineRemoteImages(body, failing))
    const block = out['messages'][0]['content'][0]
    expect(block['type']).toBe('text')
    expect(block['text']).toContain('image unavailable')
    expect(block['image_url']).toBeUndefined()
  })

  it('rejects a non-image payload rather than sending a bogus data URL', async () => {
    const body = JSON.stringify({
      messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'https://x/a' } }] }],
    })
    const out = JSON.parse(await inlineRemoteImages(body, okFetch(Buffer.from('not an image'))))
    expect(out['messages'][0]['content'][0]['text']).toContain('not an image')
  })

  it('does not fetch when there is no remote image', async () => {
    let called = false
    const spy = (async () => { called = true; return new Response(png) }) as unknown as typeof fetch
    const body = JSON.stringify({
      messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } }] }],
    })
    await inlineRemoteImages(body, spy)
    expect(called).toBe(false)
  })

  it('leaves data URLs and non-http schemes untouched', async () => {
    const original = { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } }
    const body = JSON.stringify({ messages: [{ role: 'user', content: [original] }] })
    const out = JSON.parse(await inlineRemoteImages(body, okFetch(png)))
    expect(out['messages'][0]['content'][0]).toEqual(original)
  })

  it('returns invalid JSON untouched', async () => {
    expect(await inlineRemoteImages('not json', okFetch(png))).toBe('not json')
  })
})
