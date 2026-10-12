# Independent Python prerequisite review

The extracted Python prerequisite is accepted for bounded guest preparation. This
review does not accept the stop producer, immutable-tree verifier, or a guest run.

Independent checks reverified all 21 APK signatures with the existing Alpine
trusted keys and matched each archive's byte count and SHA-256. The trusted-key
hashes match the author's recorded trust root. All 42 dependency constraints in
the signed package metadata resolve within these 21 packages, including version
constraints checked with `apk version --test`.

The exact runtime entry set matches all 1,483 recorded paths, types, modes, file
sizes and hashes. All 19 symlinks resolve inside the private extraction root.
Regular files total 48,106,065 bytes. An independent repeat of the actual extracted
Python 3.14.7 `-I` probe passed; its prefix, fcntl extension and ctypes module are
inside the private runtime. No host installation, maintainer script, or VM boot
was performed. The probe is not a test of every standard-library function or of
privileged filesystem operations.

The author's deviations remain material history: `apk fetch --url` also wrote
archives in the initial working directory, and the 64 MiB download ceiling was
checked after that download rather than enforced incrementally. The actual total
was 18,259,765 bytes. The initial old-mtime refusal and corrected ctime/name guard
remain recorded; this review does not retroactively claim continuous enforcement.

Reproducible independent checks and raw outputs are in
[the review evidence](../../evidence/buster-legacy-python-independent-20260921/result.json),
with [signed metadata dependency closure](../../evidence/buster-legacy-python-independent-20260921/closure.json).
