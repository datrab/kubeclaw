#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <unistd.h>

/* Linux build-time publication only: never replace an existing generation. */
int main(int argc, char **argv) {
  if (argc != 3) return 2;
  if (renameat2(AT_FDCWD, argv[1], AT_FDCWD, argv[2], RENAME_NOREPLACE) != 0) {
    perror("PIPELINE_GENERATION_PUBLISH");
    return errno == EEXIST ? 3 : 1;
  }
  return 0;
}
