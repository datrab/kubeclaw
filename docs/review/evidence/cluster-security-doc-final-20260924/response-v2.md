# DOC-RS-DEADLINE response

The RuntimeSecurity table now states that the common kubectl/poll timer starts only after synchronous manifest realpath/stat, reading and hashing. The limits paragraph explicitly retains the unbounded allocation and outer-attempt budget gap. No production behavior or acceptance status changed. The other four candidate documents are byte-identical to V1; V1 files and manifest remain immutable. V2 requires fresh independent source review. No live writes or runtime execution occurred.
