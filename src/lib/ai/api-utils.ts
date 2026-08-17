import { NextRequest, NextResponse } from 'next/server';
import type { AiFailure } from './types';

export const MAX_AI_BODY_BYTES = 64 * 1024;

export async function readLimitedJson(request: NextRequest): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_AI_BODY_BYTES) throw new ApiInputError('PAYLOAD_TOO_LARGE', 'Request body exceeds 64 KB.', 413);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_AI_BODY_BYTES) {
    throw new ApiInputError('PAYLOAD_TOO_LARGE', 'Request body exceeds 64 KB.', 413);
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new ApiInputError('INVALID_JSON', 'Request body must contain valid JSON.', 400);
  }
}

export class ApiInputError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function aiFailure(code: string, message: string, status: number) {
  const body: AiFailure = { error: { code, message, fallbackAvailable: true } };
  return NextResponse.json(body, { status });
}

export function clientAddress(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}
