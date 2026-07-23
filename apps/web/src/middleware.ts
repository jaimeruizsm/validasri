import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/server/session-constants';

/**
 * Guarda de sesion a nivel de borde: si no hay cookie de sesion, redirige al
 * login antes de renderizar cualquier pagina de la aplicacion. La verificacion
 * real (token valido + pertenencia) la hace cada pagina en el servidor.
 */
const PROTECTED_PREFIXES = ['/dashboard', '/validaciones', '/historial', '/lotes', '/configuracion'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!isProtected) return NextResponse.next();

  const hasSession = request.cookies.has(SESSION_COOKIE);
  if (!hasSession) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/validaciones/:path*', '/historial/:path*', '/lotes/:path*', '/configuracion/:path*'],
};
