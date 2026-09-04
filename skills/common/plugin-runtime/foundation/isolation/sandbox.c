#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif
#include <errno.h>
#include <linux/audit.h>
#include <linux/filter.h>
#include <linux/landlock.h>
#include <linux/seccomp.h>
#include <fcntl.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <stddef.h>
#include <stdint.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/socket.h>
#include <sys/syscall.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <signal.h>
#include <grp.h>
#include <unistd.h>
#include <string.h>

#ifndef LANDLOCK_ACCESS_FS_REFER
#define LANDLOCK_ACCESS_FS_REFER (1ULL << 13)
#endif
#ifndef LANDLOCK_ACCESS_FS_TRUNCATE
#define LANDLOCK_ACCESS_FS_TRUNCATE (1ULL << 14)
#endif
#ifndef LANDLOCK_ACCESS_NET_CONNECT_TCP
#define LANDLOCK_ACCESS_NET_CONNECT_TCP (1ULL << 1)
#endif
#ifndef LANDLOCK_RULE_NET_PORT
#define LANDLOCK_RULE_NET_PORT 2
#endif
#ifndef SOCK_TYPE_MASK
#define SOCK_TYPE_MASK 0xf
#endif

struct kubeclaw_landlock_ruleset_attr_v4 {
  __u64 handled_access_fs;
  __u64 handled_access_net;
};

struct kubeclaw_landlock_net_port_attr {
  __u64 allowed_access;
  __u64 port;
};

static int add_path_rule(int ruleset_fd, const char *root, __u64 access) {
  int root_fd = open(root, O_PATH | O_CLOEXEC);
  if (root_fd < 0) return -1;
  struct stat root_stat;
  if (fstat(root_fd, &root_stat) != 0) {
    close(root_fd);
    return -1;
  }
  if (!S_ISDIR(root_stat.st_mode)) access &= ~LANDLOCK_ACCESS_FS_READ_DIR;
  struct landlock_path_beneath_attr path_rule = {
    .allowed_access = access,
    .parent_fd = root_fd,
  };
  int result = (int)syscall(__NR_landlock_add_rule, ruleset_fd,
    LANDLOCK_RULE_PATH_BENEATH, &path_rule, 0);
  close(root_fd);
  return result;
}

static int restrict_filesystem(const char *write_root, char **read_roots, int read_root_count) {
  int abi = (int)syscall(__NR_landlock_create_ruleset, NULL, 0, LANDLOCK_CREATE_RULESET_VERSION);
  if (abi < 2) { errno = ENOTSUP; return -1; }
  __u64 read_access = LANDLOCK_ACCESS_FS_EXECUTE | LANDLOCK_ACCESS_FS_READ_FILE
    | LANDLOCK_ACCESS_FS_READ_DIR;
  __u64 handled = read_access | LANDLOCK_ACCESS_FS_WRITE_FILE | LANDLOCK_ACCESS_FS_REMOVE_DIR
    | LANDLOCK_ACCESS_FS_REMOVE_FILE | LANDLOCK_ACCESS_FS_MAKE_CHAR
    | LANDLOCK_ACCESS_FS_MAKE_DIR | LANDLOCK_ACCESS_FS_MAKE_REG
    | LANDLOCK_ACCESS_FS_MAKE_SOCK | LANDLOCK_ACCESS_FS_MAKE_FIFO
    | LANDLOCK_ACCESS_FS_MAKE_BLOCK | LANDLOCK_ACCESS_FS_MAKE_SYM;
  handled |= LANDLOCK_ACCESS_FS_REFER;
  if (abi >= 3) handled |= LANDLOCK_ACCESS_FS_TRUNCATE;
  struct landlock_ruleset_attr ruleset = { .handled_access_fs = handled };
  int ruleset_fd = (int)syscall(__NR_landlock_create_ruleset, &ruleset, sizeof(ruleset), 0);
  if (ruleset_fd < 0) return -1;
  int result = add_path_rule(ruleset_fd, write_root, handled);
  for (int index = 0; result == 0 && index < read_root_count; index++) {
    result = add_path_rule(ruleset_fd, read_roots[index], read_access);
  }
  int null_fd = open("/dev/null", O_PATH | O_CLOEXEC);
  if (result == 0 && null_fd >= 0) {
    struct landlock_path_beneath_attr null_rule = {
      .allowed_access = LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_WRITE_FILE
        | (abi >= 3 ? LANDLOCK_ACCESS_FS_TRUNCATE : 0),
      .parent_fd = null_fd,
    };
    result = (int)syscall(__NR_landlock_add_rule, ruleset_fd,
      LANDLOCK_RULE_PATH_BENEATH, &null_rule, 0);
  }
  if (null_fd >= 0) close(null_fd);
  if (result != 0 || prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0
    || syscall(__NR_landlock_restrict_self, ruleset_fd, 0) != 0) {
    close(ruleset_fd);
    return -1;
  }
  close(ruleset_fd);
  return 0;
}

