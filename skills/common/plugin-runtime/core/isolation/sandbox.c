#define _GNU_SOURCE
#include <errno.h>
#include <linux/audit.h>
#include <linux/filter.h>
#include <linux/seccomp.h>
#include <stddef.h>
#include <stdint.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/syscall.h>
#include <unistd.h>

#define DENY_SYSCALL(name) \
  BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, __NR_##name, 0, 1), \
  BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | (EPERM & SECCOMP_RET_DATA))

static int install_filter(void) {
  struct sock_filter filter[] = {
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, arch)),
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, AUDIT_ARCH_X86_64, 1, 0),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr)),
    DENY_SYSCALL(socket),
    DENY_SYSCALL(socketpair),
    DENY_SYSCALL(connect),
    DENY_SYSCALL(bind),
    DENY_SYSCALL(listen),
    DENY_SYSCALL(accept),
    DENY_SYSCALL(accept4),
    DENY_SYSCALL(sendto),
    DENY_SYSCALL(sendmsg),
    DENY_SYSCALL(recvfrom),
    DENY_SYSCALL(recvmsg),
    DENY_SYSCALL(ptrace),
    DENY_SYSCALL(mount),
    DENY_SYSCALL(umount2),
    DENY_SYSCALL(unshare),
    DENY_SYSCALL(setns),
    DENY_SYSCALL(bpf),
    DENY_SYSCALL(perf_event_open),
    DENY_SYSCALL(keyctl),
    DENY_SYSCALL(add_key),
    DENY_SYSCALL(request_key),
    DENY_SYSCALL(open_by_handle_at),
    DENY_SYSCALL(init_module),
    DENY_SYSCALL(finit_module),
    DENY_SYSCALL(delete_module),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
  };
  struct sock_fprog program = {
    .len = (unsigned short)(sizeof(filter) / sizeof(filter[0])),
    .filter = filter,
  };
  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) return -1;
  return prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &program);
}

static int limit_resource(int resource, unsigned long long value) {
  struct rlimit limit = {
    .rlim_cur = (rlim_t)value,
    .rlim_max = (rlim_t)value,
  };
  return setrlimit(resource, &limit);
}

int main(int argc, char **argv) {
  if (argc < 5) {
    fprintf(stderr, "usage: plugin-sandbox <memory-bytes> <cpu-seconds> <max-files> <program> [args...]\n");
    return 64;
  }
  char *end = NULL;
  unsigned long long memory = strtoull(argv[1], &end, 10);
  if (!end || *end != '\0' || memory < 16777216ULL) return 64;
  unsigned long long cpu = strtoull(argv[2], &end, 10);
  if (!end || *end != '\0' || cpu < 1ULL) return 64;
  unsigned long long files = strtoull(argv[3], &end, 10);
  if (!end || *end != '\0' || files < 8ULL) return 64;
  unsigned long long address_space = memory > (ULLONG_MAX / 8ULL)
    ? ULLONG_MAX
    : memory * 8ULL;
  if (address_space < 2147483648ULL) address_space = 2147483648ULL;
  if (
    limit_resource(RLIMIT_AS, address_space) != 0
    || limit_resource(RLIMIT_CPU, cpu) != 0
    || limit_resource(RLIMIT_NOFILE, files) != 0
    || limit_resource(RLIMIT_NPROC, 32) != 0
    || limit_resource(RLIMIT_CORE, 0) != 0
  ) {
    perror("setrlimit");
    return 70;
  }
  if (install_filter() != 0) {
    perror("seccomp");
    return 70;
  }
  execv(argv[4], &argv[4]);
  perror("execv");
  return 71;
}
