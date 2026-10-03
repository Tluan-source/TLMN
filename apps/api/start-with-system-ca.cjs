const { spawn } = require('node:child_process');
const { resolve } = require('node:path');

const mode = process.argv[2];
const command = mode === 'dev'
  ? [require.resolve('@nestjs/cli/bin/nest.js'), 'start', '--watch']
  : mode === 'prod'
    ? [resolve('dist/main.js')]
    : null;

if (!command) {
  throw new Error('Expected dev or prod mode.');
}

const child = spawn(process.execPath, command, {
  cwd: process.cwd(),
  env: { ...process.env, NODE_USE_SYSTEM_CA: process.env.NODE_USE_SYSTEM_CA || '1' },
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
