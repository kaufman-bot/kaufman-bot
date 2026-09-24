module.exports = {
  apps: [
    {
      name: 'kaufman-bot-backend-prod',
      cwd: 'backend',
      script: 'npm',
      args: 'run start:prod',
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
