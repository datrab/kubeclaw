#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <grp.h>
#include <linux/magic.h>
#include <limits.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/stat.h>
#include <sys/vfs.h>
#include <unistd.h>

/* Trusted supervisor entry only. Not setuid and never callable with retained privilege. */
static void fail(const char *code) {
  fprintf(stderr, "%s\n", code);
  _exit(125);
}

static unsigned int identity(const char *text) {
  char *end = NULL;
  errno = 0;
  unsigned long value = strtoul(text, &end, 10);
  if (errno || !*text || *end || value == 0 || value >= 4294967295UL || text[0] == '-') {
    fail("WORKER_NATIVE_LAUNCH_IDENTITY_INVALID");
  }
  return (unsigned int)value;
}

static void scope_name(const char *value) {
  char canonical[PATH_MAX];
  if (!realpath(value, canonical) || strcmp(value, canonical)) fail("WORKER_NATIVE_LAUNCH_SCOPE_INVALID");
  const char *name = strrchr(canonical, '/');
  if (!name || strlen(++name) != 43 || strncmp(name, "worker-", 7)) fail("WORKER_NATIVE_LAUNCH_SCOPE_INVALID");
  for (int index = 7; index < 43; ++index) {
    if (index == 15 || index == 20 || index == 25 || index == 30) {
      if (name[index] != '-') fail("WORKER_NATIVE_LAUNCH_SCOPE_INVALID");
    } else if (!((name[index] >= '0' && name[index] <= '9') || (name[index] >= 'a' && name[index] <= 'f'))) {
      fail("WORKER_NATIVE_LAUNCH_SCOPE_INVALID");
    }
  }
}

int main(int argc, char **argv) {
  if (argc < 5 || argv[1][0] != '/' || argv[4][0] != '/') fail("WORKER_NATIVE_LAUNCH_ARGUMENTS_INVALID");
  if (getuid() != 0 || geteuid() != 0) fail("WORKER_NATIVE_SUPERVISOR_IDENTITY_REQUIRED");
  const char *parent = getenv("KUBECLAW_NATIVE_SUPERVISOR_PID");
  if (!parent) fail("WORKER_NATIVE_LAUNCH_PARENT_REQUIRED");
  unsigned int supervisor = identity(parent);
  if (supervisor > INT_MAX || prctl(PR_SET_PDEATHSIG, SIGKILL) || getppid() != (pid_t)supervisor) {
    fail("WORKER_NATIVE_LAUNCH_PARENT_LOST");
  }
  uid_t uid = identity(argv[2]);
  gid_t gid = identity(argv[3]);
  scope_name(argv[1]);
  int scope = open(argv[1], O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
  struct stat info;
  struct statfs filesystem;
  if (scope < 0 || fstatfs(scope, &filesystem) || filesystem.f_type != CGROUP2_SUPER_MAGIC
      || fstat(scope, &info) || info.st_uid != 0 || (info.st_mode & 0022)) {
    fail("WORKER_NATIVE_LAUNCH_SCOPE_INVALID");
  }
  int membership = openat(scope, "cgroup.procs", O_WRONLY | O_CLOEXEC | O_NOFOLLOW);
  if (membership < 0 || fstat(membership, &info) || info.st_uid != 0 || (info.st_mode & 0022)) {
    fail("WORKER_NATIVE_LAUNCH_MEMBERSHIP_INVALID");
  }
  /* The kernel treats 0 as the caller. No executable work or descendant precedes membership. */
  if (write(membership, "0", 1) != 1) fail("WORKER_NATIVE_LAUNCH_ATTACH_FAILED");
  if (close(membership) || close(scope)) fail("WORKER_NATIVE_LAUNCH_CLOSE_FAILED");
  if (setenv("KUBECLAW_NATIVE_SCOPE", argv[1], 1)) fail("WORKER_NATIVE_LAUNCH_ENVIRONMENT_FAILED");
  if (setgroups(0, NULL) || setresgid(gid, gid, gid) || setresuid(uid, uid, uid)
      || prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0)) fail("WORKER_NATIVE_LAUNCH_DROP_PRIVILEGE_FAILED");
  if (getuid() != uid || geteuid() != uid || getgid() != gid || getegid() != gid) {
    fail("WORKER_NATIVE_LAUNCH_PRIVILEGE_RETAINED");
  }
  /* Credential changes clear PDEATHSIG. Re-arm and check the original parent
     again, closing the death race before any trusted role code executes. */
  if (prctl(PR_SET_PDEATHSIG, SIGKILL) || getppid() != (pid_t)supervisor) {
    fail("WORKER_NATIVE_LAUNCH_PARENT_LOST");
  }
  execv(argv[4], &argv[4]);
  fail("WORKER_NATIVE_LAUNCH_EXEC_FAILED");
}
