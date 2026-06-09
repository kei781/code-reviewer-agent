module.exports = {
  apps: [
    {
      name: "code-reviewer-agent",
      script: "dist/server/cli.js",
      interpreter: "node",
      node_args: "--env-file=.env",
      autorestart: true,
      max_restarts: 10
    }
  ]
};
