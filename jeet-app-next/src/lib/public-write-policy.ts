// Configuration readiness only. Actual owner-wallet acceptance must be recorded before an operator sets these gates.
export function publicWriteConfigurationReady(env: Record<string, string | undefined>) {
  if (env.NEXT_PUBLIC_JEET_PUBLIC_BETA !== '0' || env.NEXT_PUBLIC_JEET_WALLET_NETWORK !== 'devnet' ||
      env.JEET_DEVNET_PUBLIC_WRITES !== '1' || env.JEET_DEVNET_WALLET !== '1' ||
      !/^[a-f0-9]{64}$/.test(env.JEET_PHANTOM_ACCEPTANCE_SHA ?? '') ||
      (env.JEET_SHARED_BACKEND_TOKEN?.length ?? 0) < 32 ||
      (env.JEET_SHARED_BACKEND_TOKEN?.length ?? 0) > 256 ||
      env.JEET_METADATA_STORAGE !== 'pinata' || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(env.PINATA_JWT ?? '')) return false;
  try {
    const backend = new URL(env.JEET_SHARED_BACKEND_URL ?? '');
    return backend.protocol === 'https:' && !backend.username && !backend.password &&
      backend.pathname === '/' && !backend.search && !backend.hash;
  } catch { return false; }
}
