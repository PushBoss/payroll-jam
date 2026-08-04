import type { VercelRequest, VercelResponse } from '@vercel/node';

// Deliberately does NOT statically import _supabaseAdmin.ts or _dimepay.ts.
// A static top-level import of a module that throws (e.g. a missing env var)
// crashes the whole function before any handler code runs -- that is exactly
// what caused the July 21 incident, and it's invisible to any try/catch placed
// inside a handler. Dynamic imports inside the handler body sidestep that: a
// throw during import resolution here is just a normal caught error.
//
// See docs/superpowers/specs/2026-08-04-crash-detection-and-alerting-design.md

const checkSupabaseAdmin = async (): Promise<{ ok: true } | { ok: false; error: string }> => {
  try {
    const { supabaseAdmin } = await import('./_supabaseAdmin.js');
    const { error } = await supabaseAdmin.from('companies').select('id').limit(1);
    if (error) throw error;
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  }
};

const checkDimePayCredentials = async (): Promise<{ ok: true } | { ok: false; error: string }> => {
  try {
    const { getDimePayCredentials } = await import('./_dimepay.js');
    // production is the environment that actually matters for this health check;
    // this only resolves credentials, it never calls out to DimePay.
    getDimePayCredentials('production');
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  }
};

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const [supabaseAdminCheck, dimePayCheck] = await Promise.all([
    checkSupabaseAdmin(),
    checkDimePayCredentials()
  ]);

  const failures = [
    !supabaseAdminCheck.ok && { dependency: 'supabaseAdmin', error: supabaseAdminCheck.error },
    !dimePayCheck.ok && { dependency: 'dimePayCredentials', error: dimePayCheck.error }
  ].filter(Boolean);

  if (failures.length > 0) {
    return res.status(500).json({ ok: false, failures });
  }

  return res.status(200).json({ ok: true });
}
