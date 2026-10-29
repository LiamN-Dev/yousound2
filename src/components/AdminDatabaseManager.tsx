import React, { useState, useEffect } from 'react';
import {
  Database,
  Server,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Copy,
  Check,
  Download,
  Upload,
  RefreshCw,
  Zap,
  ExternalLink,
  ShieldCheck,
  HardDrive,
  Code,
  Layers,
} from 'lucide-react';

interface DatabaseStatus {
  activeHosting: 'supabase' | 'local_file';
  engine: string;
  isSqlConnected: boolean;
  configuredConnectionString: string | null;
  supabaseUrl: string | null;
  hasCredentials: boolean;
}

export const AdminDatabaseManager: React.FC = () => {
  const [status, setStatus] = useState<DatabaseStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [connectionString, setConnectionString] = useState<string>('');
  
  // Action states
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  
  // Feedback
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; version?: string; latency?: number } | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/admin/database/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.warn('Failed to fetch db status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleTestConnection = async () => {
    if (!connectionString.trim()) {
      setFeedback({ type: 'error', message: 'Please enter your Supabase connection string.' });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    setFeedback(null);

    try {
      const res = await fetch('/api/admin/database/test-supabase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionString: connectionString.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          success: true,
          message: `Connected successfully in ${data.latencyMs}ms!`,
          version: data.version,
          latency: data.latencyMs,
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Connection failed. Please verify your Supabase database password.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Network error while testing connection',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleConnectSupabase = async () => {
    setIsConnecting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/database/connect-supabase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionString: connectionString.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          message: data.message || 'Successfully switched database to Supabase PostgreSQL!',
        });
        await fetchStatus();
      } else {
        setFeedback({
          type: 'error',
          message: data.error || 'Failed to switch database.',
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Connection error' });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSyncToSupabase = async () => {
    if (!connectionString.trim() && !status?.isSqlConnected) {
      setFeedback({ type: 'error', message: 'Enter your Supabase connection string first.' });
      return;
    }
    if (!confirm('This will create the database tables on Supabase and migrate all current users, songs, playlists, and settings. Continue?')) {
      return;
    }

    setIsSyncing(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/database/sync-to-supabase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionString: connectionString.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          message: `Migration complete! Transferred: ${data.migratedCounts?.songs || 0} songs, ${data.migratedCounts?.users || 0} users, and all settings to Supabase!`,
        });
        await fetchStatus();
      } else {
        setFeedback({
          type: 'error',
          message: data.error || 'Sync failed. You can also copy the migration SQL manually below.',
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Sync error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCopyMigrationSql = async () => {
    try {
      const res = await fetch('/api/admin/database/supabase-migration-sql');
      if (res.ok) {
        const text = await res.text();
        await navigator.clipboard.writeText(text);
        setCopiedSql(true);
        setTimeout(() => setCopiedSql(false), 2500);
      }
    } catch (err) {
      console.error('Failed to copy SQL:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Decoupled from Firebase Notice */}
      <div className="p-4 sm:p-5 rounded-3xl bg-emerald-950/40 border border-emerald-500/30 flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-white font-display flex items-center gap-2">
            <span>Independent Database Hosting (Supabase & PostgreSQL)</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
              No Firebase Lock-in
            </span>
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            Your platform has been transitioned away from Firebase database dependencies. YouSong now runs on standard relational PostgreSQL, perfectly suited for <strong>Supabase</strong>, <strong>Neon</strong>, or any self-hosted PostgreSQL database.
          </p>
        </div>
      </div>

      {/* Active Hosting Status Card */}
      <div className="p-5 sm:p-6 rounded-3xl bg-slate-900/90 border border-white/10 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg ${
              status?.isSqlConnected ? 'bg-gradient-to-tr from-emerald-500 to-teal-600 shadow-emerald-500/20' : 'bg-gradient-to-tr from-cyan-500 to-blue-600 shadow-cyan-500/20'
            }`}>
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white font-display">
                  Active Database Hosting Engine
                </h3>
                {status?.isSqlConnected ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Supabase PostgreSQL Connected
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold flex items-center gap-1">
                    <HardDrive className="w-3 h-3" /> Local Persistent Store (Active)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Current Engine: <strong className="text-white">{status?.engine || 'Checking...'}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={fetchStatus}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 text-xs font-semibold self-start sm:self-center transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Status</span>
          </button>
        </div>

        {/* Feedback Banners */}
        {feedback && (
          <div className={`p-3.5 rounded-2xl text-xs flex items-center gap-2.5 animate-in fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/60 border border-rose-500/40 text-rose-200'
          }`}>
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
        )}

        {testResult && (
          <div className={`p-3.5 rounded-2xl text-xs space-y-1 animate-in fade-in ${
            testResult.success
              ? 'bg-emerald-950/50 border border-emerald-500/30 text-emerald-200'
              : 'bg-rose-950/50 border border-rose-500/30 text-rose-200'
          }`}>
            <div className="flex items-center gap-2 font-bold">
              {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
              <span>{testResult.message}</span>
            </div>
            {testResult.version && (
              <p className="text-[11px] text-slate-400 font-mono truncate">
                Server Version: {testResult.version}
              </p>
            )}
          </div>
        )}

        {/* Connection String Input Box */}
        <div className="space-y-3 pt-2">
          <label className="block text-xs font-bold text-slate-200">
            Supabase / PostgreSQL Connection String (URI)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="password"
              placeholder="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"
              value={connectionString}
              onChange={(e) => setConnectionString(e.target.value)}
              className="flex-1 px-4 py-2.5 text-xs rounded-xl bg-slate-950 border border-white/15 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting || !connectionString.trim()}
                className="px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-slate-200 text-xs font-bold transition-all disabled:opacity-50"
              >
                {isTesting ? 'Testing...' : 'Test Connection'}
              </button>
              <button
                type="button"
                onClick={handleConnectSupabase}
                disabled={isConnecting || !connectionString.trim()}
                className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-all disabled:opacity-50"
              >
                {isConnecting ? 'Connecting...' : 'Set Active Database'}
              </button>
            </div>
          </div>
          <span className="text-[11px] text-slate-400 block">
            Found in your <strong>Supabase Dashboard &rarr; Project Settings &rarr; Database &rarr; Connection string (URI)</strong> (select <em>NodeJS / Session pooler</em> or <em>Direct</em>).
          </span>
        </div>
      </div>

      {/* Migration Actions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Method 1: Automatic Direct Sync */}
        <div className="p-5 rounded-3xl bg-slate-900/80 border border-white/10 shadow-xl space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
              <Zap className="w-4 h-4" />
              <span>Method A: 1-Click Automated Sync</span>
            </div>
            <h4 className="text-base font-bold text-white font-display">
              Push Current Data to Supabase
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              Automatically creates all tables (users, songs, requests, playlists, popups, settings) on your Supabase database and migrates all existing records in one go.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSyncToSupabase}
            disabled={isSyncing}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            <span>{isSyncing ? 'Migrating Database to Supabase...' : 'Transfer & Sync All Data to Supabase'}</span>
          </button>
        </div>

        {/* Method 2: Supabase SQL Editor (Copy & Paste) */}
        <div className="p-5 rounded-3xl bg-slate-900/80 border border-white/10 shadow-xl space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-purple-400 font-bold text-xs uppercase tracking-wider">
              <Code className="w-4 h-4" />
              <span>Method B: Supabase SQL Editor</span>
            </div>
            <h4 className="text-base font-bold text-white font-display">
              Copy Migration SQL Script
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              Prefer running SQL directly in the Supabase Dashboard? Copy the full SQL script (DDL schema + INSERT statements with your live data) and run it in the SQL Editor.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyMigrationSql}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-600/20 transition-all active:scale-95"
            >
              {copiedSql ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
              <span>{copiedSql ? 'Copied to Clipboard!' : 'Copy Supabase Migration SQL'}</span>
            </button>

            <a
              href="/api/admin/database/supabase-migration-sql"
              download="yousong_supabase_full_migration.sql"
              className="p-3 rounded-2xl bg-white/[0.08] hover:bg-white/[0.15] text-slate-200 transition-all"
              title="Download SQL File"
            >
              <Download className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>

      {/* Quick 3-Step Setup Guide */}
      <div className="p-5 sm:p-6 rounded-3xl bg-slate-900/60 border border-white/10 space-y-4">
        <h4 className="text-sm font-bold text-white font-display flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span>Quick 3-Step Supabase Setup Guide</span>
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/5 space-y-2">
            <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 font-bold flex items-center justify-center text-xs">
              1
            </div>
            <h5 className="font-bold text-white">Create Free Project</h5>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Log into <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline inline-flex items-center gap-0.5">supabase.com <ExternalLink className="w-2.5 h-2.5" /></a> and create a new project. Choose any region close to you.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/5 space-y-2">
            <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 font-bold flex items-center justify-center text-xs">
              2
            </div>
            <h5 className="font-bold text-white">Copy Connection String</h5>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              In Supabase, go to <strong>Project Settings &rarr; Database &rarr; Connection string</strong>. Copy the URI and replace <code className="text-amber-300 font-mono">[YOUR-PASSWORD]</code> with your database password.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/5 space-y-2">
            <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 font-bold flex items-center justify-center text-xs">
              3
            </div>
            <h5 className="font-bold text-white">Connect & Transfer</h5>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Paste the URI into the box above and click <strong>"Transfer & Sync All Data to Supabase"</strong>. That's it! Your entire app is now hosted on Supabase.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
