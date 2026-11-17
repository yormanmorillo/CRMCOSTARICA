import { getUser } from '@/lib/auth';
import { APP_HTML } from '@/lib/ui';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const u = await getUser(req).catch(() => null);
  if (!u) return new Response(null, { status: 302, headers: { location: '/login', 'cache-control': 'no-store' } });
  return new Response(APP_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
