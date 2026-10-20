module.exports = {
  apps: [
    {
      name: 'kaufman-bot-backend-prod',
      cwd: 'backend',
      // Запускаем скомпилированный вход напрямую: в cluster-режиме PM2
      // перехватывает stdout/stderr только у того процесса, который сам
      // форкает, поэтому обёртка через npm теряла логи приложения.
      script: 'dist/main.js',
      // dist/main.js читает DATABASE_URL из процесса, а ConfigModule не
      // подключён — env-файл отдаём через node-флаг (абсолютный путь,
      // чтобы не зависеть от chdir внутри cluster-worker'а).
      node_args: `--env-file=${__dirname}/backend/.env`,
      watch: false,
      instances: 1,
      exec_mode: 'cluster',
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
