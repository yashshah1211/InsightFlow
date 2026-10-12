// Server/build configuration only. Preserve the original read-only fallback profile.
export function deploymentProfile() {
  const profile = process.env.INSIGHTFLOW_DEPLOYMENT_PROFILE;
  if (!profile) return 'standard' as const;
  if (profile === 'authenticated-preview') {
    const origin = new URL(process.env.APP_ORIGIN || 'http://invalid');
    const database = new URL(process.env.SUPABASE_URL || 'http://invalid');
    if (process.env.INSIGHTFLOW_DATA_MODE !== 'fixture'
      || !['false', 'true'].includes(process.env.INSIGHTFLOW_WRITES_ENABLED || '')
      || database.protocol !== 'https:' || database.hostname !== 'dbacbcbglbqmqwxscesu.supabase.co'
      || database.username || database.password || database.port || database.pathname !== '/' || database.search || database.hash
      || origin.protocol !== 'https:' || origin.username || origin.password
      || origin.origin !== process.env.APP_ORIGIN
      || origin.hostname !== 'insightflow-preview-demo.vercel.app') {
      throw new Error('Authenticated preview requires the development database, fixture mode, explicit write gate and dedicated HTTPS origin');
    }
    return 'authenticated-preview' as const;
  }
  if (profile !== 'synthetic-preview') throw new Error('Unsupported deployment profile');
  if (process.env.INSIGHTFLOW_DATA_MODE !== 'fixture' || process.env.INSIGHTFLOW_WRITES_ENABLED !== 'false') {
    throw new Error('Synthetic preview requires explicit fixture mode and disabled writes');
  }
  return 'synthetic-preview' as const;
}
