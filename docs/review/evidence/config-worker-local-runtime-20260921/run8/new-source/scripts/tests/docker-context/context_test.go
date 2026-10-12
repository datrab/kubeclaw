package context_test

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/moby/patternmatcher"
	"github.com/moby/patternmatcher/ignorefile"
)

var root = filepath.Join("..", "..", "..")
var requiredRules = []string{
	"!versions.json",
	"!docker/browser-archives.lock.json",
	"!docker/trivy-databases.lock.json",
	"!scripts/browser-archive-lock.mjs",
	"!scripts/trivy-database-lock.mjs",
}

func ignoreText(t *testing.T) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(root, ".dockerignore"))
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func matcher(t *testing.T, text string) *patternmatcher.PatternMatcher {
	t.Helper()
	patterns, err := ignorefile.ReadAll(strings.NewReader(text))
	if err != nil {
		t.Fatal(err)
	}
	result, err := patternmatcher.New(patterns)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func excluded(t *testing.T, matcher *patternmatcher.PatternMatcher, path string) bool {
	t.Helper()
	result, err := matcher.MatchesOrParentMatches(path)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

// These Dockerfiles currently use unquoted, single-line shell COPY syntax.
// Fail closed if syntax changes; do not silently omit newly unhandled sources.
func localSources(t *testing.T) map[string]bool {
	t.Helper()
	sources := map[string]bool{}
	dockerfiles, err := filepath.Glob(filepath.Join(root, "docker", "Dockerfile.*"))
	if err != nil || len(dockerfiles) == 0 {
		t.Fatalf("discover Dockerfiles: %v (%d files)", err, len(dockerfiles))
	}
	for _, filename := range dockerfiles {
		name := filepath.Base(filename)
		data, err := os.ReadFile(filename)
		if err != nil {
			t.Fatal(err)
		}
		scanner := bufio.NewScanner(strings.NewReader(string(data)))
		for scanner.Scan() {
			fields := strings.Fields(scanner.Text())
			if len(fields) == 0 || !strings.EqualFold(fields[0], "COPY") {
				continue
			}
			args := fields[1:]
			fromStage := false
			for len(args) > 0 && strings.HasPrefix(args[0], "--") {
				if strings.HasPrefix(args[0], "--from=") {
					fromStage = true
				} else if !strings.HasPrefix(args[0], "--chown=") && !strings.HasPrefix(args[0], "--chmod=") {
					t.Fatalf("%s: unsupported COPY option %s", name, args[0])
				}
				args = args[1:]
			}
			if fromStage {
				continue
			}
			if len(args) < 2 {
				t.Fatalf("%s: incomplete COPY: %s", name, scanner.Text())
			}
			for _, source := range args[:len(args)-1] {
				if strings.ContainsAny(source, "\\\"'[]*?$#") {
					t.Fatalf("%s: unsupported COPY source syntax %s", name, source)
				}
				source = filepath.Clean(source)
				if source == "." {
					continue
				} // Whole-context COPY has no specific required input.
				if filepath.IsAbs(source) || source == ".." || strings.HasPrefix(source, "../") {
					t.Fatalf("invalid local source %s", source)
				}
				sources[source] = true
			}
		}
		if err := scanner.Err(); err != nil {
			t.Fatal(err)
		}
	}
	if len(sources) == 0 {
		t.Fatal("no COPY sources discovered")
	}
	return sources
}

func TestExplicitDockerCopySources(t *testing.T) {
	matches := matcher(t, ignoreText(t))
	for source := range localSources(t) {
		t.Run(source, func(t *testing.T) {
			if _, err := os.Stat(filepath.Join(root, source)); err != nil {
				t.Fatal(err)
			}
			if excluded(t, matches, source) {
				t.Fatalf("required COPY source %s is excluded from Docker context", source)
			}
		})
	}
}

func TestProtectedPathsStayExcluded(t *testing.T) {
	matches := matcher(t, ignoreText(t))
	for _, path := range []string{
		"my-values/config.yaml", ".swarm/state.json", "worktrees/project/file", ".git/config", ".github/workflows/test.yml",
		".cache/download.zip", "tmp/archive.zip", "node_modules/pkg/index.js", "skills/prism/node_modules/pkg/index.js",
		"skills/prism/server/.env", "skills/prism/server/.env.production", "skills/prism/server/token.key", "skills/prism/server/cert.pem", "skills/prism/server/session.log",
		"skills/prism/server/secret.sops.yaml.dec", ".env.production", "secrets.yml.dec", "keys.txt",
		"scripts/unapproved.mjs", "docker/unapproved.json", "operator-state.json",
	} {
		t.Run(path, func(t *testing.T) {
			if !excluded(t, matches, path) {
				t.Fatalf("protected path %s enters Docker context", path)
			}
		})
	}
}

func TestEachLockInputNeedsItsExplicitAllowRule(t *testing.T) {
	original := ignoreText(t)
	sources := localSources(t)
	for _, rule := range requiredRules {
		t.Run(rule[1:], func(t *testing.T) {
			if !sources[rule[1:]] {
				t.Fatalf("%s is no longer an explicit COPY source; review regression scope", rule)
			}
			if strings.Count(original, rule+"\n") != 1 {
				t.Fatalf("expected exactly one standalone rule %s", rule)
			}
			mutant := strings.Replace(original, rule+"\n", "", 1)
			if !excluded(t, matcher(t, mutant), rule[1:]) {
				t.Fatalf("removing %s did not make the required source unavailable", rule)
			}
		})
	}
}