static int restrict_network(unsigned long long connect_tcp_port) {
  int abi = (int)syscall(__NR_landlock_create_ruleset, NULL, 0, LANDLOCK_CREATE_RULESET_VERSION);
  if (abi < 4) { errno = ENOTSUP; return -1; }
  struct kubeclaw_landlock_ruleset_attr_v4 ruleset = {
    .handled_access_fs = 0,
    .handled_access_net = LANDLOCK_ACCESS_NET_CONNECT_TCP,
  };
  int ruleset_fd = (int)syscall(__NR_landlock_create_ruleset, &ruleset, sizeof(ruleset), 0);
  if (ruleset_fd < 0) return -1;
  struct kubeclaw_landlock_net_port_attr port_rule = {
    .allowed_access = LANDLOCK_ACCESS_NET_CONNECT_TCP,
    .port = connect_tcp_port,
  };
  int result = (int)syscall(__NR_landlock_add_rule, ruleset_fd,
    LANDLOCK_RULE_NET_PORT, &port_rule, 0);
  if (result != 0 || prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0
    || syscall(__NR_landlock_restrict_self, ruleset_fd, 0) != 0) {
    close(ruleset_fd);
    return -1;
  }
  close(ruleset_fd);
  return 0;
}

#define DENY_SYSCALL(name) \
  BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, __NR_##name, 0, 1), \
  BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | (EPERM & SECCOMP_RET_DATA))

/* Denied syscalls return EPERM so approved runtimes can report a contained
   failure. KILL_PROCESS below is only the fail-closed wrong-architecture case. */

