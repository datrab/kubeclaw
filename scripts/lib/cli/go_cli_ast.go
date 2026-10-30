// Static source protocol only. Supplied programs are parsed, never built/imported/run.
package main

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"strconv"
	"strings"
)

type Source struct {
	Path string `json:"path"`
	Text string `json:"text"`
}
type Request struct {
	Sources []Source `json:"sources"`
}
type Fact map[string]interface{}
type Result struct {
	Path           string `json:"path"`
	Commands       []Fact `json:"commands"`
	Options        []Fact `json:"options"`
	Positionals    []Fact `json:"positionals"`
	Defaults       []Fact `json:"defaults"`
	Exits          []Fact `json:"exits"`
	Branches       []Fact `json:"branches"`
	Delegations    []Fact `json:"delegations"`
	Guards         []Fact `json:"guards"`
	SourceBindings []Fact `json:"sourceBindings"`
	Unresolved     []Fact `json:"unresolved"`
}

func extract(s Source) Result {
	r := Result{Path: s.Path, Commands: []Fact{}, Options: []Fact{}, Positionals: []Fact{}, Defaults: []Fact{}, Exits: []Fact{}, Branches: []Fact{}, Delegations: []Fact{}, Guards: []Fact{}, SourceBindings: []Fact{}, Unresolved: []Fact{}}
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, s.Path, s.Text, parser.AllErrors)
	if err != nil {
		r.Unresolved = append(r.Unresolved, Fact{"rule": "syntax-error", "message": err.Error()})
		return r
	}
	aliases := map[string]string{}
	for _, v := range file.Imports {
		path, e := strconv.Unquote(v.Path.Value)
		if e != nil {
			continue
		}
		name := path[strings.LastIndex(path, "/")+1:]
		if v.Name != nil {
			name = v.Name.Name
		}
		if name == "." {
			r.Unresolved = append(r.Unresolved, Fact{"rule": "dot-import-name-resolution", "import": path})
		} else {
			aliases[name] = path
		}
	}
	text := func(n ast.Node) string {
		if n == nil {
			return ""
		}
		a, b := fset.Position(n.Pos()).Offset, fset.Position(n.End()).Offset
		if a < 0 || b > len(s.Text) || a > b {
			return ""
		}
		return s.Text[a:b]
	}
	parents := map[ast.Node]ast.Node{}
	stack := []ast.Node{}
	ast.Inspect(file, func(n ast.Node) bool {
		if n == nil {
			stack = stack[:len(stack)-1]
			return true
		}
		if len(stack) > 0 {
			parents[n] = stack[len(stack)-1]
		}
		stack = append(stack, n)
		return true
	})
	site := func(n ast.Node) Fact {
		conditions := []Fact{}
		child := n
		for parent := parents[n]; parent != nil; parent = parents[parent] {
			switch parent.(type) {
			case *ast.FuncDecl, *ast.FuncLit:
				parent = nil
			}
			if parent == nil {
				break
			}
			if branch, ok := parent.(*ast.IfStmt); ok {
				role := "condition-or-init"
				if child == branch.Body {
					role = "then"
				} else if child == branch.Else {
					role = "else"
				}
				conditions = append(conditions, Fact{"conditionExpression": text(branch.Cond), "role": role, "line": fset.Position(branch.Pos()).Line})
			}
			if branch, ok := parent.(*ast.CaseClause); ok {
				conditions = append(conditions, Fact{"conditionExpression": text(branch), "role": "switch-case", "line": fset.Position(branch.Pos()).Line})
			}
			child = parent
		}
		return Fact{"startByte": fset.Position(n.Pos()).Offset, "endByte": fset.Position(n.End()).Offset, "line": fset.Position(n.Pos()).Line, "endLine": fset.Position(n.End()).Line, "expression": text(n), "conditions": conditions}
	}

	qualify := func(expr ast.Expr) (string, bool) {
		sel, ok := expr.(*ast.SelectorExpr)
		if !ok {
			return "", false
		}
		id, ok := sel.X.(*ast.Ident)
		if !ok || id.Obj != nil {
			return "", false
		}
		p, ok := aliases[id.Name]
		if !ok {
			return "", false
		}
		return p + "." + sel.Sel.Name, true
	}
	isArgv := func(n ast.Node) bool {
		sel, ok := n.(*ast.SelectorExpr)
		if !ok {
			return false
		}
		name, ok := qualify(sel)
		return ok && name == "os.Args"
	}
	hasArgv := func(n ast.Node) bool {
		found := false
		ast.Inspect(n, func(x ast.Node) bool {
			if x != nil && isArgv(x) {
				found = true
			}
			return true
		})
		return found
	}
	scopeOf := map[ast.Node]string{}
	for _, decl := range file.Decls {
		if fn, ok := decl.(*ast.FuncDecl); ok {
			ast.Inspect(fn, func(n ast.Node) bool {
				if n != nil {
					scopeOf[n] = fn.Name.Name
				}
				return true
			})
		}
	}
	add := func(target *[]Fact, n ast.Node, fields Fact) {
		f := site(n)
		f["scope"] = scopeOf[n]
		for k, v := range fields {
			f[k] = v
		}
		*target = append(*target, f)
	}
	var valueOf func(ast.Expr) ast.Expr
	valueOf = func(expr ast.Expr) ast.Expr {
		id, ok := expr.(*ast.Ident)
		if !ok || id.Obj == nil {
			return expr
		}
		switch decl := id.Obj.Decl.(type) {
		case *ast.AssignStmt:
			for i, lhs := range decl.Lhs {
				if name, ok := lhs.(*ast.Ident); ok && name.Obj == id.Obj && i < len(decl.Rhs) {
					return decl.Rhs[i]
				}
			}
		case *ast.ValueSpec:
			for i, name := range decl.Names {
				if name.Obj == id.Obj && i < len(decl.Values) {
					return decl.Values[i]
				}
			}
		}
		return expr
	}
	commandOrigin := func(expr ast.Expr) Fact {
		value := valueOf(expr)
		call, ok := value.(*ast.CallExpr)
		if !ok {
			return nil
		}
		name, qualified := qualify(call.Fun)
		if !qualified || (name != "os/exec.Command" && name != "os/exec.CommandContext") {
			return nil
		}
		return Fact{"constructor": site(call), "callee": name, "policy": "Cmd construction does not run a process; actual Run/Output/CombinedOutput or Start then Wait supply child completion, never automatic parent status."}
	}
	enclosingFunction := func(n ast.Node) ast.Node {
		for p := parents[n]; p != nil; p = parents[p] {
			switch p.(type) {
			case *ast.FuncDecl, *ast.FuncLit:
				return p
			}
		}
		return nil
	}
	functionDefers := func(n ast.Node) []Fact {
		out := []Fact{}
		fn := enclosingFunction(n)
		if fn == nil {
			return out
		}
		ast.Inspect(fn, func(child ast.Node) bool {
			if child != fn {
				switch child.(type) {
				case *ast.FuncDecl, *ast.FuncLit:
					return false
				}
			}
			if d, ok := child.(*ast.DeferStmt); ok {
				out = append(out, site(d))
			}
			return true
		})
		return out
	}
	ast.Inspect(file, func(n ast.Node) bool {
		if n == nil {
			return true
		}
		switch x := n.(type) {
		case *ast.ReturnStmt:
			values := []string{}
			for _, value := range x.Results {
				values = append(values, text(value))
			}
			add(&r.Exits, x, Fact{"kind": "go-return-completion", "valueExpressions": values, "deferSources": functionDefers(x), "policy": "Returns to actual caller; main normal return ends main after its defers. Values do not become process statuses automatically."})
		case *ast.DeferStmt:
			add(&r.Exits, x, Fact{"kind": "go-deferred-completion-action", "calleeExpression": text(x.Call.Fun), "policy": "Runs on enclosing function return or panic unwinding, in reverse registration order; os.Exit bypasses defers. Recover effects require actual deferred call context."})
		case *ast.IndexExpr:
			if isArgv(x.X) {
				add(&r.Positionals, x, Fact{"selector": text(x.Index), "kind": "argv-index-access-not-yet-public-operand"})
			}
		case *ast.SliceExpr:
			if isArgv(x.X) {
				add(&r.Positionals, x, Fact{"kind": "argv-slice-access", "low": text(x.Low), "high": text(x.High)})
			}
		case *ast.IfStmt:
			if hasArgv(x.Cond) {
				add(&r.Branches, x.Cond, Fact{"kind": "argv-condition"})
				ast.Inspect(x.Cond, func(c ast.Node) bool {
					v, ok := c.(*ast.BasicLit)
					if ok && v.Kind == token.STRING {
						name, e := strconv.Unquote(v.Value)
						if e == nil {
							target := &r.Commands
							if strings.HasPrefix(name, "-") {
								target = &r.Options
							}
							add(target, v, Fact{"name": name, "kind": "argv-condition-literal-not-independent-route"})
						}
					}
					return true
				})
			}
		case *ast.SwitchStmt:
			if x.Tag != nil && hasArgv(x.Tag) {
				add(&r.Branches, x.Tag, Fact{"kind": "argv-switch"})
				for _, c := range x.Body.List {
					cc := c.(*ast.CaseClause)
					for _, e := range cc.List {
						add(&r.Commands, e, Fact{"kind": "argv-switch-case", "valueExpression": text(e)})
					}
				}
			}
		case *ast.CallExpr:
			if id, ok := x.Fun.(*ast.Ident); ok && id.Obj == nil && (id.Name == "panic" || id.Name == "recover") {
				add(&r.Exits, x, Fact{"kind": "go-builtin-" + id.Name + "-completion", "argumentExpressions": text(x), "deferSources": functionDefers(x), "policy": "Panic unwinds actual defers and may be recovered only in the language-defined directly deferred context; recover elsewhere does not handle panic. No guessed numeric status."})
			}
			if origin := commandOrigin(x); origin != nil {
				add(&r.Delegations, x, Fact{"kind": "go-exec-command-construction", "binding": origin})
			}
			if sel, ok := x.Fun.(*ast.SelectorExpr); ok {
				if origin := commandOrigin(sel.X); origin != nil {
					method := sel.Sel.Name
					if method == "Run" || method == "Output" || method == "CombinedOutput" || method == "Start" || method == "Wait" {
						add(&r.Exits, x, Fact{"kind": "go-exec-child-result-completion", "method": method, "commandSource": origin, "policy": "Source-bound child completion/error; Start alone is not child completion, Wait completes started command. Checked error branches and any os.Exit remain separate."})
					}
				}
			}
			name, qualified := qualify(x.Fun)
			if qualified {
				for p := parents[x]; p != nil; p = parents[p] {
					switch p.(type) {
					case *ast.FuncDecl, *ast.FuncLit:
						p = nil
					}
					if p == nil {
						break
					}
					if branch, ok := p.(*ast.IfStmt); ok && branch.Init != nil {
						add(&r.Delegations, x, Fact{"kind": "go-guarded-imported-result-handler", "callee": name, "guardSource": site(branch.Cond), "initializerSource": site(branch.Init), "policy": "External error/status handling is bound to this actual imported receiver and guarded call; no inherited option ownership or guessed status."})
						break
					}
				}
			}
			if qualified && name == "os.Exit" {
				v := ""
				if len(x.Args) > 0 {
					v = text(x.Args[0])
				}
				add(&r.Exits, x, Fact{"kind": "explicit-os-exit", "valueExpression": v})
			}
			if qualified && strings.HasPrefix(name, "flag.") {
				add(&r.Delegations, x, Fact{"kind": "standard-flag-call", "callee": name})
				method := strings.TrimPrefix(name, "flag.")
				base := strings.TrimSuffix(method, "Var")
				supported := map[string]bool{"Bool": true, "String": true, "Int": true, "Int64": true, "Uint": true, "Uint64": true, "Float64": true, "Duration": true}
				if supported[base] {
					nameIndex, defaultIndex := 0, 1
					if strings.HasSuffix(method, "Var") {
						nameIndex, defaultIndex = 1, 2
					}
					if len(x.Args) > defaultIndex {
						if lit, ok := x.Args[nameIndex].(*ast.BasicLit); ok && lit.Kind == token.STRING {
							value, e := strconv.Unquote(lit.Value)
							if e == nil {
								add(&r.Options, lit, Fact{"name": value, "kind": "go-flag-declaration", "callee": name})
							}
						} else {
							add(&r.Unresolved, x.Args[nameIndex], Fact{"rule": "computed-go-flag-name"})
						}
						add(&r.Defaults, x.Args[defaultIndex], Fact{"role": "go-flag-source-default", "callee": name})
					} else {
						add(&r.Unresolved, x, Fact{"rule": "go-flag-signature-arity"})
					}
				} else if method != "Parse" && method != "Args" && method != "NArg" && method != "Arg" {
					add(&r.Unresolved, x, Fact{"rule": "unsupported-go-flag-method", "callee": name})
				}
			}
			if hasArgv(x) {
				add(&r.Delegations, x, Fact{"kind": "argv-call-flow", "calleeExpression": text(x.Fun)})
			}
		case *ast.AssignStmt:
			for _, v := range x.Rhs {
				if hasArgv(v) {
					add(&r.Defaults, v, Fact{"role": "source-value-flow-not-effective-default", "assignment": text(x)})
				}
			}
		case *ast.FuncDecl:
			if x.Name.Name == "main" {
				add(&r.Exits, x.Name, Fact{"kind": "go-main-normal-completion-policy", "functionBody": site(x.Body), "policy": "Normal return/fallthrough of actual main ends the program after main defers; panic/recover/os.Exit and child handling remain separate source-bound paths. No invented numeric exit declaration."})
				add(&r.Guards, x.Name, Fact{"kind": "go-main-entry-declaration", "qualification": "Declaration,not-public-launch-proof"})
			}
		}
		return true
	})
	digest := fmt.Sprintf("%x", sha256.Sum256([]byte(s.Text)))
	r.SourceBindings = append(r.SourceBindings, Fact{"kind": "static-whole-source", "sha256": digest, "utf8Bytes": len(s.Text), "parser": "go/parser", "execution": false})
	r.Unresolved = append(r.Unresolved, Fact{"rule": "branch-caller-composition-required", "detail": "Facts preserve expressions; reachability, runtime errors, implicit main return, delegated defaults and public support must be independently composed. Dot imports/dynamic parser wrappers are unresolved rather than guessed complete."})
	return r
}
func main() {
	var q Request
	if err := json.NewDecoder(os.Stdin).Decode(&q); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	out := struct {
		Sources []Result `json:"sources"`
	}{Sources: []Result{}}
	for _, s := range q.Sources {
		out.Sources = append(out.Sources, extract(s))
	}
	if err := json.NewEncoder(os.Stdout).Encode(out); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
}
