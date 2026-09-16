package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/containerd/nri/pkg/api"
	nrigenerate "github.com/containerd/nri/pkg/runtime-tools/generate"
	"github.com/opencontainers/runtime-spec/specs-go"
	"github.com/opencontainers/runtime-tools/generate"
	"google.golang.org/protobuf/proto"
)

func TestPluginStubLauncherIdentity(t *testing.T) {
	for _, tc := range []struct {
		name, index string
		valid bool
	}{
		{"kubeclaw-native", "10", true},
		{"", "", true},
		{"kubeclaw-native", "", true},
		{"", "10", true},
		{"other", "10", false},
		{"kubeclaw-native", "11", false},
	} {
		t.Run(tc.name+"/"+tc.index, func(t *testing.T) {
			t.Setenv(api.PluginNameEnvVar, tc.name)
			t.Setenv(api.PluginIdxEnvVar, tc.index)
			client, err := newPluginStub(testConfig())
			if tc.valid && (err != nil || client == nil) {
				t.Fatalf("SDK stub creation failed: %v", err)
			}
			if !tc.valid && (err == nil || err.Error() != "NATIVE_NRI_PLUGIN_IDENTITY_INVALID") {
				t.Fatalf("unexpected identity was not rejected: %v", err)
			}
		})
	}
}

func TestConfigureOptionalVersionPrefix(t *testing.T) {
	for _, selected := range []string{"2.3.4-k3s1.36", "v2.3.4-k3s1.36"} {
		config := testConfig()
		config.ContainerdVersion = selected
		p := &plugin{config: config}
		for _, reported := range []string{"2.3.4-k3s1.36", "v2.3.4-k3s1.36"} {
			if _, err := p.Configure(context.Background(), "", "containerd", reported); err != nil {
				t.Fatalf("selected %q, reported %q: %v", selected, reported, err)
			}
		}
		for _, reported := range []string{"v2.3.5-k3s1.36", "v2.3.4-k3s1.35", "v2.3.4", "vv2.3.4-k3s1.36", " v2.3.4-k3s1.36", ""} {
			if _, err := p.Configure(context.Background(), "", "containerd", reported); err == nil {
				t.Fatalf("accepted different runtime version %q for %q", reported, selected)
			}
		}
	}
}

func testConfig() configuration {
	return configuration{SchemaVersion: 1, ContainerdVersion: "v2.2.0-k3s1", Roles: map[string]selection{
		"buster": {Namespace: "kubeclaw", Container: "buster-v2-runtime", PolicyDigest: strings.Repeat("a", 64)},
		"prism":  {Namespace: "kubeclaw", Container: "worker", PolicyDigest: strings.Repeat("a", 64)},
	}}
}

// These are NRI protocol inputs. No fake container runtime or kernel is used.
func protocolInput() (*api.PodSandbox, *api.Container) {
	pod := &api.PodSandbox{Id: "sandbox-id", Uid: "pod-uid", Namespace: "kubeclaw", Annotations: map[string]string{
		roleAnnotation: "prism", policyAnnotation: strings.Repeat("a", 64),
	}}
	return pod, &api.Container{Id: "container-id", PodSandboxId: pod.Id, Name: "worker"}
}