static int install_filter(int allow_network) {
  struct sock_filter filter[] = {
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, arch)),
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, AUDIT_ARCH_X86_64, 1, 0),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr)),
    DENY_SYSCALL(socket),
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
    DENY_SYSCALL(symlink),
    DENY_SYSCALL(symlinkat),
    DENY_SYSCALL(link),
    DENY_SYSCALL(linkat),
    DENY_SYSCALL(init_module),
    DENY_SYSCALL(finit_module),
    DENY_SYSCALL(delete_module),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
  };
  struct sock_filter network_filter[] = {
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, arch)),
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, AUDIT_ARCH_X86_64, 1, 0),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr)),
    /* Browser mode permits Internet-domain stream sockets only. Unix-domain
       sockets remain available for the browser process tree. Datagram and raw
       Internet sockets stay denied, including direct DNS and QUIC egress. */
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, __NR_socket, 0, 9),
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, args[0])),
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, AF_UNIX, 7, 0),
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, AF_INET, 2, 0),
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, AF_INET6, 1, 0),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | (EPERM & SECCOMP_RET_DATA)),
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, args[1])),
    BPF_STMT(BPF_ALU | BPF_AND | BPF_K, SOCK_TYPE_MASK),
    BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, SOCK_STREAM, 1, 0),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | (EPERM & SECCOMP_RET_DATA)),
    BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr)),
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
    DENY_SYSCALL(symlink),
    DENY_SYSCALL(symlinkat),
    DENY_SYSCALL(link),
    DENY_SYSCALL(linkat),
    DENY_SYSCALL(init_module),
    DENY_SYSCALL(finit_module),
    DENY_SYSCALL(delete_module),
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
  };
  struct sock_fprog program = {
    .len = (unsigned short)(allow_network ? sizeof(network_filter) / sizeof(network_filter[0]) : sizeof(filter) / sizeof(filter[0])),
    .filter = allow_network ? network_filter : filter,
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

static int join_cgroup(const char *root) {
  char file[PATH_MAX];
  if (snprintf(file, sizeof(file), "%s/cgroup.procs", root) < 0
    || strlen(file) >= sizeof(file)) return -1;
  int descriptor = open(file, O_WRONLY | O_CLOEXEC);
  if (descriptor < 0) return -1;
  char pid[32];
  int length = snprintf(pid, sizeof(pid), "%ld\n", (long)getpid());
  int result = length > 0 && write(descriptor, pid, (size_t)length) == length ? 0 : -1;
  close(descriptor);
  return result;
}

static volatile sig_atomic_t terminate_requested = 0;
static int supervisor_children_fd = -1;

static void request_termination(int signal_number) {
  terminate_requested = signal_number;
}

static int signal_children(int signal_number) {
  if (supervisor_children_fd < 0 || lseek(supervisor_children_fd, 0, SEEK_SET) < 0) return 0;
  char children[16384];
  ssize_t children_length = read(supervisor_children_fd, children, sizeof(children) - 1);
  if (children_length < 1) return 0;
  children[children_length] = '\0';
  char *cursor = children;
  while (*cursor != '\0') {
    char *end = NULL;
    long candidate = strtol(cursor, &end, 10);
    if (end == cursor) break;
    if (candidate > 0) kill((pid_t)candidate, signal_number);
    cursor = end;
  }
  return 0;
}

static int reap_adopted_children(void) {
  for (;;) {
    int status = 0;
    pid_t child = waitpid(-1, &status, WNOHANG);
    if (child > 0) continue;
    if (child == 0) return 1;
    if (errno == ECHILD) return 0;
    if (errno == EINTR) continue;
    return -1;
  }
}

static int supervise(char **program) {
  if (prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0) != 0) return -1;
  pid_t main_child = fork();
  if (main_child < 0) return -1;
  if (main_child == 0) {
    signal(SIGTERM, SIG_DFL);
    signal(SIGINT, SIG_DFL);
    execv(program[0], program);
    perror("execv");
    _exit(71);
  }
  struct sigaction action = {0};
  action.sa_handler = request_termination;
  sigemptyset(&action.sa_mask);
  sigaction(SIGTERM, &action, NULL);
  sigaction(SIGINT, &action, NULL);
  int main_status = 0;
  int main_complete = 0;
  for (;;) {
    if (terminate_requested || main_complete) {
      if (signal_children(SIGTERM) != 0) return -1;
      for (int iteration = 0; iteration < 20; iteration++) {
        int remaining = reap_adopted_children();
        if (remaining < 0) return -1;
        if (remaining == 0) break;
        usleep(5000);
      }
      if (signal_children(SIGKILL) != 0) return -1;
    }
    int status = 0;
    pid_t child = waitpid(-1, &status, 0);
    if (child < 0) {
      if (errno == EINTR) continue;
      if (errno == ECHILD) break;
      return -1;
    }
    if (child == main_child) {
      main_status = status;
      main_complete = 1;
    }
  }
  if (WIFEXITED(main_status)) return WEXITSTATUS(main_status);
  if (WIFSIGNALED(main_status)) {
    int signal_number = WTERMSIG(main_status);
    signal(signal_number, SIG_DFL);
    raise(signal_number);
    return 128 + signal_number;
  }
  return 70;
}

