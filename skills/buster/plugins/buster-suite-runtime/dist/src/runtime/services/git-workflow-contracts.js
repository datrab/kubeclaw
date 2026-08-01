export function logGit(logger, level, message) {
    if (logger)
        logger[level]?.('GIT', message);
}
