module.exports = {
  apps: [
    {
      name: 'kaufman-bot-backend',
      cwd: 'backend',
      script: 'npm',
      args: 'run start:dev',
      watch: false,
      env: {
        NODE_ENV: 'development',
      },
    },
    {
      name: 'kaufman-bot-frontend',
      cwd: 'frontend',
      script: 'npm',
      args: 'run start',
      watch: false,
      env: {
        NODE_ENV: 'development',
      },
    },
    {
      name: 'kaufman-bot-tunnel',
      script: 'tuna',
      args: 'http 4200',
      watch: false,
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
};
