#!/usr/bin/env python3
"""Explicit isolated read-preview acceptance; no Solana or Vercel calls.

Temporarily deploys the authenticated recovery wrapper, then restores the normal
Worker in finally. Only its fixed disposable marker and read quotas are written.
No synthetic trades or launches are inserted into historical index streams.
"""
import concurrent.futures
import hashlib
import json
import os
import pathlib
import secrets
import subprocess
import sys
import time
import tomllib
import urllib.error
import urllib.request

ACCOUNT = '060a9dcc510ac73c02bc9915bd946e36'
WORKER = 'jeet-launch-shared-mainnet-read-preview'
URL = 'https://' + WORKER + '.victorriccardi24.workers.dev'
PROGRAM = '5PeRukdBmgnWVXvpz9cP1kxcQfDd4mF7h1h2xDb7To4Y'
NAMESPACE = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d:' + PROGRAM
DEVNET = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG:Fs39Nso7hzYw84u75RzSLTUE9YrD8zgkk1bLfgAiX72D'
DEVNET_STORAGE = 'c62e688aa16242de8265ae4742c3e9a1'
app, cli = map(pathlib.Path, sys.argv[1:3])
private = pathlib.Path.home() / '.config/jeet-launch-mainnet-read-preview'
token_file = private / 'backend-token'
assert token_file.stat().st_mode & 0o777 == 0o600
TOKEN = token_file.read_text().strip()
assert len(TOKEN) == 64
config = app / 'workers/shared-devnet/wrangler.mainnet-read-preview.jsonc'
cfg = json.loads(config.read_text())
assert cfg['name'] == WORKER and cfg['account_id'] == ACCOUNT
assert cfg['vars'] == {'JEET_SHARED_PROFILE': 'mainnet', 'JEET_SHARED_MAINNET_PROGRAM_ID': PROGRAM}
assert cfg['workers_dev'] and not cfg['preview_urls'] and not cfg.get('routes')
report = {'endpoint': URL, 'requests': 0, 'checks': [], 'solanaRequests': 0,
          'vercelChanges': 0, 'syntheticHistoryEventsInserted': 0}