int main(int argc, char **argv) {
  if (argc < 5) {
    fprintf(stderr, "usage: plugin-sandbox <memory-bytes> <cpu-seconds> <max-files> [--allow-network] [--connect-tcp-port port] [--run-as-uid uid --run-as-gid gid] [--no-address-space-limit] [--cgroup path] [--read-root path]... [--write-root path] <program> [args...]\n");
    return 64;
  }
  char *end = NULL;
  unsigned long long memory = strtoull(argv[1], &end, 10);
  if (!end || *end != '\0' || memory < 16777216ULL) return 64;
  unsigned long long cpu = strtoull(argv[2], &end, 10);
  if (!end || *end != '\0' || cpu < 1ULL) return 64;
  unsigned long long files = strtoull(argv[3], &end, 10);
  if (!end || *end != '\0' || files < 8ULL) return 64;
  char children_file[64];
  snprintf(children_file, sizeof(children_file), "/proc/%ld/task/%ld/children",
    (long)getpid(), (long)getpid());
  supervisor_children_fd = open(children_file, O_RDONLY | O_CLOEXEC);
  if (supervisor_children_fd < 0) {
    perror("open task children");
    return 70;
  }
  int program_index = 4;
  int allow_network = 0;
  int no_address_space_limit = 0;
  unsigned long long connect_tcp_port = 0;
  unsigned long long run_as_uid = ULLONG_MAX;
  unsigned long long run_as_gid = ULLONG_MAX;
  while (argc > program_index) {
    if (strcmp(argv[program_index], "--allow-network") == 0) allow_network = 1;
    else if (strcmp(argv[program_index], "--no-address-space-limit") == 0) no_address_space_limit = 1;
    else if (strcmp(argv[program_index], "--connect-tcp-port") == 0) {
      if (argc <= program_index + 1) return 64;
      connect_tcp_port = strtoull(argv[program_index + 1], &end, 10);
      if (!end || *end != '\0' || connect_tcp_port < 1ULL || connect_tcp_port > 65535ULL) return 64;
      program_index += 2;
      continue;
    }
    else if (strcmp(argv[program_index], "--run-as-uid") == 0 || strcmp(argv[program_index], "--run-as-gid") == 0) {
      int is_uid = strcmp(argv[program_index], "--run-as-uid") == 0;
      if (argc <= program_index + 1) return 64;
      unsigned long long identity = strtoull(argv[program_index + 1], &end, 10);
      if (!end || *end != '\0' || identity > UINT_MAX) return 64;
      if (is_uid) run_as_uid = identity; else run_as_gid = identity;
      program_index += 2;
      continue;
    }
    else break;
    program_index += 1;
  }
  unsigned long long address_space = memory > (ULLONG_MAX / 8ULL)
    ? ULLONG_MAX
    : memory * 8ULL;
  if (address_space < 2147483648ULL) address_space = 2147483648ULL;
  /* Browser processes reserve very large virtual address ranges. When the
     explicit exemption is selected, the caller measures the complete adopted
     process tree and applies the memory ceiling to resident bytes. Keep the
     seccomp filter and kernel CPU/file ceilings in all modes. */
  if (
    (!no_address_space_limit && limit_resource(RLIMIT_AS, address_space) != 0)
    || limit_resource(RLIMIT_CPU, cpu) != 0
    || limit_resource(RLIMIT_NOFILE, files) != 0
    || limit_resource(RLIMIT_CORE, 0) != 0
  ) {
    perror("setrlimit");
    return 70;
  }
  if (argc >= program_index + 2 && strcmp(argv[program_index], "--cgroup") == 0) {
    if (join_cgroup(argv[program_index + 1]) != 0) {
      perror("cgroup");
      return 70;
    }
    program_index += 2;
  }
  if ((run_as_uid == ULLONG_MAX) != (run_as_gid == ULLONG_MAX)) return 64;
  if (run_as_uid != ULLONG_MAX) {
    if (setgroups(0, NULL) != 0
      || setresgid((gid_t)run_as_gid, (gid_t)run_as_gid, (gid_t)run_as_gid) != 0
      || setresuid((uid_t)run_as_uid, (uid_t)run_as_uid, (uid_t)run_as_uid) != 0) {
      perror("set identity");
      return 70;
    }
  }
  char *read_roots[64];
  int read_root_count = 0;
  while (argc >= program_index + 2 && strcmp(argv[program_index], "--read-root") == 0) {
    if (read_root_count >= 64) return 64;
    read_roots[read_root_count++] = argv[program_index + 1];
    program_index += 2;
  }
  if (argc >= program_index + 2 && strcmp(argv[program_index], "--write-root") == 0) {
    if (restrict_filesystem(argv[program_index + 1], read_roots, read_root_count) != 0) {
      perror("landlock");
      return 70;
    }
    program_index += 2;
  }
  if (connect_tcp_port > 0 && restrict_network(connect_tcp_port) != 0) {
    perror("landlock network");
    return 70;
  }
  if (program_index >= argc) return 64;
  if (install_filter(allow_network) != 0) {
    perror("seccomp");
    return 70;
  }
  int supervised = supervise(&argv[program_index]);
  if (supervised < 0) {
    perror("supervise");
    return 70;
  }
  return supervised;
}
