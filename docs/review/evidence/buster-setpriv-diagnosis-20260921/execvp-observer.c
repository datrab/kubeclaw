#define _GNU_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <unistd.h>

/* Private guest diagnostic, never a production helper. It changes no credentials. */
int execvp(const char *file, char *const argv[]) {
  int (*original)(const char *, char *const[]) = dlsym(RTLD_NEXT, "execvp");
  if (original == NULL) {
    static const char error[] = "PREEXEC_OBSERVER_RESOLVE_FAILED\n";
    (void)write(STDERR_FILENO, error, sizeof(error) - 1);
    errno = ENOSYS;
    return -1;
  }
  char status[8192];
  int fd = open("/proc/self/status", O_RDONLY | O_CLOEXEC);
  if (fd < 0) return -1;
  ssize_t length = read(fd, status, sizeof(status));
  int saved = errno;
  (void)close(fd);
  if (length < 0) { errno = saved; return -1; }
  if (length == (ssize_t)sizeof(status)) { errno = EOVERFLOW; return -1; }
  static const char begin[] = "PREEXEC_OBSERVER_STATUS_BEGIN\n";
  static const char end[] = "PREEXEC_OBSERVER_STATUS_END\n";
  if (write(STDERR_FILENO, begin, sizeof(begin) - 1) != (ssize_t)(sizeof(begin) - 1)
      || write(STDERR_FILENO, status, (size_t)length) != length
      || write(STDERR_FILENO, end, sizeof(end) - 1) != (ssize_t)(sizeof(end) - 1)) {
    errno = EIO;
    return -1;
  }
  return original(file, argv);
}
