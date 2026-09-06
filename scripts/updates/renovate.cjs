// Administrative configuration: only the trusted, read-only mounted updater can run.
module.exports = {
  platform: 'github', onboarding: false, requireConfig: 'required',
  autodiscover: false, repositories: [process.env.GITHUB_REPOSITORY],
  allowedCommands: ['^node /opt/kubeclaw-updates/updates/refresh-versions\\.mjs$'],
  allowScripts: false, allowPlugins: false,
  allowShellExecutorForPostUpgradeCommands: false,
  binarySource: 'install',
};
