#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

/* Privileged service lifetime only, never a worker/admission API. The guardian
 * retains the lock-owning OFD; the unprivileged service gets an O_PATH witness.
 * A witness can be duplicated/passed, but cannot flock/LOCK_UN the owner's OFD.
 */
static int exclusive_inherited(void) {
  FILE *info = fopen("/proc/self/fdinfo/9", "r");
  if (!info) return 0;
  char *line = NULL; size_t length = 0; int held = 0;
  while (getline(&line, &length, info) != -1)
    if (!strncmp(line, "lock:", 5) && strstr(line, " FLOCK ") && strstr(line, " WRITE ")) held = 1;
  free(line); fclose(info); return held;
}
static long long milliseconds(void) {
  struct timespec now;
  if (clock_gettime(CLOCK_MONOTONIC, &now)) return -1;
  return (long long)now.tv_sec * 1000 + now.tv_nsec / 1000000;
}
int main(int argc, char **argv) {
  if (argc < 6 || geteuid() != 0 || argv[1][0] != '/' || strcmp(argv[4], "/usr/bin/setpriv")) return 2;
  char *end = NULL; errno = 0; long grace = strtol(argv[2], &end, 10);
  if (errno || !end || *end || grace < 1 || grace > INT_MAX) return 2;
  errno = 0; long expected_parent = strtol(argv[3], &end, 10);
  if (errno || !end || *end || expected_parent < 1 || expected_parent > INT_MAX || getppid() != expected_parent) return 4;
  struct stat owner, witness;
  if (fstat(9, &owner) || !S_ISREG(owner.st_mode) || owner.st_uid != 0 || owner.st_nlink != 1
      || (owner.st_mode & 0777) != 0600 || !exclusive_inherited()) return 3;
  int path_fd = open(argv[1], O_PATH | O_NOFOLLOW | O_CLOEXEC);
  if (path_fd < 0 || fstat(path_fd, &witness) || witness.st_dev != owner.st_dev || witness.st_ino != owner.st_ino
      || !S_ISREG(witness.st_mode)) { if (path_fd >= 0) close(path_fd); return 3; }
  sigset_t events, previous;
  sigemptyset(&events); sigaddset(&events, SIGCHLD); sigaddset(&events, SIGTERM);
  sigaddset(&events, SIGINT); sigaddset(&events, SIGHUP);
  if (sigprocmask(SIG_BLOCK, &events, &previous)) { close(path_fd); return 4; }
  pid_t parent = (pid_t)expected_parent;
  if (prctl(PR_SET_PDEATHSIG, SIGTERM) || getppid() != parent) { close(path_fd); return 4; }
  pid_t child = fork();
  if (child < 0) { close(path_fd); return 4; }
  if (!child) {
    if (dup2(path_fd, 9) < 0 || sigprocmask(SIG_SETMASK, &previous, NULL)) _exit(126);
    if (path_fd != 9) close(path_fd);
    execv(argv[4], &argv[4]); _exit(127);
  }
  close(path_fd);
  /* Only the actual service owns its end of fd3; never prolong its IPC lifetime. */
  close(3);
  long long deadline = -1; int killed = 0, status = 0;
  for (;;) {
    pid_t waited = waitpid(child, &status, WNOHANG);
    if (waited == child) break;
    if (waited < 0 && errno != EINTR) return 5;
    struct timespec remaining, *timeout = NULL;
    if (deadline >= 0 && !killed) {
      long long now = milliseconds();
      if (now < 0 || now >= deadline) { kill(child, SIGKILL); killed = 1; }
      else { long long span = deadline - now; remaining.tv_sec = span / 1000;
        remaining.tv_nsec = (span % 1000) * 1000000; timeout = &remaining; }
    }
    int event = sigtimedwait(&events, NULL, timeout);
    if (event == SIGTERM || event == SIGINT || event == SIGHUP) {
      if (deadline < 0) { long long now = milliseconds();
        if (now < 0) { kill(child, SIGKILL); killed = 1; } else deadline = now + grace; }
      /* TERM must also reach a stopped service; waitpid is the death proof. */
      kill(child, SIGCONT); kill(child, event);
    } else if (event < 0 && errno != EAGAIN && errno != EINTR) {
      kill(child, SIGKILL); killed = 1;
    }
  }
  close(9);
  if (WIFEXITED(status)) return WEXITSTATUS(status);
  if (WIFSIGNALED(status)) {
    int signal_number = WTERMSIG(status);
    signal(signal_number, SIG_DFL); sigprocmask(SIG_SETMASK, &previous, NULL);
    raise(signal_number); return 128 + signal_number;
  }
  return 5;
}