func TestOriginalNRIWireAndOCIGeneratorChangeOnlyCgroupNamespace(t *testing.T) {
	p := &plugin{config: testConfig()}
	pod, container := protocolInput()
	adjustment, updates, err := p.CreateContainer(context.Background(), pod, container)
	if err != nil || len(updates) != 0 || adjustment == nil {
		t.Fatalf("adjust: %v, %v", updates, err)
	}
	encoded, err := proto.Marshal(adjustment)
	if err != nil {
		t.Fatal(err)
	}
	decoded := &api.ContainerAdjustment{}
	if err := proto.Unmarshal(encoded, decoded); err != nil {
		t.Fatal(err)
	}
	g, err := generate.New("linux")
	if err != nil {
		t.Fatal(err)
	}
	if err := g.AddOrReplaceLinuxNamespace("cgroup", ""); err != nil {
		t.Fatal(err)
	}
	g.Config.Linux.CgroupsPath = "kubepods.slice:cri-containerd:test"
	before, err := json.Marshal(g.Config)
	if err != nil {
		t.Fatal(err)
	}
	expected := &specs.Spec{}
	if err := json.Unmarshal(before, expected); err != nil {
		t.Fatal(err)
	}
	kept := expected.Linux.Namespaces[:0]
	for _, ns := range expected.Linux.Namespaces {
		if ns.Type != specs.CgroupNamespace {
			kept = append(kept, ns)
		}
	}
	expected.Linux.Namespaces = kept
	if err := nrigenerate.SpecGenerator(&g).Adjust(decoded); err != nil {
		t.Fatal(err)
	}
	actualJSON, err := json.Marshal(g.Config)
	if err != nil {
		t.Fatal(err)
	}
	expectedJSON, err := json.Marshal(expected)
	if err != nil {
		t.Fatal(err)
	}
	// Compare the actual OCI serialization; the generator initializes empty maps.
	if string(actualJSON) != string(expectedJSON) {
		t.Fatalf("NRI changed more than the selected cgroup namespace:\nactual %s\nexpected %s", actualJSON, expectedJSON)
	}
}

func TestSelectionRejectsMismatchedAuthorityAndLeavesOtherContainersUntouched(t *testing.T) {
	p := &plugin{config: testConfig()}
	for _, change := range []func(*api.PodSandbox, *api.Container){
		func(p *api.PodSandbox, _ *api.Container) { p.Namespace = "untrusted-fixture" },
		func(p *api.PodSandbox, _ *api.Container) { p.Annotations[policyAnnotation] = "stale" },
		func(p *api.PodSandbox, _ *api.Container) { p.Annotations[roleAnnotation] = "other" },
		func(_ *api.PodSandbox, c *api.Container) { c.PodSandboxId = "other-sandbox" },
	} {
		pod, container := protocolInput()
		change(pod, container)
		adjustment, updates, err := p.CreateContainer(context.Background(), pod, container)
		if err == nil || adjustment != nil || updates != nil {
			t.Fatal("accepted mismatched authority")
		}
	}
	for _, change := range []func(*api.PodSandbox, *api.Container){
		func(p *api.PodSandbox, _ *api.Container) { p.Annotations = nil },
		func(_ *api.PodSandbox, c *api.Container) { c.Name = "worker-trust-proxy" },
	} {
		pod, container := protocolInput()
		change(pod, container)
		adjustment, updates, err := p.CreateContainer(context.Background(), pod, container)
		if err != nil || adjustment != nil || updates != nil {
			t.Fatal("changed an unrelated container")
		}
	}
}

func TestSelectedRuntimeAndRootOwnedPolicy(t *testing.T) {
	config := testConfig()
	file := filepath.Join(t.TempDir(), "native-nri.json")
	encoded, err := json.Marshal(config)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, encoded, 0600); err != nil {
		t.Fatal(err)
	}
	read, err := readConfiguration(file)
	if err != nil || !reflect.DeepEqual(read, config) {
		t.Fatalf("read trusted file: %v", err)
	}
	p := &plugin{config: read}
	if _, err := p.Configure(context.Background(), "", "containerd", config.ContainerdVersion); err != nil {
		t.Fatal(err)
	}
	for _, input := range [][3]string{{"", "containerd", "v2.1.4"}, {"{}", "containerd", config.ContainerdVersion}, {"", "other", config.ContainerdVersion}} {
		if _, err := p.Configure(context.Background(), input[0], input[1], input[2]); err == nil {
			t.Fatal("accepted different runtime/configuration")
		}
	}
	if err := os.Chmod(file, 0666); err != nil {
		t.Fatal(err)
	}
	if _, err := readConfiguration(file); err == nil {
		t.Fatal("accepted writable authority")
	}
	if err := os.Chmod(file, 0600); err != nil {
		t.Fatal(err)
	}
	link := file + ".link"
	if err := os.Symlink(file, link); err != nil {
		t.Fatal(err)
	}
	if _, err := readConfiguration(link); err == nil {
		t.Fatal("accepted symlink")
	}
	if err := os.WriteFile(file, append(encoded, []byte(" {}")...), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := readConfiguration(file); err == nil {
		t.Fatal("accepted trailing configuration")
	}
}
