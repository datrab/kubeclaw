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

static int uuid_name(const char *name, const char *prefix) {
  size_t offset = strlen(prefix);
  if (strlen(name) != offset + 36 || strncmp(name, prefix, offset)) return 0;
  for (int index = 0; index < 36; ++index) {
    char character = name[offset + index];
    if (index == 8 || index == 13 || index == 18 || index == 23) {
      if (character != '-') return 0;
    } else if (!((character >= '0' && character <= '9') || (character >= 'a' && character <= 'f'))) return 0;
  }
  return 1;
}

static void scope_parent(const char *value, char *parent) {
  char canonical[PATH_MAX];
  if (!realpath(value, canonical) || strcmp(value, canonical)) fail("WORKER_NATIVE_LAUNCH_SCOPE_INVALID");
  char *leaf = strrchr(canonical, '/');
  if (!leaf || (strcmp(leaf + 1, "host") && !uuid_name(leaf + 1, "helper-"))) fail("WORKER_NATIVE_LAUNCH_SCOPE_INVALID");
  *leaf = '\0';
  const char *name = strrchr(canonical, '/');
  if (!name || !uuid_name(name + 1, "worker-")) fail("WORKER_NATIVE_LAUNCH_SCOPE_INVALID");
  strcpy(parent, canonical);
}

static unsigned long long binding_number(const char *text) {
  char *end = NULL;
  errno = 0;
  unsigned long long value = strtoull(text, &end, 10);
  if (errno || !*text || *end || text[0] < '0' || text[0] > '9') fail("WORKER_NATIVE_LAUNCH_BINDING_INVALID");
  return value;
}

static int bound_scope(const char *value, const char *device, const char *inode) {
  int scope = open(value, O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
  struct stat info;
  struct statfs filesystem;
  if (scope < 0 || fstatfs(scope, &filesystem) || filesystem.f_type != CGROUP2_SUPER_MAGIC
      || fstat(scope, &info) || info.st_uid != 0 || (info.st_mode & 0022)) fail("WORKER_NATIVE_LAUNCH_SCOPE_INVALID");
  if ((unsigned long long)info.st_dev != binding_number(device)
      || (unsigned long long)info.st_ino != binding_number(inode)) fail("WORKER_NATIVE_LAUNCH_BINDING_INVALID");
  return scope;
}

int main(int argc, char **argv) {
  if (argc < 9 || argv[1][0] != '/' || argv[8][0] != '/') fail("WORKER_NATIVE_LAUNCH_ARGUMENTS_INVALID");
  if (getuid() != 0 || geteuid() != 0) fail("WORKER_NATIVE_SUPERVISOR_IDENTITY_REQUIRED");
  const char *parent = getenv("KUBECLAW_NATIVE_SUPERVISOR_PID");
  if (!parent) fail("WORKER_NATIVE_LAUNCH_PARENT_REQUIRED");
  unsigned int supervisor = identity(parent);
  if (supervisor > INT_MAX || prctl(PR_SET_PDEATHSIG, SIGKILL) || getppid() != (pid_t)supervisor) {
    fail("WORKER_NATIVE_LAUNCH_PARENT_LOST");
  }
  uid_t uid = identity(argv[6]);
  gid_t gid = identity(argv[7]);
  char parent_path[PATH_MAX];
  scope_parent(argv[1], parent_path);
  int aggregate = bound_scope(parent_path, argv[2], argv[3]);
  int scope = bound_scope(argv[1], argv[4], argv[5]);
  /* Verify that the pinned child still belongs to the pinned aggregate. */
  int parent_fd = openat(scope, "..", O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
  struct stat parent_info;
  struct stat info;
  if (parent_fd < 0 || fstat(parent_fd, &parent_info) || fstat(aggregate, &info)
      || parent_info.st_dev != info.st_dev || parent_info.st_ino != info.st_ino) fail("WORKER_NATIVE_LAUNCH_BINDING_INVALID");
  if (close(parent_fd) || close(aggregate)) fail("WORKER_NATIVE_LAUNCH_CLOSE_FAILED");
  int membership = openat(scope, "cgroup.procs", O_WRONLY | O_CLOEXEC | O_NOFOLLOW);
  if (membership < 0 || fstat(membership, &info) || info.st_uid != 0 || (info.st_mode & 0022)) {
    fail("WORKER_NATIVE_LAUNCH_MEMBERSHIP_INVALID");
  }
  /* The kernel treats 0 as the caller. No executable work or descendant precedes membership. */
  if (write(membership, "0", 1) != 1) fail("WORKER_NATIVE_LAUNCH_ATTACH_FAILED");
  if (close(membership) || close(scope)) fail("WORKER_NATIVE_LAUNCH_CLOSE_FAILED");
  if (setenv("KUBECLAW_NATIVE_SCOPE", parent_path, 1)) fail("WORKER_NATIVE_LAUNCH_ENVIRONMENT_FAILED");
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
  execv(argv[8], &argv[8]);
  fail("WORKER_NATIVE_LAUNCH_EXEC_FAILED");
}
