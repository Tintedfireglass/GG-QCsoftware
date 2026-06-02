import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, AuthenticatedUser, AuthResult } from '@/lib/auth-middleware';
import { UserRole, ApiError } from '@/lib/types';
import { AppError, UnauthorizedError, ForbiddenError } from './errors';

export interface RouteContext {
    user: AuthenticatedUser;
    params: Record<string, string>;
}

/**
 * Resolves a request to an authenticated principal (or an error response).
 * Pluggable so different client audiences — dashboard JWT today, a mobile or
 * partner audience later — each supply their own without rewriting withAuth.
 */
export type Authenticator = (request: NextRequest) => Promise<AuthResult>;

export interface AuthOptions {
    /** Allowed roles, or null for any authenticated principal. */
    roles?: UserRole[] | null;
    /** Authentication strategy. Defaults to dashboard/user auth. */
    authenticate?: Authenticator;
}

type AuthedHandler = (request: NextRequest, ctx: RouteContext) => Promise<NextResponse>;
type RawHandler = (
    request: NextRequest,
    ctx: { params: Record<string, string> }
) => Promise<NextResponse>;

/** JSON response helper. */
export function json(data: unknown, init?: ResponseInit): NextResponse {
    return NextResponse.json(data, init);
}

/** Best-effort originating client IP from common proxy headers. */
export function clientIp(request: NextRequest): string | null {
    const forwardedFor = request.headers.get('x-forwarded-for') || request.headers.get('x-vercel-forwarded-for');
    const forwarded = request.headers.get('forwarded');
    const forwardedIp = forwarded?.match(/for="?([^;,"]+)"?/i)?.[1];
    return (
        forwardedFor?.split(',')[0]?.trim() ||
        forwardedIp ||
        request.headers.get('x-real-ip') ||
        request.headers.get('cf-connecting-ip') ||
        request.headers.get('true-client-ip') ||
        request.headers.get('x-client-ip') ||
        request.headers.get('fly-client-ip') ||
        null
    );
}

/**
 * Error boundary for a route. Maps AppError -> its JSON response and any other
 * throw -> 500, so handlers can `throw new NotFoundError()` instead of building
 * NextResponse objects and wrapping every body in try/catch.
 */
export function wrap(handler: RawHandler) {
    return async (request: NextRequest, route?: { params?: Promise<Record<string, string>> }) => {
        try {
            const params = route?.params ? await route.params : {};
            return await handler(request, { params });
        } catch (err) {
            return toResponse(err);
        }
    };
}

/**
 * Authenticated route wrapper: runs the error boundary, authenticates the
 * request, optionally gates by role, then invokes the handler with `user`.
 *
 * Roles may be passed directly (`withAuth(['SuperAdmin'], fn)`), `null` for any
 * authenticated principal, or via an options object to also choose a non-default
 * authenticator (`withAuth({ roles: null, authenticate: mobileAuth }, fn)`).
 */
export function withAuth(
    rolesOrOptions: UserRole[] | null | AuthOptions,
    handler: AuthedHandler
) {
    const opts: AuthOptions = Array.isArray(rolesOrOptions) || rolesOrOptions === null
        ? { roles: rolesOrOptions }
        : rolesOrOptions;
    const roles = opts.roles ?? null;
    const authenticate = opts.authenticate ?? authenticateRequest;

    return wrap(async (request, { params }) => {
        const { user, error } = await authenticate(request);
        if (error) return error;
        if (!user) throw new UnauthorizedError();
        if (roles && !roles.includes(user.role)) throw new ForbiddenError();
        return handler(request, { user, params });
    });
}

export function toResponse(err: unknown): NextResponse {
    if (err instanceof AppError) return err.toResponse();
    console.error('Unhandled route error:', err);
    return NextResponse.json(
        { error: 'Server Error', message: 'Internal server error' } as ApiError,
        { status: 500 }
    );
}