def run_cli(args, label):
    result = subprocess.run(['node', str(cli), *args], cwd=app,
                            env=dict(os.environ, WRANGLER_SEND_METRICS='false'),
                            text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    (private / (label + '.log')).write_text(result.stdout.replace(TOKEN, '[REDACTED]'))
    assert result.returncode == 0, label + ' failed; inspect protected log'
    return result.stdout


def api(path):
    auth = tomllib.loads((pathlib.Path.home() / '.config/.wrangler/config/default.toml').read_text())['oauth_token']
    req = urllib.request.Request('https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT + path,
                                 headers={'Authorization': 'Bearer ' + auth, 'User-Agent': 'JeeT-Launch-Backend/1.0'})
    with urllib.request.urlopen(req, timeout=20) as response:
        body = json.load(response)
    assert body['success']
    return body['result']


def raw(op, args, auth=True, method='POST', oversized=False):
    # Track logical requests, including concurrent calls, after joining futures below.
    data = b'x' * 131073 if oversized else json.dumps({'op': op, 'args': args}).encode()
    headers = {'Content-Type': 'application/json', 'User-Agent': 'JeeT-Launch-Backend/1.0'}
    if auth:
        headers['Authorization'] = 'Bearer ' + (TOKEN if auth is True else 'invalid-test-credential')
    req = urllib.request.Request(URL + '/v1/index', data=data if method == 'POST' else None,
                                 headers=headers, method=method)
    try:
        response = urllib.request.urlopen(req, timeout=20)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        status, payload = response.status, response.read(262145)
    assert len(payload) <= 262144
    return status, json.loads(payload)['result'] if status == 200 else None


def call(op, args):
    report['requests'] += 1
    status, value = raw(op, args)
    assert status == 200, op + ' returned ' + str(status)
    return value


def check(label):
    report['checks'].append(label)
    print('PASS', label, flush=True)


probe_attempted = False
try:
    assert ACCOUNT in run_cli(['whoami'], 'whoami-acceptance')
    assert api('')['id'] == ACCOUNT
    initial = api('/workers/scripts')
    devnet_before = next(x for x in initial if x['id'] == 'jeet-launch-shared-devnet')['modified_on']
    namespaces = api('/workers/durable_objects/namespaces')
    space = next(x for x in namespaces if x['script'] == WORKER)
    assert space['use_sqlite'] and space['id'] != DEVNET_STORAGE
    report['namespaceId'] = space['id']
    check('Authenticated account and separate Mainnet SQLite namespace')
    for auth in [False, 'invalid']:
        report['requests'] += 1
        assert raw('checkpoint', [NAMESPACE, 'launch-activations-v1'], auth=auth)[0] == 401
    for operation, args in [('checkpoint', [DEVNET, 'launch-activations-v1']),
                            ('checkpoint', [NAMESPACE.replace(PROGRAM, DEVNET.split(':')[1]), 'launch-activations-v1']),
                            ('exec', ['DROP TABLE launches'])]:
        report['requests'] += 1
        assert raw(operation, args)[0] == 400
    report['requests'] += 2
    assert raw('checkpoint', [NAMESPACE, 'launch-activations-v1'], method='GET')[0] == 404
    assert raw('checkpoint', [], oversized=True)[0] == 413
    check('Authentication, network/program isolation, bounded operation surface and request bodies')
    cursor = call('checkpoint', [NAMESPACE, 'launch-activations-v1'])
    history = call('historySnapshot', [NAMESPACE, PROGRAM + ':curve'])
    assert history['events'] == [], 'Fixture must not contain fabricated historical events'
    report['historyScope'] = 'Empty fixture-program history only; no deployed JeeT Mainnet program acceptance'
    probe_attempted = True
    run_cli(['deploy', str(app / 'scripts/readiness/mainnet-worker-recovery-probe.mjs'),
             '--config', str(config)], 'recovery-probe-deploy')
    nonce = secrets.token_hex(32)
    assert call('__jeet_probe_seed', [nonce]) is True
    remaining = 60 - time.time() % 60
    if remaining < 20:
        time.sleep(remaining + 0.2)
    minute = int(time.time() // 60)
    client = hashlib.sha256(('jeet-mainnet-hosted-read-quota:' + nonce).encode()).hexdigest()
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        outcomes = list(pool.map(lambda _: raw('admit', [client, 'read']), range(61)))
    report['requests'] += len(outcomes)
    assert all(status == 200 for status, value in outcomes)
    assert sum(value is True for status, value in outcomes) == 60
    assert sum(value is False for status, value in outcomes) == 1
    check('61 independent concurrent HTTP requests share a 60-request client allowance')
    before = call('__jeet_probe_state', [])
    assert before['marker'] == nonce and before['globalRead'][0]['count'] >= 60
    report['requests'] += 1
    assert raw('__jeet_probe_abort', [])[0] == 503
    after = call('__jeet_probe_state', [])
    assert before['instance'] != after['instance'] and after['marker'] == nonce
    assert int(time.time() // 60) == minute, 'Quota window changed during acceptance'
    assert after['globalRead'][0]['window'] == before['globalRead'][0]['window']
    assert after['globalRead'][0]['count'] >= before['globalRead'][0]['count']
    assert call('admit', [client, 'read']) is False
    assert call('checkpoint', [NAMESPACE, 'launch-activations-v1']) == cursor
    assert call('historySnapshot', [NAMESPACE, PROGRAM + ':curve']) == history
    report['restart'] = {'instanceChanged': True, 'markerRecovered': True,
                         'globalReadBefore': before['globalRead'], 'globalReadAfter': after['globalRead'],
                         'clientAllowanceStillExhausted': True, 'databaseBytes': after['databaseBytes']}
    check('Forced object restart retains marker, cursor, empty history, and client/global quotas')
    assert call('__jeet_probe_clear', []) is True
    assert call('__jeet_probe_state', [])['marker'] is None
except Exception as error:
    report['error'] = type(error).__name__ + ': ' + str(error).replace(TOKEN, '[REDACTED]')[:400]
finally:
    try:
        if probe_attempted:
            run_cli(['deploy', '--config', str(config)], 'normal-worker-restored')
            report['normalWorkerRestored'] = True
            for op in ['__jeet_probe_seed', '__jeet_probe_state', '__jeet_probe_abort', '__jeet_probe_clear']:
                report['requests'] += 1
                assert raw(op, [secrets.token_hex(32)] if op.endswith('seed') else [])[0] == 400
            check('Normal Worker restored and all temporary diagnostic operations removed')
        final = api('/workers/scripts')
        assert next(x for x in final if x['id'] == 'jeet-launch-shared-devnet')['modified_on'] == devnet_before
        assert next(x for x in api('/workers/durable_objects/namespaces') if x['script'] == WORKER)['id'] == report['namespaceId']
        check('Devnet Worker unchanged and Mainnet namespace preserved')
    except Exception as error:
        report['restoreError'] = type(error).__name__ + ': ' + str(error).replace(TOKEN, '[REDACTED]')[:400]
    report['status'] = 'FAIL' if 'error' in report or 'restoreError' in report else 'PASS'
    (private / 'hosted-acceptance.json').write_text(json.dumps(report, indent=2) + '\n')
    print('HOSTED_ACCEPTANCE', json.dumps(report), flush=True)
sys.exit(0 if report['status'] == 'PASS' else 1)
