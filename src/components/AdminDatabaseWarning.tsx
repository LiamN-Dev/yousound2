import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

interface DbStatus {
  isSqlConnected?: boolean;
  lastError?: string | null;
  lastDbError?: { where: string; message: string; at: string } | null;
}

interface TestResult {
  ok: boolean;
  results: Array<{ name: string; ok: boolean; error?: string }>;
}

/**
 * Shows admins whether the database is really saving data, with a one-click save test.
 * (When it is not, songs, accounts, announcements and chats vanish on every redeploy.)
 */
export const AdminDatabaseWarning: React.FC = () => {
  const [status, setStatus] = useState<DbStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/database/status');
      if (!res.ok) return;
      setStatus(await res.json());
    } catch (_) {}
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      const res = await fetch('/api/admin/database/self-test', { method: 'POST' });
      setTest(await res.json());
    } catch {
      setTest({ ok: false, results: [{ name: 'Running the test', ok: false, error: 'Could not reach the server.' }] });
    } finally {
      setTesting(false);
      load();
    }
  };

  if (!status) return null;

  const disconnected = status.isSqlConnected === false;
  const hasProblem = disconnected || !!status.lastDbError;

  const testButton = (
    <button
      type="button"
      onClick={runTest}
      disabled={testing}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-[11px] font-semibold text-white disabled:opacity-60"
    >
      {testing && <Loader2 className="w-3 h-3 animate-spin" />}
      {testing ? 'Testing...' : 'Run save test'}
    </button>
  );

  const results = test && (
    <ul className="mt-3 space-y-1">
      {test.results.map((r) => (
        <li key={r.name} className="flex items-start gap-2 text-[11px]">
          <span className={r.ok ? 'text-emerald-300' : 'text-rose-300'}>{r.ok ? '✓' : '✗'}</span>
          <span className="min-w-0">
            <span className="font-semibold">{r.name}</span>
            {r.error && <span className="block font-mono text-rose-200/90 break-words">{r.error}</span>}
          </span>
        </li>
      ))}
    </ul>
  );

  if (!hasProblem) {
    return (
      <div className="mb-5 px-4 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-100">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-300" />
            <span>Database connected. Songs, accounts and announcements are saved permanently.</span>
          </div>
          {testButton}
        </div>
        {results}
      </div>
    );
  }

  return (
    <div className="mb-5 p-4 sm:p-5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-100">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-rose-300 shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed space-y-2 min-w-0">
          {disconnected ? (
            <>
              <p className="text-sm font-bold text-white">Your data is NOT being saved permanently</p>
              <p>
                The site cannot reach the database, so it is using a temporary disk that Render erases on every update.
                Songs, accounts, announcements and chats you add now will disappear at the next redeploy.
              </p>
              <p>
                Check that <code className="px-1 rounded bg-black/30">DATABASE_URL</code> in Render&apos;s Environment settings is your
                Supabase pooler connection string and the password is current, then redeploy.
              </p>
              {status.lastError && (
                <p className="break-words">
                  What the server reported: <span className="font-mono">{status.lastError}</span>
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-white">Connected, but some saves are failing</p>
              <p>
                The database is reachable, but at least one operation was rejected, so that data may not be kept after a
                redeploy. Run the save test to see exactly what fails.
              </p>
            </>
          )}
          {status.lastDbError && (
            <p className="break-words">
              Last database error ({status.lastDbError.where}):{' '}
              <span className="font-mono">{status.lastDbError.message}</span>
            </p>
          )}
          <div>{testButton}</div>
          {results}
        </div>
      </div>
    </div>
  );
};
