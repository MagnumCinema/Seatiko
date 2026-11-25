// OpenAI-compatible pass-through to Groq for the Twenty CRM's AI (chat, workflows).
//
// Twenty's AI SDK sends the model's reasoning back to it between the steps of one answer
// (`reasoning_content` on assistant messages), and Groq refuses that field, so every
// answer with a tool call failed. This route drops the field and forwards the request
// as is, streaming Groq's answer back. Twenty puts the Groq key in the Authorization
// header itself; nothing here holds a secret. Only reachable inside the Docker network:
// nginx serves /api/ from this API, never /internal/.
import { Controller, HttpCode, Logger, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../core/auth/auth.decorators.js';
import { badRequest, unauthorized, unavailable } from '../../core/errors/domain-error.js';

export const GROQ_PROXY_PATH = '/internal/groq/openai/v1';
const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

type ChatMessage = Record<string, unknown> & { role?: unknown };

/** The request without the reasoning Groq refuses on assistant messages. */
export function withoutReasoning(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('invalid_body');
  const request = body as Record<string, unknown>;
  if (!Array.isArray(request.messages)) return request;
  return {
    ...request,
    messages: (request.messages as ChatMessage[]).map((message) => {
      if (!message || typeof message !== 'object' || message.role !== 'assistant') return message;
      const { reasoning_content: _content, reasoning: _reasoning, ...rest } = message;
      return rest;
    }),
  };
}

@Public()
@Controller(GROQ_PROXY_PATH.slice(1))
export class GroqProxyController {
  private readonly logger = new Logger(GroqProxyController.name);

  @Post('chat/completions')
  @HttpCode(200)
  async chat(@Req() req: Request): Promise<Response> {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) throw unauthorized('auth_required');
    const body = JSON.stringify(withoutReasoning(req.body));

    // Stop asking Groq when Twenty gives up on the answer.
    const abort = new AbortController();
    req.on('close', () => abort.abort());

    let upstream: Response;
    try {
      upstream = await fetch(GROQ_CHAT_URL, {
        method: 'POST',
        headers: { authorization, 'content-type': 'application/json', accept: req.headers.accept ?? 'application/json' },
        body,
        signal: abort.signal,
      });
    } catch (error) {
      if (abort.signal.aborted) throw unavailable('client_closed');
      this.logger.warn(`Groq unreachable: ${(error as Error).message}`);
      throw unavailable('groq_unavailable');
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-cache' },
    });
  }
}
