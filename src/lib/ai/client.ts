/**
 * OpenAI Responses API wrapper.
 *
 * The rest of the app depends on the `StructuredModel` interface, not on the
 * SDK: that keeps the API key confined to this module and makes the analysis
 * pipeline testable without a network call.
 */
import 'server-only';
import OpenAI from 'openai';
import { serverEnv } from '@/lib/util/env';
import { AppError } from '@/lib/util/errors';

export interface ImageInput {
  /** data: URL - the bytes never leave the server except in this request. */
  dataUrl: string;
}

export interface DocumentInput {
  /** data: URL of a PDF - the bytes never leave the server except in this request. */
  dataUrl: string;
  filename: string;
}

export interface StructuredRequest {
  /** System-level instructions. Never contains user content. */
  instructions: string;
  /** User-role content. Untrusted; always delimited by the caller. */
  text: string;
  image?: ImageInput;
  document?: DocumentInput;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  maxOutputTokens?: number;
}

export interface StructuredModel {
  readonly name: string;
  run(request: StructuredRequest): Promise<unknown>;
}

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: serverEnv.openaiApiKey, maxRetries: 2, timeout: 60_000 });
  }
  return client;
}

/**
 * Maps an OpenAI SDK failure to an error the user can act on, and logs the
 * provider's own reason server-side - the client only ever sees our message.
 */
function toAiError(error: unknown): AppError {
  if (error instanceof OpenAI.APIError) {
    console.error('[caldrop] openai request failed', {
      status: error.status,
      code: error.code,
      type: error.type,
      message: error.message,
    });

    if (error.code === 'insufficient_quota' || error.code === 'credit_balance_exhausted') {
      return new AppError(
        'AI_FAILED',
        'The OpenAI account has no credits left. Add credits in the OpenAI billing settings.',
      );
    }
    if (error.status === 401) {
      return new AppError('AI_FAILED', 'The OpenAI API key was rejected. Check OPENAI_API_KEY.');
    }
    if (error.status === 429) {
      return new AppError('AI_FAILED', 'The assistant is rate limited right now. Try again shortly.');
    }
    if (error.status === 400) {
      return new AppError('AI_FAILED', 'The assistant rejected this request.', {
        cause: error.message,
      });
    }
  } else {
    console.error('[caldrop] openai request failed', error);
  }

  return new AppError('AI_FAILED', 'The assistant could not analyse this input.');
}

type UserContent =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail: 'auto' }
  | { type: 'input_file'; filename: string; file_data: string };

export function createOpenAIModel(model = serverEnv.openaiModel): StructuredModel {
  return {
    name: model,
    async run(request: StructuredRequest): Promise<unknown> {
      const content: UserContent[] = [{ type: 'input_text', text: request.text }];
      if (request.image) {
        content.push({ type: 'input_image', image_url: request.image.dataUrl, detail: 'auto' });
      }
      if (request.document) {
        content.push({
          type: 'input_file',
          filename: request.document.filename,
          file_data: request.document.dataUrl,
        });
      }

      let response;
      try {
        response = await getClient().responses.create({
          model,
          instructions: request.instructions,
          input: [{ role: 'user', content }],
          max_output_tokens: request.maxOutputTokens ?? 1200,
          // Strict structured output: the model cannot return a shape we did
          // not ask for, which removes free-form parsing entirely.
          text: {
            format: {
              type: 'json_schema',
              name: request.schemaName,
              schema: request.jsonSchema,
              strict: true,
            },
          },
        });
      } catch (error) {
        throw toAiError(error);
      }

      if (response.status === 'incomplete') {
        throw new AppError(
          'AI_FAILED',
          'The assistant ran out of room before finishing. Try a shorter input.',
        );
      }

      const outputText = response.output_text;
      if (!outputText) {
        throw new AppError('AI_FAILED', 'The assistant returned an empty response.');
      }

      try {
        return JSON.parse(outputText) as unknown;
      } catch {
        throw new AppError('AI_FAILED', 'The assistant returned malformed JSON.');
      }
    },
  };
}
