import { dispatch } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

type Ctx = { params: Promise<{ path?: string[] }> };
const handle = async (req: Request, { params }: Ctx) => dispatch(req, (await params).path || []);

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
