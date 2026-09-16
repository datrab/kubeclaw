// kubeclaw-native is a containerd NRI plugin. It adjusts only the cgroup
// namespace of explicitly selected trusted supervisor containers.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"regexp"
	"strings"
	"syscall"

	"github.com/containerd/nri/pkg/api"
	"github.com/containerd/nri/pkg/stub"
)

const roleAnnotation = "kubeclaw.dev/native-worker-role"
const policyAnnotation = "kubeclaw.dev/native-worker-policy"

type selection struct {
	Namespace    string `json:"namespace"`
	Container    string `json:"container"`
	PolicyDigest string `json:"policyDigest"`
}

type configuration struct {
	SchemaVersion     int                  `json:"schemaVersion"`
	ContainerdVersion string               `json:"containerdVersion"`
	Roles             map[string]selection `json:"roles"`
}

type plugin struct{ config configuration }

func readConfiguration(file string) (configuration, error) {
	var config configuration
	fd, err := syscall.Open(file, syscall.O_RDONLY|syscall.O_NOFOLLOW|syscall.O_NONBLOCK|syscall.O_CLOEXEC, 0)
	if err != nil {
		return config, err
	}
	f := os.NewFile(uintptr(fd), file)
	defer f.Close()
	stat, err := f.Stat()
	if err != nil {
		return config, err
	}
	native, ok := stat.Sys().(*syscall.Stat_t)
	if !ok || !stat.Mode().IsRegular() || native.Uid != 0 || stat.Mode().Perm()&0022 != 0 || stat.Size() > 65536 {
		return config, errors.New("NATIVE_NRI_POLICY_NOT_TRUSTED")
	}
	decoder := json.NewDecoder(io.LimitReader(f, 65537))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&config); err != nil {
		return config, err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return config, errors.New("NATIVE_NRI_POLICY_TRAILING_DATA")
	}
	return config, validateConfiguration(config)
}

func validateConfiguration(config configuration) error {
	version := regexp.MustCompile(`^v?2\.(?:[2-9]|[1-9][0-9]+)\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$`)
	if config.SchemaVersion != 1 || !version.MatchString(config.ContainerdVersion) || len(config.Roles) != 2 {
		return errors.New("NATIVE_NRI_CONFIGURATION_INVALID")
	}
	name := regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`)
	digest := regexp.MustCompile(`^[a-f0-9]{64}$`)
	for _, role := range []string{"buster", "prism"} {
		selected, ok := config.Roles[role]
		if !ok || !name.MatchString(selected.Namespace) || !name.MatchString(selected.Container) || !digest.MatchString(selected.PolicyDigest) {
			return errors.New("NATIVE_NRI_SELECTION_INVALID")
		}
	}
	if config.Roles["buster"].Namespace == config.Roles["prism"].Namespace && config.Roles["buster"].Container == config.Roles["prism"].Container {
		return errors.New("NATIVE_NRI_SELECTION_AMBIGUOUS")
	}
	return nil
}

func (p *plugin) Configure(_ context.Context, extra, runtime, version string) (api.EventMask, error) {
	if strings.TrimSpace(extra) != "" || runtime != "containerd" || version != p.config.ContainerdVersion {
		return 0, errors.New("NATIVE_NRI_SELECTED_RUNTIME_REQUIRED")
	}
	return 0, nil // Subscribe to the implemented CreateContainer event through the original SDK.
}

func (p *plugin) CreateContainer(_ context.Context, pod *api.PodSandbox, container *api.Container) (*api.ContainerAdjustment, []*api.ContainerUpdate, error) {
	role := pod.GetAnnotations()[roleAnnotation]
	if role == "" {
		return nil, nil, nil
	}
	selected, ok := p.config.Roles[role]
	if !ok || pod.GetNamespace() != selected.Namespace || pod.GetAnnotations()[policyAnnotation] != selected.PolicyDigest {
		return nil, nil, errors.New("NATIVE_NRI_SUPERVISOR_SELECTION_REJECTED")
	}
	if container.GetName() != selected.Container {
		return nil, nil, nil
	}
	if pod.GetId() == "" || pod.GetUid() == "" || container.GetPodSandboxId() != pod.GetId() {
		return nil, nil, errors.New("NATIVE_NRI_SANDBOX_BINDING_REQUIRED")
	}
	adjustment := &api.ContainerAdjustment{}
	adjustment.RemoveNamespace(&api.LinuxNamespace{Type: "cgroup"})
	return adjustment, nil, nil
}

func newPluginStub(config configuration) (stub.Stub, error) {
	// The launcher supplies identity through the environment. The SDK rejects
	// setting it again through options, even when the values are identical.
	var options []stub.Option
	for _, identity := range []struct {
		environment string
		expected string
		fallback stub.Option
	}{
		{api.PluginNameEnvVar, "kubeclaw-native", stub.WithPluginName("kubeclaw-native")},
		{api.PluginIdxEnvVar, "10", stub.WithPluginIdx("10")},
	} {
		value := os.Getenv(identity.environment)
		if value == "" {
			options = append(options, identity.fallback)
		} else if value != identity.expected {
			return nil, errors.New("NATIVE_NRI_PLUGIN_IDENTITY_INVALID")
		}
	}
	return stub.New(&plugin{config: config}, options...)
}

func run() error {
	if os.Getuid() != 0 {
		return errors.New("NATIVE_NRI_HOST_ROOT_REQUIRED")
	}
	config, err := readConfiguration("/etc/kubeclaw/native-nri.json")
	if err != nil {
		return err
	}
	client, err := newPluginStub(config)
	if err != nil {
		return err
	}
	return client.Run(context.Background())
}

func main() {
	if len(os.Args) == 3 && os.Args[1] == "--check-policy" {
		if _, err := readConfiguration(os.Args[2]); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		fmt.Println("NATIVE_NRI_POLICY_VALID")
		return
	}
	if len(os.Args) != 1 {
		fmt.Fprintln(os.Stderr, "Usage: kubeclaw-native [--check-policy POLICY_JSON]")
		os.Exit(1)
	}
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
