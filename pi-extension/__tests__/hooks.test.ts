import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  extractMessageText,
  registerHooks,
} from '../hooks';

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('Pi extension hooks', () => {
  function makeMockPi() {
    const events: Record<string, any> = {};
    return {
      events,
      on(event: string, handler: any) {
        events[event] = handler;
      },
      logger: { warn: vi.fn(), info: vi.fn() },
    };
  }

  it('extracts user text from Pi message blocks', () => {
    expect(extractMessageText({ content: [{ type: 'text', text: 'hello' }, { type: 'image' }, { type: 'text', text: 'world' }] })).toBe('hello\nworld');
  });

  it('registers Pi lifecycle hooks', () => {
    const pi = makeMockPi();
    registerHooks(pi as any, { injectPromptGuidance: false, recallEnabled: false, startupHealthcheck: false });
    expect(pi.events.session_start).toBeTypeOf('function');
    expect(pi.events.before_agent_start).toBeTypeOf('function');
    expect(pi.events.tool_call).toBeUndefined();
    expect(pi.events.session_shutdown).toBeUndefined();
  });

  it('before_agent_start applies lifecycle startup context and recall message', async () => {
    const pi = makeMockPi();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      if (String(url).includes('/lifecycle/event')) {
        const body = JSON.parse(String(init?.body || '{}'));
        if (body?.event?.name === 'session.start') {
          return {
            ok: true, status: 200, statusText: 'OK',
            text: async () => JSON.stringify({
              host_output: { mode: 'return_value', value: { systemPromptAppend: 'LIFECYCLE SYSTEM' } },
            }),
          };
        }
        if (body?.event?.name === 'prompt.submit') {
          return {
            ok: true, status: 200, statusText: 'OK',
            text: async () => JSON.stringify({
              host_output: {
                mode: 'return_value',
                value: {
                  message: {
                    customType: 'lore-recall',
                    content: '<recall session_id="sess-2" query_id="qid-2">\n0.70 | core://project\n</recall>',
                    display: false,
                  },
                },
              },
            }),
          };
        }
      }
      return {
        ok: true, status: 200, statusText: 'OK',
        text: async () => JSON.stringify({ items: [] }),
      };
    }));

    registerHooks(pi as any, {
      baseUrl: 'http://host',
      timeoutMs: 1000,
      injectPromptGuidance: true,
      recallEnabled: true,
      startupHealthcheck: false,
    });

    const result = await pi.events.before_agent_start({ prompt: 'what now?', systemPrompt: 'base system' }, { sessionManager: { sessionId: 'sess-2' } });
    expect(result.systemPrompt).toContain('LIFECYCLE SYSTEM');
    expect(result.message.content).toContain('<recall');
    expect(result.message.content).toContain('core://project');
    const urls = (fetch as any).mock.calls.map((call: any[]) => String(call[0]));
    expect(urls.filter((url: string) => url.includes('/lifecycle/event'))).toHaveLength(2);
    expect(urls.some((url: string) => url.includes('/browse/boot'))).toBe(false);
    expect(urls.some((url: string) => url.includes('/browse/recall'))).toBe(false);
  });
});
