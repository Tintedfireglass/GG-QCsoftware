import { NextResponse } from 'next/server';
import { ApiError } from '@/lib/types';

/**
 * Domain-level errors. Services and repositories throw these instead of
 * building NextResponse objects, so HTTP concerns stay in the route layer.
 * `toResponse` (see handler.ts) turns any thrown error into a JSON response.
 */
export class AppError extends Error {
    constructor(
        public readonly status: number,
        public readonly error: string,
        message: string
    ) {
        super(message);
        this.name = 'AppError';
    }

    toResponse(): NextResponse {
        return NextResponse.json(
            { error: this.error, message: this.message } as ApiError,
            { status: this.status }
        );
    }
}

export class ValidationError extends AppError {
    constructor(message = 'Invalid request') {
        super(400, 'Validation Error', message);
    }
}

export class UnauthorizedError extends AppError {
    constructor(message = 'Not authenticated') {
        super(401, 'Authentication Error', message);
    }
}

export class ForbiddenError extends AppError {
    constructor(message = 'Insufficient permissions') {
        super(403, 'Authorization Error', message);
    }
}

export class NotFoundError extends AppError {
    constructor(message = 'Resource not found') {
        super(404, 'Not Found', message);
    }
}

export class ConflictError extends AppError {
    constructor(message = 'Resource already exists') {
        super(409, 'Validation Error', message);
    }
}

/** 426 Upgrade Required — used for stale desktop clients. */
export class UpgradeRequiredError extends AppError {
    constructor(message = 'Please update to the latest version.') {
        super(426, 'Authentication Error', message);
    }
}

/** 429 Too Many Requests — the caller exceeded its rate limit. */
export class TooManyRequestsError extends AppError {
    constructor(message = 'Rate limit exceeded') {
        super(429, 'Rate Limit', message);
    }
}
