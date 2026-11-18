"""Resume the preserved Devnet preview without rebuilding or touching test wallets."""
from pathlib import Path
import os

app = Path(__file__).resolve().parents[2]
if not (app / '.next/BUILD_ID').is_file():
    raise SystemExit('Preserved production build missing; prepare a Devnet build before starting.')
if not (app / 'node_modules/next/dist/bin/next').is_file():
    raise SystemExit('Validated dependencies missing; do not start with a different dependency set.')
name = os.environ.get('CODESPACE_NAME', '')
if os.environ.get('CODESPACES') != 'true' or name != 'symmetrical-adventure-544vrwjwxppcv7wx':
    raise SystemExit('This preview configuration is restricted to the authorized Codespace.')
if not os.environ.get('PINATA_JWT'):
    raise SystemExit('Existing server-only Pinata credential is unavailable; no credential substitution.')
state = app / 'programs/launch-custody/target/devnet-preview'
state.mkdir(parents=True, exist_ok=True)
env = {k: v for k, v in os.environ.items()
       if not k.startswith(('JEET_', 'NEXT_PUBLIC_JEET_')) and k != 'NODE_OPTIONS'}
env.update(NODE_OPTIONS='--max-old-space-size=1024',
           NEXT_PUBLIC_JEET_WALLET_NETWORK='devnet', JEET_DEVNET_WALLET='1',
           JEET_DEVNET_WALLET_ORIGIN=f'https://{name}-3019.app.github.dev',
           JEET_METADATA_STORAGE='pinata', JEET_MARKET_DB=str(state / 'market.sqlite'))
# Reuse only an existing operator-supplied server endpoint; app configuration checks its network.
if os.environ.get('JEET_DEVNET_WALLET_RPC'):
    env['JEET_DEVNET_WALLET_RPC'] = os.environ['JEET_DEVNET_WALLET_RPC']
os.chdir(app)
os.execvpe('node', ['node', 'node_modules/next/dist/bin/next', 'start',
                   '--hostname', '0.0.0.0', '--port', '3019'], env)
