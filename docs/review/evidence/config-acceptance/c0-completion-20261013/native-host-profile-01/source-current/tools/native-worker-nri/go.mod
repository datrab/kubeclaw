module github.com/datrab/kubeclaw/tools/native-worker-nri

go 1.26.5

require (
	github.com/containerd/nri v0.10.0
	github.com/opencontainers/runtime-spec v1.1.0
	github.com/opencontainers/runtime-tools v0.9.0
	google.golang.org/protobuf v1.34.1
)

require (
	github.com/containerd/log v0.1.0 // indirect
	github.com/containerd/ttrpc v1.2.7 // indirect
	github.com/golang/protobuf v1.5.3 // indirect
	github.com/knqyf263/go-plugin v0.9.0 // indirect
	github.com/moby/sys/mountinfo v0.6.2 // indirect
	github.com/opencontainers/selinux v1.15.1 // indirect
	github.com/sirupsen/logrus v1.9.3 // indirect
	github.com/syndtr/gocapability v0.0.0-20200815063812-42c35b437635 // indirect
	github.com/tetratelabs/wazero v1.9.0 // indirect
	golang.org/x/sys v0.31.0 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20230731190214-cbb8c96f2d6d // indirect
	google.golang.org/grpc v1.57.1 // indirect
)

replace github.com/opencontainers/runtime-tools v0.9.0 => github.com/opencontainers/runtime-tools v0.0.0-20221026201742-946c877fa809
