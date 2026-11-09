import { describe, expect, it } from 'vitest'
import { classifyUpstreamError, prepareChatBody, regionOf } from '../src/upstream.ts'

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
