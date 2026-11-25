import { describe, expect, it } from 'vitest';
import { DomainError } from '../../core/errors/domain-error.js';
import { withoutReasoning } from './groq-proxy.controller.js';

describe('withoutReasoning', () => {
  it('drops the reasoning Groq refuses from assistant messages only', () => {
    const out = withoutReasoning({
      model: 'openai/gpt-oss-120b',
      stream: true,
      messages: [
        { role: 'system', content: 's' },
        { role: 'user', content: 'u', reasoning: 'kept on user' },
        { role: 'assistant', content: 'a', reasoning_content: 'thought', reasoning: 'thought', tool_calls: [{ id: 't1' }] },
        { role: 'tool', tool_call_id: 't1', content: '{}' },
      ],
    });
    expect(out).toEqual({
      model: 'openai/gpt-oss-120b',
      stream: true,
      messages: [
        { role: 'system', content: 's' },
        { role: 'user', content: 'u', reasoning: 'kept on user' },
        { role: 'assistant', content: 'a', tool_calls: [{ id: 't1' }] },
        { role: 'tool', tool_call_id: 't1', content: '{}' },
      ],
    });
  });

  it('passes a request without messages through and refuses a non-object body', () => {
    expect(withoutReasoning({ model: 'm' })).toEqual({ model: 'm' });
    expect(() => withoutReasoning('x')).toThrow(DomainError);
    expect(() => withoutReasoning([])).toThrow(DomainError);
  });
});
