import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

export async function proxy(request) {
  let response = NextResponse.next({ request });
  response.headers.set('Cache-Control', 'private, no-store');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const adminId = process.env.ADMIN_USER_ID;
  const isLogin = request.nextUrl.pathname === '/admin/login';

  function toLogin() {
    const destination = request.nextUrl.clone();
    destination.pathname = '/admin/login';
    destination.search = '';
    const redirectResponse = NextResponse.redirect(destination);
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    redirectResponse.headers.set('Cache-Control', 'private, no-store');
    return redirectResponse;
  }

  if (!url || !key || !adminId) {
    return isLogin ? response : toLogin();
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(values) {
        for (const { name, value } of values) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of values) {
          response.cookies.set(name, value, options);
        }
        response.headers.set('Cache-Control', 'private, no-store');
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  const allowed = !error && data.user?.id === adminId;

  if (!isLogin && !allowed) {
    return toLogin();
  }

  return response;
}

export const config = {
  matcher: ['/admin/:path*'],
};
