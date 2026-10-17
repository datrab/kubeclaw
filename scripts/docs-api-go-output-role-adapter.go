// Documentation-only AST qualification; no producer code is executed.
package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"go/ast"
	"go/format"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
)

type input struct {
	Path string `json:"path"`
}
type output struct {
	Path                          string               `json:"path"`
	Line                          int                  `json:"line"`
	Role                          string               `json:"role"`
	Expression                    string               `json:"expression"`
	Function                      string               `json:"function"`
	Value                         string               `json:"value,omitempty"`
	Operation                     string               `json:"operation,omitempty"`
	Dependencies                  []operationFact      `json:"dependencies"`
	DiagnosticQualified           *bool                `json:"diagnosticQualified,omitempty"`
	AuthorityQualified            bool                 `json:"authorityQualified"`
	AuthorityIssues               []string             `json:"authorityIssues,omitempty"`
	ExternalAuthorityDependencies []operationFact      `json:"externalAuthorityDependencies,omitempty"`
	ExternalAuthoritySources      []externalSourceFact `json:"externalAuthoritySources,omitempty"`
	TransportBodyQualified        *bool                `json:"transportBodyQualified,omitempty"`
}
type operationFact struct {
	Path   string `json:"path"`
	Symbol string `json:"symbol"`
	SHA256 string `json:"sha256"`
}
type externalSourceFact struct {
	Module             string `json:"module"`
	Version            string `json:"version"`
	ModuleRelativePath string `json:"moduleRelativePath"`
	SHA256             string `json:"sha256"`
	Semantics          string `json:"semantics"`
}

type declaration struct {
	path   string
	symbol string
	node   ast.Node
	fset   *token.FileSet
}

func main() {
	if len(os.Args) == 3 && os.Args[1] == "--documentation-custody" {
		documentationCustody(os.Args[2])
		return
	}
	var inputs []input
	if json.NewDecoder(os.Stdin).Decode(&inputs) != nil {
		os.Exit(2)
	}
	// A native role binds the selected operation and its package-local producer
	// and consumer declarations. An unchanged encoder cannot conceal a changed
	// helper returning a new document. Unrelated declarations are not a receipt.
	declarations := map[string]map[string][]declaration{}
	for _, in := range inputs {
		fset := token.NewFileSet()
		file, err := parser.ParseFile(fset, in.Path, nil, 0)
		if err != nil {
			os.Stderr.WriteString("API_PRODUCT_GO_AST_UNQUALIFIED: " + in.Path + ": " + err.Error() + "\n")
			os.Exit(3)
		}
		pkg := filepath.Dir(in.Path)
		if declarations[pkg] == nil {
			declarations[pkg] = map[string][]declaration{}
		}
		add := func(name string, node ast.Node) {
			declarations[pkg][name] = append(declarations[pkg][name], declaration{in.Path, name, node, fset})
		}
		for _, node := range file.Decls {
			switch value := node.(type) {
			case *ast.FuncDecl:
				add(value.Name.Name, value)
			case *ast.GenDecl:
				for _, spec := range value.Specs {
					switch item := spec.(type) {
					case *ast.ImportSpec:
						importPath, _ := strconv.Unquote(item.Path.Value)
						alias := filepath.Base(importPath)
						if item.Name != nil {
							alias = item.Name.Name
						}
						add(alias, item)
					case *ast.TypeSpec:
						add(item.Name.Name, value)
					case *ast.ValueSpec:
						for _, name := range item.Names {
							add(name.Name, value)
						}
					}
				}
			}
		}
	}
	localImports := map[string][]declaration{}
	for pkg, symbols := range declarations {
		for _, authority := range moduleAuthorityPaths(filepath.Join(pkg, "source.go")) {
			if filepath.Base(authority) != "go.mod" {
				continue
			}
			data, _ := os.ReadFile(authority)
			for _, line := range strings.Split(string(data), "\n") {
				if strings.HasPrefix(strings.TrimSpace(line), "module ") {
					module := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), "module "))
					absolute, _ := filepath.Abs(pkg)
					relative, _ := filepath.Rel(filepath.Dir(authority), absolute)
					imported := module
					if relative != "." {
						imported += "/" + filepath.ToSlash(relative)
					}
					for _, choices := range symbols {
						localImports[imported] = append(localImports[imported], choices...)
					}
				}
			}
		}
	}
	factCache := map[string][]operationFact{}
	factsFor := func(source, name string) []operationFact {
		key := source + ":" + name
		if facts, ok := factCache[key]; ok {
			return facts
		}
		pkg := declarations[filepath.Dir(source)]
		pending := []declaration{}
		for _, decl := range pkg[name] {
			if decl.path == source {
				pending = append(pending, decl)
			}
		}
		// The controller's transport/payload helpers are API capabilities. Bind
		// every incoming reference too: aliases, callbacks and returned method
		// values can submit a new body without a direct call to the helper.
		if name == "kube" || name == "requestPayload" {
			incoming := map[string]bool{name: true}
			changed := true
			for changed {
				changed = false
				for symbol, choices := range pkg {
					if incoming[symbol] {
						continue
					}
					referenced := false
					for _, decl := range choices {
						ast.Inspect(decl.node, func(node ast.Node) bool {
							switch fn := node.(type) {
							case *ast.Ident:
								referenced = referenced || incoming[fn.Name]
							case *ast.SelectorExpr:
								referenced = referenced || incoming[fn.Sel.Name]
							}
							return true
						})
					}
					if referenced {
						incoming[symbol] = true
						pending = append(pending, choices...)
						changed = true
					}
				}
			}
		}
		seen := map[string]bool{}
		facts := []operationFact{}
		authorityPaths := map[string]bool{}
		for len(pending) > 0 {
			decl := pending[len(pending)-1]
			pending = pending[:len(pending)-1]
			key := decl.path + ":" + decl.symbol
			if seen[key] {
				continue
			}
			seen[key] = true
			if spec, ok := decl.node.(*ast.ImportSpec); ok {
				imported, _ := strconv.Unquote(spec.Path.Value)
				pending = append(pending, localImports[imported]...)
			}
			for _, authority := range moduleAuthorityPaths(decl.path) {
				if authorityPaths[authority] {
					continue
				}
				authorityPaths[authority] = true
				data, err := os.ReadFile(authority)
				if err != nil {
					os.Exit(4)
				}
				sum := sha256.Sum256(data)
				facts = append(facts, operationFact{authority, "module-authority:" + filepath.Base(authority), hex.EncodeToString(sum[:])})
			}
			var buf bytes.Buffer
			format.Node(&buf, decl.fset, decl.node)
			sum := sha256.Sum256(buf.Bytes())
			facts = append(facts, operationFact{decl.path, decl.symbol, hex.EncodeToString(sum[:])})
			ast.Inspect(decl.node, func(node ast.Node) bool {
				if id, ok := node.(*ast.Ident); ok {
					pending = append(pending, declarations[filepath.Dir(decl.path)][id.Name]...)
				}
				return true
			})
		}
		sort.Slice(facts, func(i, j int) bool {
			if facts[i].Path != facts[j].Path {
				return facts[i].Path < facts[j].Path
			}
			return facts[i].Symbol < facts[j].Symbol
		})
		factCache[source+":"+name] = facts
		return facts
	}
	out := []output{}
	transportQualification := map[string]bool{}
	for pkg, decls := range declarations {
		transportQualification[pkg] = qualifyTransportBodies(decls)
	}
	for _, in := range inputs {
		fset := token.NewFileSet()
		file, err := parser.ParseFile(fset, in.Path, nil, 0)
		if err != nil {
			os.Stderr.WriteString("API_PRODUCT_GO_AST_UNQUALIFIED: " + in.Path + ": " + err.Error() + "\n")
			os.Exit(3)
		}
		// Unsupported imported/module authority is observable even when the
		// replacement package no longer spells a recognized serializer/sink.
		if qualified, issues := importAuthority(in.Path, file); !qualified {
			var syntax bytes.Buffer
			format.Node(&syntax, fset, file)
			facts := []operationFact{}
			for _, authority := range moduleAuthorityPaths(in.Path) {
				data, err := os.ReadFile(authority)
				if err != nil {
					os.Stderr.WriteString("API_PRODUCT_GO_AUTHORITY_UNQUALIFIED: " + authority + ": " + err.Error() + "\n")
					os.Exit(4)
				}
				sum := sha256.Sum256(data)
				facts = append(facts, operationFact{authority, "module-authority:" + filepath.Base(authority), hex.EncodeToString(sum[:])})
			}
			for _, spec := range file.Imports {
				var imported bytes.Buffer
				format.Node(&imported, fset, spec)
				sum := sha256.Sum256(imported.Bytes())
				facts = append(facts, operationFact{in.Path, "import-authority:" + spec.Path.Value, hex.EncodeToString(sum[:])})
			}
			externalDependencies, externalSources, _ := canonicalizerAuthority(in.Path, file)
			out = append(out, output{ExternalAuthorityDependencies: externalDependencies, ExternalAuthoritySources: externalSources, Path: in.Path, Line: 1, Role: "unknown", Expression: "<unsupported-import-module-authority>", Function: "<module>", Operation: syntax.String(), Dependencies: facts, AuthorityQualified: false, AuthorityIssues: issues})
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
		syntax := func(n ast.Node) string { var buf bytes.Buffer; format.Node(&buf, fset, n); return buf.String() }
		result := func(n ast.Node, role, value string) output {
			function := "<module>"
			operation := ""
			for p := n; p != nil; p = parents[p] {
				if fn, ok := p.(*ast.FuncDecl); ok {
					function = fn.Name.Name
					operation = syntax(fn)
					break
				}
			}
			qualified, issues := importAuthority(in.Path, file)
			for _, spec := range file.Imports {
				imported, _ := strconv.Unquote(spec.Path.Value)
				if imported == "kubeclaw.dev/pipeline-observability/go" && len(localImports[imported]) == 0 {
					qualified = false
					issues = append(issues, in.Path+": selected checked-in imported authority "+imported+" was not supplied to the finite adapter")
				}
			}
			record := output{AuthorityQualified: qualified, AuthorityIssues: issues, Path: in.Path, Line: fset.Position(n.Pos()).Line, Role: role, Expression: syntax(n), Function: function, Value: value, Operation: operation, Dependencies: factsFor(in.Path, function)}
			record.ExternalAuthorityDependencies, record.ExternalAuthoritySources, _ = canonicalizerAuthority(in.Path, file)
			checkedSources := map[string]bool{in.Path: true}
			for _, fact := range record.Dependencies {
				if !strings.HasSuffix(fact.Path, ".go") || checkedSources[fact.Path] {
					continue
				}
				checkedSources[fact.Path] = true
				dependencyFile, err := parser.ParseFile(token.NewFileSet(), fact.Path, nil, 0)
				if err != nil {
					record.AuthorityQualified = false
					record.AuthorityIssues = append(record.AuthorityIssues, fact.Path+": imported declaration authority cannot be parsed")
					continue
				}
				externalDependencies, externalSources, _ := canonicalizerAuthority(fact.Path, dependencyFile)
				record.ExternalAuthorityDependencies = append(record.ExternalAuthorityDependencies, externalDependencies...)
				record.ExternalAuthoritySources = append(record.ExternalAuthoritySources, externalSources...)
				dependencyQualified, dependencyIssues := importAuthority(fact.Path, dependencyFile)
				record.AuthorityQualified = record.AuthorityQualified && dependencyQualified
				record.AuthorityIssues = append(record.AuthorityIssues, dependencyIssues...)
			}
			if call, ok := n.(*ast.CallExpr); ok && syntax(call.Fun) == "fmt.Fprintln" && len(call.Args) == 2 && syntax(call.Args[0]) == "os.Stderr" && (syntax(call.Args[1]) == "err" || syntax(call.Args[1]) == "err.Error()") {
				diagnostic := guardedErrorFlow(call, parents, syntax)
				record.DiagnosticQualified = &diagnostic
				if diagnostic {
					guard := parents[parents[parents[call]]].(*ast.IfStmt)
					origin := guard.Init.(*ast.AssignStmt).Rhs[0].(*ast.CallExpr)
					if syntax(origin.Fun) == "cmd.Execute" || syntax(origin.Fun) == "run" {
						record.AuthorityQualified = false
						record.AuthorityIssues = append(record.AuthorityIssues, in.Path+": unsupported external error-result authority for "+syntax(origin.Fun)+externalErrorBoundary(syntax(origin.Fun)))
					}
				}
			}
			if function == "kube" || function == "requestPayload" {
				qualified := transportQualification[filepath.Dir(in.Path)]
				record.TransportBodyQualified = &qualified
				if issues := nativeSerializerMethodIssues(declarations[filepath.Dir(in.Path)]); len(issues) != 0 {
					record.AuthorityQualified = false
					record.AuthorityIssues = append(record.AuthorityIssues, issues...)
				}
			}
			return record
		}
		// Parser objects identify lexical declarations, unlike a file-global name map.
		bindings := map[*ast.Object]ast.Expr{}
		writes := map[*ast.Object]int{}
		escapes := map[*ast.Object]bool{}
		ast.Inspect(file, func(n ast.Node) bool {
			switch v := n.(type) {
			case *ast.ValueSpec:
				for i, name := range v.Names {
					if name.Obj != nil {
						writes[name.Obj]++
						if i < len(v.Values) {
							bindings[name.Obj] = v.Values[i]
						}
					}
				}
			case *ast.AssignStmt:
				for i, lhs := range v.Lhs {
					if name, ok := lhs.(*ast.Ident); ok && name.Obj != nil {
						if writes[name.Obj] == 0 && i < len(v.Rhs) {
							bindings[name.Obj] = v.Rhs[i]
						}
						writes[name.Obj]++
					}
				}
			case *ast.IncDecStmt:
				if name, ok := v.X.(*ast.Ident); ok && name.Obj != nil {
					writes[name.Obj]++
				}
			case *ast.UnaryExpr:
				if v.Op == token.AND {
					if name, ok := v.X.(*ast.Ident); ok && name.Obj != nil {
						escapes[name.Obj] = true
					}
				}
			}
			return true
		})
		var resolve, candidate func(ast.Expr, map[string]bool) ast.Expr
		candidate = func(e ast.Expr, seen map[string]bool) ast.Expr {
			if paren, ok := e.(*ast.ParenExpr); ok {
				return candidate(paren.X, seen)
			}
			if id, ok := e.(*ast.Ident); ok && id.Obj != nil {
				key := strconv.Itoa(int(id.Obj.Pos()))
				if !seen[key] && bindings[id.Obj] != nil {
					seen[key] = true
					return candidate(bindings[id.Obj], seen)
				}
			}
			return e
		}
		resolve = func(e ast.Expr, seen map[string]bool) ast.Expr {
			if paren, ok := e.(*ast.ParenExpr); ok {
				return resolve(paren.X, seen)
			}
			if id, ok := e.(*ast.Ident); ok && id.Obj != nil {
				key := strconv.Itoa(int(id.Obj.Pos()))
				_, parameter := id.Obj.Decl.(*ast.Field)
				if !parameter && plainDeclaredValue(id.Obj, declarations[filepath.Dir(in.Path)], false) && !seen[key] && bindings[id.Obj] != nil && writes[id.Obj] == 1 && !escapes[id.Obj] {
					seen[key] = true
					return resolve(bindings[id.Obj], seen)
				}
			}
			return e
		}
		originalResolve := resolve
		resolvingParameters := map[*ast.Object]bool{}
		resolve = func(e ast.Expr, seen map[string]bool) ast.Expr {
			value := originalResolve(e, seen)
			id, ok := value.(*ast.Ident)
			if !ok || id.Obj == nil || resolvingParameters[id.Obj] || writes[id.Obj] != 0 || escapes[id.Obj] {
				return value
			}
			field, ok := id.Obj.Decl.(*ast.Field)
			if !ok || !plainNativeType(field.Type, declarations[filepath.Dir(in.Path)], false, map[string]bool{}) {
				return value
			}
			// A variadic parameter is an aggregate, not one incoming literal.
			if _, variadic := field.Type.(*ast.Ellipsis); variadic {
				return value
			}
			var owner *ast.FuncDecl
			for p := ast.Node(field); p != nil; p = parents[p] {
				if fn, ok := p.(*ast.FuncDecl); ok {
					owner = fn
					break
				}
			}
			if owner == nil || owner.Recv != nil || ast.IsExported(owner.Name.Name) || len(declarations[filepath.Dir(in.Path)][owner.Name.Name]) != 1 {
				return value
			}
			index := 0
			found := false
			for _, parameter := range owner.Type.Params.List {
				for _, name := range parameter.Names {
					if name.Obj == id.Obj {
						found = true
						break
					}
					index++
				}
				if found {
					break
				}
			}
			if !found {
				return value
			}
			resolvingParameters[id.Obj] = true
			defer delete(resolvingParameters, id.Obj)
			var selected ast.Expr
			ambiguous := false
			// Qualify every supplied package-local incoming reference. A
			// helper is not private-literal authority when it is aliased,
			// returned, placed in a module/container or passed as a callback.
			inspected := map[ast.Node]bool{}
			for _, choices := range declarations[filepath.Dir(in.Path)] {
				for _, declaration := range choices {
					selectedNode := declaration.node
					// Current-file bindings/parents belong to the role parse,
					// not the separate first-pass declaration AST objects.
					if declaration.path == in.Path {
						selectedNode = file
					}
					if inspected[selectedNode] {
						continue
					}
					inspected[selectedNode] = true
					parentStack := []ast.Node{}
					ast.Inspect(selectedNode, func(n ast.Node) bool {
						if n == nil {
							parentStack = parentStack[:len(parentStack)-1]
							return false
						}
						var parent ast.Node
						if len(parentStack) > 0 {
							parent = parentStack[len(parentStack)-1]
						}
						parentStack = append(parentStack, n)
						reference, ok := n.(*ast.Ident)
						if !ok || reference == owner.Name || reference.Name != owner.Name.Name {
							return true
						}
						if reference.Obj != nil && reference.Obj != owner.Name.Obj {
							return true
						}
						call, direct := parent.(*ast.CallExpr)
						if !direct || call.Fun != reference || call.Ellipsis.IsValid() || index >= len(call.Args) {
							ambiguous = true
							return true
						}
						argument := resolve(call.Args[index], map[string]bool{})
						if _, literal := argument.(*ast.BasicLit); !literal {
							ambiguous = true
						}
						if selected != nil && syntax(selected) != syntax(argument) {
							ambiguous = true
						}
						selected = argument
						return true
					})
				}
			}
			if selected != nil && !ambiguous {
				return selected
			}
			return value
		}
		fmtName, osName, jsonName, ioName, httpName, logName := "fmt", "os", "json", "io", "http", "log"
		for _, imp := range file.Imports {
			p, _ := strconv.Unquote(imp.Path.Value)
			if imp.Name != nil {
				if p == "encoding/json" {
					jsonName = imp.Name.Name
				}
				if p == "io" {
					ioName = imp.Name.Name
				}
				if p == "net/http" {
					httpName = imp.Name.Name
				}
				if p == "log" {
					logName = imp.Name.Name
				}
				if p == "fmt" {
					fmtName = imp.Name.Name
				}
				if p == "os" {
					osName = imp.Name.Name
				}
			}
		}
		var httpClient func(ast.Expr) bool
		httpClient = func(e ast.Expr) bool {
			e = candidate(e, map[string]bool{})
			switch v := e.(type) {
			case *ast.UnaryExpr:
				return httpClient(v.X)
			case *ast.StarExpr:
				return httpClient(v.X)
			case *ast.CompositeLit:
				return httpClient(v.Type)
			case *ast.SelectorExpr:
				if owner, ok := v.X.(*ast.Ident); ok {
					return owner.Name == httpName && (v.Sel.Name == "Client" || v.Sel.Name == "DefaultClient")
				}
			case *ast.Ident:
				if httpName == "." && (v.Name == "Client" || v.Name == "DefaultClient") {
					return true
				}
				if v.Obj != nil {
					if spec, ok := v.Obj.Decl.(*ast.TypeSpec); ok {
						return httpClient(spec.Type)
					}
					if field, ok := v.Obj.Decl.(*ast.Field); ok {
						return httpClient(field.Type)
					}
				}
			case *ast.CallExpr:
				if fn, ok := v.Fun.(*ast.Ident); ok && fn.Name == "new" && len(v.Args) == 1 {
					return httpClient(v.Args[0])
				}
			}
			return false
		}
		// Selected stdlib output wrappers are capabilities, not formatting.
		// Logger methods are recognized conservatively even when their receiver
		// escapes the finite binding grammar. These families stay unsupported.
		logMethod := func(name string) bool {
			switch name {
			case "Print", "Printf", "Println", "Fatal", "Fatalf", "Fatalln", "Panic", "Panicf", "Panicln", "Output":
				return true
			}
			return false
		}
		wrapper := func(e ast.Expr) bool {
			e = candidate(e, map[string]bool{})
			if id, ok := e.(*ast.Ident); ok {
				return logName == "." && logMethod(id.Name) || httpName == "." && id.Name == "Error"
			}
			if sel, ok := e.(*ast.SelectorExpr); ok {
				if id, ok := sel.X.(*ast.Ident); ok {
					if id.Name == httpName && sel.Sel.Name == "Error" {
						return true
					}
					if id.Name == fmtName {
						return false
					}
				}
				return logMethod(sel.Sel.Name)
			}
			return false
		}
		writer := func(e ast.Expr) bool {
			if wrapper(e) {
				return true
			}
			fn := candidate(e, map[string]bool{})
			if id, ok := fn.(*ast.Ident); ok {
				if id.Obj == nil && (id.Name == "print" || id.Name == "println") {
					return true
				}
				if id.Name == "Marshal" || id.Name == "MarshalIndent" || id.Name == "NewEncoder" || id.Name == "Encode" || osName == "." && id.Name == "WriteFile" || ioName == "." && (id.Name == "Copy" || id.Name == "CopyN" || id.Name == "CopyBuffer") || httpName == "." && id.Name == "Post" {
					return true
				}
			}

			if id, ok := fn.(*ast.Ident); ok && jsonName == "." && (id.Name == "Marshal" || id.Name == "MarshalIndent" || id.Name == "NewEncoder") {
				return true
			}
			if id, ok := fn.(*ast.Ident); ok && fmtName == "." {
				return id.Name == "Print" || id.Name == "Println" || id.Name == "Printf" || id.Name == "Fprint" || id.Name == "Fprintln" || id.Name == "Fprintf"
			}
			if sel, ok := fn.(*ast.SelectorExpr); ok {
				if sel.Sel.Name == "Marshal" || sel.Sel.Name == "MarshalIndent" || sel.Sel.Name == "NewEncoder" || sel.Sel.Name == "Encode" {
					return true
				}
				if owner, ok := sel.X.(*ast.Ident); ok && ((owner.Name == ioName && (sel.Sel.Name == "Copy" || sel.Sel.Name == "CopyN" || sel.Sel.Name == "CopyBuffer")) || (owner.Name == httpName && sel.Sel.Name == "Post")) {
					return true
				}
				if sel.Sel.Name == "Do" {
					return true
				}

				if owner, ok := sel.X.(*ast.Ident); ok && owner.Name == jsonName && (sel.Sel.Name == "Marshal" || sel.Sel.Name == "MarshalIndent" || sel.Sel.Name == "NewEncoder") {
					return true
				}
				if sel.Sel.Name == "WriteTo" || sel.Sel.Name == "ReadFrom" {
					return true
				}
				if sel.Sel.Name == "Write" || sel.Sel.Name == "WriteString" || sel.Sel.Name == "WriteFile" {
					return true
				}
				if owner, ok := sel.X.(*ast.Ident); ok && owner.Name == fmtName {
					switch sel.Sel.Name {
					case "Print", "Println", "Printf", "Fprint", "Fprintln", "Fprintf":
						return true
					}
				}
			}
			return false
		}
		// Every standard capability reference must remain in the closed grammar.
		ast.Inspect(file, func(n ast.Node) bool {
			expr, ok := n.(ast.Expr)
			if !ok || !writer(expr) {
				return true
			}
			allowed := false
			switch parent := parents[n].(type) {
			case *ast.SelectorExpr:
				allowed = parent.Sel == expr
			case *ast.ParenExpr:
				allowed = true // outer expression is checked too
			case *ast.CallExpr:
				allowed = parent.Fun == expr
			case *ast.ValueSpec:
				for _, name := range parent.Names {
					if name == expr {
						allowed = true
					}
				}
				for i, value := range parent.Values {
					if value == expr && i < len(parent.Names) {
						obj := parent.Names[i].Obj
						allowed = obj != nil && writes[obj] == 1 && !escapes[obj]
					}
				}
			case *ast.AssignStmt:
				for _, lhs := range parent.Lhs {
					if lhs == expr {
						allowed = true
					}
				}
				for i, rhs := range parent.Rhs {
					if rhs == expr && i < len(parent.Lhs) {
						if name, direct := parent.Lhs[i].(*ast.Ident); direct {
							allowed = name.Obj != nil && writes[name.Obj] == 1 && !escapes[name.Obj]
						}
					}
				}
			}
			if !allowed {
				out = append(out, result(n, "unknown", ""))
			}
			return true
		})
		ast.Inspect(file, func(n ast.Node) bool {
			// Unsupported writer containers/callbacks and mutable function aliases fail closed.
			if composite, ok := n.(*ast.CompositeLit); ok {
				ast.Inspect(composite, func(child ast.Node) bool {
					if expr, ok := child.(ast.Expr); ok && writer(expr) {
						out = append(out, result(child, "unknown", ""))
						return false
					}
					return true
				})
			}
			if assignment, ok := n.(*ast.AssignStmt); ok {
				for i, rhs := range assignment.Rhs {
					if writer(rhs) && i < len(assignment.Lhs) {
						if _, direct := assignment.Lhs[i].(*ast.Ident); !direct {
							out = append(out, result(assignment, "unknown", ""))
						}
					}
				}
			}
			call, ok := n.(*ast.CallExpr)
			if !ok {
				return true
			}
			for _, arg := range call.Args {
				if writer(arg) {
					out = append(out, result(call, "unknown", ""))
				}
			}
			if writer(call.Fun) && resolve(call.Fun, map[string]bool{}) == call.Fun {
				if _, alias := call.Fun.(*ast.Ident); alias && call.Fun.(*ast.Ident).Obj != nil {
					out = append(out, result(call, "unknown", ""))
					return true
				}
			}
			if wrapper(call.Fun) {
				record := result(call, "unknown", "")
				selected := resolve(call.Fun, map[string]bool{})
				isHTTPError := false
				if sel, ok := selected.(*ast.SelectorExpr); ok {
					if id, ok := sel.X.(*ast.Ident); ok {
						isHTTPError = id.Name == httpName && sel.Sel.Name == "Error"
					}
				}
				if id, ok := selected.(*ast.Ident); ok {
					isHTTPError = httpName == "." && id.Name == "Error"
				}
				if isHTTPError && len(call.Args) == 3 {
					// Plain fixed error text is supported. Raw JSON/YAML and
					// arbitrary dynamic values are not automatically diagnostics.
					if lit, ok := resolve(call.Args[1], map[string]bool{}).(*ast.BasicLit); ok && lit.Kind == token.STRING {
						text, _ := strconv.Unquote(lit.Value)
						trim := strings.TrimSpace(text)
						if trim != "" && !strings.HasPrefix(trim, "{") && !strings.HasPrefix(trim, "[") && !strings.HasPrefix(trim, "---") && !strings.Contains(trim, "apiVersion") {
							record.Role = "non-api"
						}
					}
					// Original selected dynamic codes have an actual fixed
					// allowlist guard. Bind caller and every needed helper;
					// this is not approval of error strings or HTTP in general.
					sum := sha256.Sum256([]byte(record.Operation))
					digest := hex.EncodeToString(sum[:])
					if record.Function == "productHandler" && syntax(call.Args[1]) == "code" {
						// Current API-read failures can forward the server's
						// message through apiError.Error. DEMO_PRODUCT_ alone
						// is not a closed error-text/root authority.
						record.AuthorityQualified = false
						record.AuthorityIssues = append(record.AuthorityIssues, in.Path+": unsupported API-read error-result authority for productHandler http.Error(code)")
					}
					if record.Function == "readinessHandler" && digest == "fc9bb294ed751512a810cde45e4e329da27e0f4a5dc637a69dffe59d6b71d73e" && syntax(call.Args[1]) == "readyErrorCode(err)" {
						helpers := map[string]string{"readyErrorCode": "73861f7a9077f2207486187e04382bf594bf08098f61178a9c8848534b00e77f", "contains": "861da2e513e9f6eac81b2d7f2850e1d2fb00de159176b703abf40803ad59e744"}
						counts := map[string]int{}
						qualified := true
						for _, fact := range record.Dependencies {
							if expected, selected := helpers[fact.Symbol]; selected {
								counts[fact.Symbol]++
								qualified = qualified && fact.SHA256 == expected
							}
						}
						for symbol := range helpers {
							qualified = qualified && counts[symbol] == 1 && len(declarations[filepath.Dir(in.Path)][symbol]) == 1
						}
						// The helper calls Error twice. Bind the selected actual
						// error producers too, so a new stateful Error method
						// cannot return an allowlisted code then raw API text.
						facts := append([]operationFact(nil), record.Dependencies...)
						for i := range facts {
							relative, err := filepath.Rel(filepath.Dir(in.Path), facts[i].Path)
							if err == nil {
								facts[i].Path = filepath.ToSlash(relative)
							}
						}
						bytes, _ := json.Marshal(facts)
						sum := sha256.Sum256(bytes)
						qualified = qualified && hex.EncodeToString(sum[:]) == "ff16b31675d9cfc96af023968286b57e54593730a49e09985124bdb736704e3a"
						if qualified {
							record.Role = "non-api"
						}
					}
				}
				out = append(out, record)
				return true
			}
			fn := resolve(call.Fun, map[string]bool{})
			if id, ok := fn.(*ast.Ident); ok && jsonName == "." && (id.Name == "Marshal" || id.Name == "MarshalIndent" || id.Name == "NewEncoder") {
				out = append(out, result(call, "unknown", ""))
				return true
			}
			if method, ok := fn.(*ast.SelectorExpr); ok {
				if owner, ok := method.X.(*ast.Ident); ok && owner.Name == jsonName && (method.Sel.Name == "Marshal" || method.Sel.Name == "MarshalIndent" || method.Sel.Name == "NewEncoder") {
					out = append(out, result(call, "unknown", ""))
					return true
				}
			}
			if id, ok := fn.(*ast.Ident); ok && id.Obj == nil && (id.Name == "print" || id.Name == "println") {
				out = append(out, result(call, "unknown", ""))
				return true
			}
			sel, ok := resolve(call.Fun, map[string]bool{}).(*ast.SelectorExpr)
			if id, direct := fn.(*ast.Ident); direct {
				owner := ""
				switch {
				case id.Name == "Marshal" || id.Name == "MarshalIndent" || id.Name == "NewEncoder" || id.Name == "Encode":
					owner = jsonName
				case osName == "." && id.Name == "WriteFile":
					owner = osName
				case ioName == "." && (id.Name == "Copy" || id.Name == "CopyN" || id.Name == "CopyBuffer"):
					owner = ioName
				case httpName == "." && id.Name == "Post":
					owner = httpName
				}
				if owner != "" {
					sel = &ast.SelectorExpr{X: &ast.Ident{Name: owner}, Sel: id}
					ok = true
				}
			}

			if id, direct := fn.(*ast.Ident); direct && fmtName == "." && (id.Name == "Print" || id.Name == "Println" || id.Name == "Printf" || id.Name == "Fprint" || id.Name == "Fprintln" || id.Name == "Fprintf") {
				sel = &ast.SelectorExpr{X: &ast.Ident{Name: fmtName}, Sel: id}
				ok = true
			}
			if !ok {
				return true
			}
			if sel.Sel.Name == "Marshal" || sel.Sel.Name == "MarshalIndent" || sel.Sel.Name == "NewEncoder" || sel.Sel.Name == "Encode" || sel.Sel.Name == "Do" || sel.Sel.Name == "WriteTo" || sel.Sel.Name == "ReadFrom" {
				out = append(out, result(call, "unknown", ""))
				return true
			}
			if owner, ok := sel.X.(*ast.Ident); ok && ((owner.Name == ioName && (sel.Sel.Name == "Copy" || sel.Sel.Name == "CopyN" || sel.Sel.Name == "CopyBuffer")) || (owner.Name == httpName && sel.Sel.Name == "Post")) {
				out = append(out, result(call, "unknown", ""))
				return true
			}
			sink := sel.Sel.Name == "Write" || sel.Sel.Name == "WriteString" || sel.Sel.Name == "WriteFile"
			arg := 0
			if sel.Sel.Name == "WriteFile" {
				arg = 1
			}
			if id, ok := sel.X.(*ast.Ident); ok && id.Name == fmtName {
				switch sel.Sel.Name {
				case "Print", "Println", "Printf":
					sink = true
				case "Fprint", "Fprintln", "Fprintf":
					// fmt accepts arbitrary io.Writer destinations, including created files.
					sink = true
					arg = 1
				}
			}
			if dst, ok := resolve(sel.X, map[string]bool{}).(*ast.SelectorExpr); ok {
				if owner, ok := dst.X.(*ast.Ident); ok && owner.Name == osName && (dst.Sel.Name == "Stdout" || dst.Sel.Name == "Stderr") && (sel.Sel.Name == "Write" || sel.Sel.Name == "WriteString") {
					sink = true
				}
			}
			if !sink {
				return true
			}
			if owner, ok := sel.X.(*ast.Ident); ok && owner.Name == fmtName {
				staticText := ""
				unknown := false
				for _, value := range call.Args[arg:] {
					resolved := resolve(value, map[string]bool{})
					literal, ok := resolved.(*ast.BasicLit)
					if !ok {
						unknown = true
						break
					}
					if literal.Kind == token.STRING {
						text, _ := strconv.Unquote(literal.Value)
						staticText += text
					}
				}
				if !unknown && strings.Contains(staticText, "apiVersion:") && strings.Contains(staticText, "kind:") && !strings.Contains(staticText, "%") {
					out = append(out, result(call, "api", staticText))
					return true
				}
				if unknown || strings.Contains(staticText, "apiVersion") || strings.Contains(staticText, "%") {
					out = append(out, result(call, "unknown", ""))
					return true
				}
			}
			role := "unknown"
			literalText := ""
			if len(call.Args) > arg {
				value := resolve(call.Args[arg], map[string]bool{})
				if conversion, ok := value.(*ast.CallExpr); ok && len(conversion.Args) == 1 && plainNativeType(conversion.Fun, declarations[filepath.Dir(in.Path)], false, map[string]bool{}) {
					value = conversion.Args[0]
				}
				if lit, ok := value.(*ast.BasicLit); ok && lit.Kind == token.STRING {
					text, _ := strconv.Unquote(lit.Value)
					if strings.Contains(text, "apiVersion:") && strings.Contains(text, "kind:") {
						role = "api"
						literalText = text
					}
					trim := strings.TrimSpace(text)
					if trim != "" && !strings.HasPrefix(trim, "%") && !strings.HasPrefix(trim, "{") && !strings.HasPrefix(trim, "[") && !strings.HasPrefix(trim, "---") && !strings.Contains(trim, "apiVersion:") {
						role = "non-api"
					}
				}
			}
			out = append(out, result(call, role, literalText))
			return true
		})
	}
	json.NewEncoder(os.Stdout).Encode(out)
}

// Only closed local types without receiver methods may inherit initializer or
// incoming argument authority. Named conversions and aliases must retain this
// check: fmt and encoding/json dispatch on the actual type, not its literal.
func plainNativeType(t ast.Expr, decls map[string][]declaration, transport bool, seen map[string]bool) bool {
	switch v := t.(type) {
	case *ast.ParenExpr:
		return plainNativeType(v.X, decls, transport, seen)
	case *ast.Ident:
		if seen[v.Name] {
			return false
		}
		seen[v.Name] = true
		defer delete(seen, v.Name)
		choices := decls[v.Name]
		if len(choices) == 0 && v.Obj == nil {
			switch v.Name {
			case "string", "bool", "byte", "rune", "int", "int8", "int16", "int32", "int64", "uint", "uint8", "uint16", "uint32", "uint64", "uintptr", "float32", "float64", "complex64", "complex128":
				return true
			}
			return false
		}
		if len(choices) != 1 {
			return false
		}
		for _, group := range decls {
			for _, d := range group {
				if fn, ok := d.node.(*ast.FuncDecl); ok && fn.Recv != nil {
					for _, field := range fn.Recv.List {
						receiver := field.Type
						if ptr, ok := receiver.(*ast.StarExpr); ok {
							receiver = ptr.X
						}
						if id, ok := receiver.(*ast.Ident); ok && id.Name == v.Name {
							return false
						}
					}
				}
			}
		}
		gen, ok := choices[0].node.(*ast.GenDecl)
		if !ok {
			return false
		}
		for _, spec := range gen.Specs {
			if typ, ok := spec.(*ast.TypeSpec); ok && typ.Name.Name == v.Name {
				return plainNativeType(typ.Type, decls, transport, seen)
			}
		}
	case *ast.MapType:
		return transport && plainNativeType(v.Key, decls, false, map[string]bool{}) && plainNativeType(v.Value, decls, true, seen)
	case *ast.ArrayType:
		return transport && plainNativeType(v.Elt, decls, true, seen)
	case *ast.InterfaceType:
		return transport && len(v.Methods.List) == 0
	}
	return false
}
func plainDeclaredValue(object *ast.Object, decls map[string][]declaration, transport bool) bool {
	switch declaration := object.Decl.(type) {
	case *ast.ValueSpec:
		return declaration.Type == nil || plainNativeType(declaration.Type, decls, transport, map[string]bool{})
	case *ast.Field:
		return plainNativeType(declaration.Type, decls, transport, map[string]bool{})
	}
	return true
}

// Custom serializer dispatch is outside the finite source shape protocol.
// Name the actual receiver source; no method evaluator or receipt exemption.
func nativeSerializerMethodIssues(decls map[string][]declaration) []string {
	issues := []string{}
	for _, name := range []string{"MarshalJSON", "MarshalText"} {
		for _, declaration := range decls[name] {
			if fn, ok := declaration.node.(*ast.FuncDecl); ok && fn.Recv != nil {
				issues = append(issues, declaration.path+": unsupported custom serializer receiver authority: "+name)
			}
		}
	}
	return issues
}

// qualifyTransportBodies proves a closed submission grammar independently of
// receipt digests. Maps are product constructor inputs (including dynamic field
// values); an opaque whole document, a returned transport capability or a
// callback cannot borrow the serializer's reviewed role.
func qualifyTransportBodies(decls map[string][]declaration) bool {
	// The shape projector does not dispatch local custom marshal methods, even
	// for typed identity values inside a raw map. Reject that package boundary.
	if len(nativeSerializerMethodIssues(decls)) != 0 {
		return false
	}
	functions := map[string][]*ast.FuncDecl{}
	owners := map[*ast.Object]*ast.FuncDecl{}
	values := map[*ast.Object][]ast.Expr{}
	parents := map[ast.Node]ast.Node{}
	calls := []*ast.CallExpr{}
	roots := []ast.Node{}
	for _, choices := range decls {
		for _, decl := range choices {
			roots = append(roots, decl.node)
			if fn, ok := decl.node.(*ast.FuncDecl); ok {
				functions[fn.Name.Name] = append(functions[fn.Name.Name], fn)
				if fn.Type.Params != nil {
					for _, field := range fn.Type.Params.List {
						for _, name := range field.Names {
							if name.Obj != nil {
								owners[name.Obj] = fn
							}
						}
					}
				}
			}
		}
	}
	// Declarations can share a GenDecl; inspect each AST node only once.
	visited := map[ast.Node]bool{}
	for _, root := range roots {
		if visited[root] {
			continue
		}
		visited[root] = true
		stack := []ast.Node{}
		ast.Inspect(root, func(n ast.Node) bool {
			if n == nil {
				stack = stack[:len(stack)-1]
				return true
			}
			if len(stack) > 0 {
				parents[n] = stack[len(stack)-1]
			}
			stack = append(stack, n)
			switch v := n.(type) {
			case *ast.CallExpr:
				calls = append(calls, v)
			case *ast.AssignStmt:
				for i, lhs := range v.Lhs {
					if id, ok := lhs.(*ast.Ident); ok && id.Obj != nil {
						if i < len(v.Rhs) {
							values[id.Obj] = append(values[id.Obj], v.Rhs[i])
						} else if len(v.Rhs) == 1 {
							values[id.Obj] = append(values[id.Obj], v.Rhs[0])
						}
					}
				}
			case *ast.RangeStmt:
				if id, ok := v.Value.(*ast.Ident); ok && id.Obj != nil {
					values[id.Obj] = append(values[id.Obj], v.X)
				}
			case *ast.ValueSpec:
				for i, id := range v.Names {
					if id.Obj != nil && i < len(v.Values) {
						values[id.Obj] = append(values[id.Obj], v.Values[i])
					}
				}
			}
			return true
		})
	}
	nameOf := func(e ast.Expr) string {
		switch v := e.(type) {
		case *ast.Ident:
			return v.Name
		case *ast.SelectorExpr:
			return v.Sel.Name
		}
		return ""
	}
	// Effects on an alias, through an escaped address, or through a helper are
	// not represented by the shape evaluator. Do not qualify origin alone.
	// This follows lexical objects rather than names or probe-specific bodies.
	var mutatesParameter func(*ast.FuncDecl, int, map[*ast.FuncDecl]bool) bool
	mutatesParameter = func(fn *ast.FuncDecl, index int, seen map[*ast.FuncDecl]bool) bool {
		if seen[fn] {
			return true
		}
		seen[fn] = true
		defer delete(seen, fn)
		var parameter *ast.Object
		cursor := 0
		for _, field := range fn.Type.Params.List {
			for _, id := range field.Names {
				if cursor == index {
					parameter = id.Obj
				}
				cursor++
			}
		}
		if parameter == nil {
			return true
		}
		aliases := map[*ast.Object]bool{parameter: true}
		for changed := true; changed; {
			changed = false
			ast.Inspect(fn.Body, func(n ast.Node) bool {
				if a, ok := n.(*ast.AssignStmt); ok {
					for i, lhs := range a.Lhs {
						if i < len(a.Rhs) {
							l, lok := lhs.(*ast.Ident)
							r, rok := a.Rhs[i].(*ast.Ident)
							if lok && rok && aliases[r.Obj] && !aliases[l.Obj] {
								aliases[l.Obj] = true
								changed = true
							}
						}
					}
				}
				return true
			})
		}
		rootAlias := func(e ast.Expr) bool {
			for {
				switch v := e.(type) {
				case *ast.IndexExpr:
					e = v.X
				case *ast.ParenExpr:
					e = v.X
				case *ast.UnaryExpr:
					e = v.X
				default:
					id, ok := e.(*ast.Ident)
					return ok && aliases[id.Obj]
				}
			}
		}
		mutation := false
		ast.Inspect(fn.Body, func(n ast.Node) bool {
			if a, ok := n.(*ast.AssignStmt); ok {
				for _, lhs := range a.Lhs {
					if _, indexed := lhs.(*ast.IndexExpr); indexed && rootAlias(lhs) {
						mutation = true
					}
				}
			}
			if call, ok := n.(*ast.CallExpr); ok {
				for i, arg := range call.Args {
					if rootAlias(arg) {
						name := nameOf(call.Fun)
						if name == "kube" || name == "requestPayload" || name == "len" {
							continue
						}
						choices := functions[name]
						if len(choices) != 1 || mutatesParameter(choices[0], i, seen) {
							mutation = true
						}
					}
				}
			}
			return true
		})
		return mutation
	}
	bodyEffectsSafe := func(id *ast.Ident) bool {
		for node, parent := range parents {
			ref, ok := node.(*ast.Ident)
			if !ok || ref.Obj != id.Obj {
				continue
			}
			if a, ok := parent.(*ast.AssignStmt); ok {
				for i, rhs := range a.Rhs {
					if rhs == ref && i < len(a.Lhs) {
						if _, alias := a.Lhs[i].(*ast.Ident); alias {
							return false
						}
					}
				}
			}
			if call, ok := parent.(*ast.CallExpr); ok {
				for i, arg := range call.Args {
					if arg != ref {
						continue
					}
					name := nameOf(call.Fun)
					if name == "kube" || name == "requestPayload" || name == "len" || name == "deepCopyMap" || name == "append" {
						continue
					}
					choices := functions[name]
					if len(choices) != 1 || mutatesParameter(choices[0], i, map[*ast.FuncDecl]bool{}) {
						return false
					}
				}
			}
		}
		return true
	}
	var safe func(ast.Expr, map[ast.Expr]bool) bool
	safe = func(e ast.Expr, seen map[ast.Expr]bool) bool {
		if e == nil || seen[e] {
			return false
		}
		seen[e] = true
		defer delete(seen, e)
		switch v := e.(type) {
		case *ast.ParenExpr:
			return safe(v.X, seen)
		case *ast.CompositeLit:
			if _, ok := v.Type.(*ast.MapType); ok {
				return plainNativeType(v.Type, decls, true, map[string]bool{})
			}
			if array, ok := v.Type.(*ast.ArrayType); ok {
				if _, mapElement := array.Elt.(*ast.MapType); mapElement {
					for _, element := range v.Elts {
						if !safe(element, seen) {
							return false
						}
					}
					return true
				}
			}
			return false
		case *ast.Ident:
			if v.Name == "nil" {
				return true
			}
			if v.Obj == nil || !plainDeclaredValue(v.Obj, decls, true) {
				return false
			}
			if assignments := values[v.Obj]; len(assignments) > 0 {
				if !bodyEffectsSafe(v) {
					return false
				}
				for node := range parents {
					address, ok := node.(*ast.UnaryExpr)
					if !ok || address.Op != token.AND {
						continue
					}
					id, ok := address.X.(*ast.Ident)
					if ok && id.Obj == v.Obj {
						return false
					}
				}
				for _, rhs := range assignments {
					if appendCall, ok := rhs.(*ast.CallExpr); ok && nameOf(appendCall.Fun) == "append" && len(appendCall.Args) > 0 && nameOf(appendCall.Args[0]) == v.Name {
						for _, argument := range appendCall.Args[1:] {
							if !safe(argument, seen) {
								return false
							}
						}
						continue
					}
					if !safe(rhs, seen) {
						return false
					}
				}
				return true
			}
			// The existing Secret-copy producer reads a typed map through a
			// body-free Kubernetes GET before applying its explicit sanitizer.
			// No other address-taking use may populate that whole document.
			readMap := false
			addressesSafe := true
			for node, parent := range parents {
				address, ok := node.(*ast.UnaryExpr)
				if !ok || address.Op != token.AND {
					continue
				}
				id, ok := address.X.(*ast.Ident)
				if !ok || id.Obj != v.Obj {
					continue
				}
				call, ok := parent.(*ast.CallExpr)
				if !ok || nameOf(call.Fun) != "kube" || len(call.Args) != 6 || call.Args[5] != address {
					addressesSafe = false
					continue
				}
				method, ok := call.Args[1].(*ast.SelectorExpr)
				body, nilBody := call.Args[3].(*ast.Ident)
				if !ok || nameOf(method.X) != "http" || method.Sel.Name != "MethodGet" || !nilBody || body.Name != "nil" {
					addressesSafe = false
					continue
				}
				readMap = true
			}
			if readMap && addressesSafe {
				return true
			}
			fn := owners[v.Obj]
			if fn == nil || ast.IsExported(fn.Name.Name) {
				return false
			}
			index := 0
			found := false
			for _, field := range fn.Type.Params.List {
				for _, name := range field.Names {
					if name.Obj == v.Obj {
						found = true
						break
					}
					index++
				}
				if found {
					break
				}
			}
			if !found {
				return false
			}
			for node, parent := range parents {
				expr, ok := node.(ast.Expr)
				if !ok || nameOf(expr) != fn.Name.Name {
					continue
				}
				if declaration, ok := parent.(*ast.FuncDecl); ok && declaration.Name == expr {
					continue
				}
				if selector, ok := parent.(*ast.SelectorExpr); ok && selector.Sel == expr {
					continue
				}
				call, ok := parent.(*ast.CallExpr)
				if !ok || call.Fun != expr {
					return false
				}
			}
			any := false
			for _, call := range calls {
				if nameOf(call.Fun) == fn.Name.Name {
					if index >= len(call.Args) || !safe(call.Args[index], seen) {
						return false
					}
					any = true
				}
			}
			return any
		case *ast.CallExpr:
			if nameOf(v.Fun) == "deepCopyMap" && len(v.Args) == 1 {
				choices := functions["deepCopyMap"]
				if len(choices) != 1 {
					return false
				}
				var buf bytes.Buffer
				format.Node(&buf, token.NewFileSet(), choices[0])
				closed := `func deepCopyMap(value map[string]interface{}) map[string]interface{} { data, err := json.Marshal(value); if err != nil { return map[string]interface{}{} }; var out map[string]interface{}; if err := json.Unmarshal(data, &out); err != nil { return map[string]interface{}{} }; return out }`
				normalize := func(text string) string { return strings.Join(strings.Fields(strings.ReplaceAll(text, ";", "")), "") }
				return normalize(buf.String()) == normalize(closed) && safe(v.Args[0], seen)
			}
			choices := functions[nameOf(v.Fun)]
			if len(choices) != 1 {
				return false
			}
			if choices[0].Type.Results != nil {
				if len(choices[0].Type.Results.List) == 0 || !plainNativeType(choices[0].Type.Results.List[0].Type, decls, true, map[string]bool{}) {
					return false
				}
			}
			any := false
			qualified := true
			ast.Inspect(choices[0].Body, func(n ast.Node) bool {
				if _, nested := n.(*ast.FuncLit); nested {
					return false
				}
				if ret, ok := n.(*ast.ReturnStmt); ok && len(ret.Results) > 0 {
					any = true
					qualified = qualified && safe(ret.Results[0], seen)
				}
				return true
			})
			return any && qualified
		}
		return false
	}
	// A capability must be invoked directly. Aliases, callbacks, globals, method
	// returns and containers require an explicit new qualification, even if their
	// declaration digests have been refreshed in the authority registry.
	for node, parent := range parents {
		expr, ok := node.(ast.Expr)
		if !ok {
			continue
		}
		name := nameOf(expr)
		if name != "kube" && name != "requestPayload" {
			continue
		}
		if fn, ok := parent.(*ast.FuncDecl); ok && fn.Name == expr {
			continue
		}
		// The selector's name identifier is not itself a method value.
		if selector, ok := parent.(*ast.SelectorExpr); ok && selector.Sel == expr {
			continue
		}
		call, ok := parent.(*ast.CallExpr)
		if !ok || call.Fun != expr {
			return false
		}
		if name == "kube" {
			if len(call.Args) != 6 || !safe(call.Args[3], map[ast.Expr]bool{}) {
				return false
			}
		}
		if name == "requestPayload" {
			// Direct constructor calls may use the serializer too. The transport's
			// body parameter is checked through every kube submission above;
			// other callers must independently prove their whole-map origin.
			var owner *ast.FuncDecl
			for p := ast.Node(call); p != nil; p = parents[p] {
				if fn, ok := p.(*ast.FuncDecl); ok {
					owner = fn
					break
				}
			}
			if len(call.Args) != 1 {
				return false
			}
			if owner != nil && owner.Name.Name == "kube" {
				id, ok := call.Args[0].(*ast.Ident)
				if !ok || id.Name != "body" || owners[id.Obj] != owner {
					return false
				}
			} else if !safe(call.Args[0], map[ast.Expr]bool{}) {
				return false
			}
		}
	}
	return true
}

// The selection boundary is finite: bind module files and reviewed imported
// authority names. Never ask go list/build to download or execute producers.
func moduleAuthorityPaths(source string) []string {
	dir, _ := filepath.Abs(filepath.Dir(source))
	paths := []string{}
	moduleFound := false
	for {
		if !moduleFound {
			if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
				moduleFound = true
				paths = append(paths, filepath.Join(dir, "go.mod"))
				if _, err := os.Stat(filepath.Join(dir, "go.sum")); err == nil {
					paths = append(paths, filepath.Join(dir, "go.sum"))
				}
			}
		}
		for _, name := range []string{"go.work", "go.work.sum"} {
			if _, err := os.Stat(filepath.Join(dir, name)); err == nil {
				paths = append(paths, filepath.Join(dir, name))
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	if work := os.Getenv("GOWORK"); work != "" && work != "off" && filepath.IsAbs(work) {
		paths = append(paths, work)
		if _, err := os.Stat(work + ".sum"); err == nil {
			paths = append(paths, work+".sum")
		}
	}
	sort.Strings(paths)
	return paths
}

func importAuthority(source string, file *ast.File) (bool, []string) {
	issues := []string{}
	if work := os.Getenv("GOWORK"); work != "" && work != "off" {
		issues = append(issues, source+": explicit GOWORK selection is outside the reviewed finite authority")
	}
	if flags := os.Getenv("GOFLAGS"); flags != "" {
		issues = append(issues, source+": explicit GOFLAGS selection is outside the reviewed finite authority")
	}
	approved := map[string]string{
		"github.com/cilium/cilium/hubble/cmd":                                             "github.com/cilium/cilium v1.20.1",
		"github.com/containerd/nri/pkg/api":                                               "github.com/containerd/nri v0.10.0",
		"github.com/containerd/nri/pkg/stub":                                              "github.com/containerd/nri v0.10.0",
		"github.com/cyberphone/json-canonicalization/go/src/webpki.org/jsoncanonicalizer": "github.com/cyberphone/json-canonicalization v0.0.0-20241213102144-19d51d7fe467",
		"kubeclaw.dev/pipeline-observability/go":                                          "",
	}
	module := ""
	for _, path := range moduleAuthorityPaths(source) {
		data, err := os.ReadFile(path)
		if err != nil {
			issues = append(issues, path+": unreadable authority")
			continue
		}
		if filepath.Base(path) == "go.mod" {
			moduleLines := []string{}
			for _, raw := range strings.Split(string(data), "\n") {
				line := strings.Join(strings.Fields(strings.SplitN(raw, "//", 2)[0]), " ")
				moduleLines = append(moduleLines, strings.TrimPrefix(line, "require "))
			}
			module = "\n" + strings.Join(moduleLines, "\n") + "\n"
		}
		if filepath.Base(path) == "go.work" {
			issues = append(issues, path+": workspace module selection is outside the reviewed finite authority")
		}
		if filepath.Base(path) == "go.mod" {
			replaceBlock := false
			for _, raw := range strings.Split(string(data), "\n") {
				line := strings.Join(strings.Fields(strings.SplitN(raw, "//", 2)[0]), " ")
				if strings.HasPrefix(line, "exclude ") || line == "exclude (" {
					issues = append(issues, path+": unsupported excluded module authority: "+line)
				}
				if line == "replace (" {
					replaceBlock = true
					continue
				}
				if replaceBlock && line == ")" {
					replaceBlock = false
					continue
				}
				replacement := strings.TrimSpace(strings.TrimPrefix(line, "replace "))
				if (strings.HasPrefix(line, "replace ") || replaceBlock) && replacement != "" && replacement != "github.com/opencontainers/runtime-tools v0.9.0 => github.com/opencontainers/runtime-tools v0.0.0-20221026201742-946c877fa809" {
					issues = append(issues, path+": unsupported replace authority: "+line)
				}
			}
		}
	}
	for _, spec := range file.Imports {
		path, _ := strconv.Unquote(spec.Path.Value)
		// Standard-library authority belongs to the actual native toolchain.
		if !strings.Contains(strings.Split(path, "/")[0], ".") {
			cleaned := filepath.ToSlash(filepath.Clean(path))
			info, err := os.Stat(filepath.Join(runtime.GOROOT(), "src", path))
			if cleaned != path || strings.HasPrefix(path, "/") || err != nil || !info.IsDir() {
				issues = append(issues, source+": unsupported non-standard imported authority "+path)
			}
			continue
		}
		pin, ok := approved[path]
		if !ok {
			issues = append(issues, source+": unsupported imported authority "+path)
			continue
		}
		if path == "kubeclaw.dev/pipeline-observability/go" {
			alias := filepath.Base(path)
			if spec.Name != nil {
				alias = spec.Name.Name
			}
			reviewedConsumer := false
			for _, decl := range file.Decls {
				if _, ok := decl.(*ast.GenDecl); ok { // ImportSpecs are custody, not calls.
					if decl.(*ast.GenDecl).Tok == token.IMPORT {
						continue
					}
				}
				uses := false
				ast.Inspect(decl, func(n ast.Node) bool {
					if id, ok := n.(*ast.Ident); ok && id.Name == alias {
						uses = true
					}
					return true
				})
				if !uses {
					continue
				}
				var caller bytes.Buffer
				format.Node(&caller, token.NewFileSet(), decl)
				digest := sha256.Sum256(caller.Bytes())
				if alias == "observabilityv1" && hex.EncodeToString(digest[:]) == "b9759587c10efccd4ee8ba6464d5c6ff89fe7d43fdd8760107574beeec377aba" {
					reviewedConsumer = true
				} else {
					issues = append(issues, source+": unreviewed EncodeCanonical consumer control; returned error must be checked before accepting canonical bytes")
				}
			}
			if !reviewedConsumer {
				issues = append(issues, source+": incomplete reviewed EncodeCanonical consumer/control closure")
			}
		}
		if path == "github.com/cyberphone/json-canonicalization/go/src/webpki.org/jsoncanonicalizer" {
			_, _, externalIssues := canonicalizerAuthority(source, file)
			issues = append(issues, externalIssues...)
		}
		if pin != "" && !strings.Contains(module, "\n"+pin+"\n") {
			issues = append(issues, source+": unqualified selected module for "+path)
		}
	}
	sort.Strings(issues)
	return len(issues) == 0, issues
}

// Actual selected primary-source investigation supports these source-specific
// rejections. A pin is not an error-text role proof. In particular Hubble strips
// the gRPC Unknown status wrapper before returning the remote message.
func externalErrorBoundary(origin string) string {
	if origin == "cmd.Execute" {
		return "; cilium v1.20.1 hubble/cmd/root.go Execute forwards Cobra dispatch; hubble/cmd/observe/flows.go RunE returns errors.New(status.Message()) for gRPC Unknown, so remote JSON/API text remains possible"
	}
	return "; nri v0.10.0 pkg/stub/stub.go Run forwards Start and srvErrC results; Start binds connection, registration and Configure channels, while ttrpc v1.2.7 server.go Serve returns listener errors. The selected SDK lifecycle/handler/listener closure is not a reviewed finite error-text authority; diagnostic stderr alone is not a non-API proof"
}

// This reviewed external boundary is a serializer property, not an output-role
// exemption. The primary Transform body parses each name/value pair, sorts by
// UTF-16 and decorates the same name; NumberToJSON changes only numeric values.
// Error bytes are never accepted by the reviewed callers. Actual downloaded
// source, exact file set, selected sums and narrow native caller receipts are
// checked offline on every run. The adapter never downloads or executes it.
func canonicalizerAuthority(source string, file *ast.File) ([]operationFact, []externalSourceFact, []string) {
	const module = "github.com/cyberphone/json-canonicalization"
	const version = "v0.0.0-20241213102144-19d51d7fe467"
	const relative = "go/src/webpki.org/jsoncanonicalizer"
	selected := false
	issues := []string{}
	for _, spec := range file.Imports {
		path, _ := strconv.Unquote(spec.Path.Value)
		if path != module+"/"+relative {
			continue
		}
		selected = true
		if spec.Name != nil && spec.Name.Name != "jsoncanonicalizer" {
			issues = append(issues, source+": unreviewed canonicalizer import alias")
		}
	}
	if !selected {
		return nil, nil, nil
	}
	sums := ""
	for _, path := range moduleAuthorityPaths(source) {
		if filepath.Base(path) == "go.sum" {
			data, _ := os.ReadFile(path)
			sums = "\n" + string(data) + "\n"
		}
	}
	for _, entry := range []string{
		module + " " + version + " h1:uX1JmpONuD549D73r6cgnxyUu18Zb7yHAy5AYU0Pm4Q=",
		module + " " + version + "/go.mod h1:uzvlm1mxhHkdfqitSA92i7Se+S9ksOn3a3qmv/kyOCw=",
	} {
		if !strings.Contains(sums, "\n"+entry+"\n") {
			issues = append(issues, source+": canonicalizer selected checksum authority missing or changed: "+entry)
		}
	}
	// Four original caller declarations were read together, including the valid
	// Marshal inputs, error propagation and hash consumers. These are narrow
	// syntax/control receipts; refreshing a registry digest cannot authorize a
	// changed or added caller. This is deliberately not a general Go evaluator.
	callers := map[string]string{
		"decodeStrict":          "1fa0e07bf93aaf4f7bdf18edb4b7791fb500667d938f0f42df6c43d473d66d2e",
		"EncodeCanonical":       "9edc6200f29538f8ec33a6e8294f0fa2b3e697f12fe34cf170161ac52018e773",
		"ProducerRecordDigest":  "6ce9b4daea4e13039dbea0e7a36714380f45ec8a4308b810acb1c510e0d61c3b",
		"ProducerClosureDigest": "cd36b34356c4b2a0881b629d3e371f988a114b5d5465c5beff3a9a27d2ac573a",
	}
	found := map[string]bool{}
	for _, decl := range file.Decls {
		fn, isFunction := decl.(*ast.FuncDecl)
		uses := false
		ast.Inspect(decl, func(n ast.Node) bool {
			if id, ok := n.(*ast.Ident); ok && id.Name == "jsoncanonicalizer" {
				uses = true
			}
			return true
		})
		if !uses {
			continue
		}
		expected := ""
		if isFunction {
			expected = callers[fn.Name.Name]
		}
		var syntax bytes.Buffer
		format.Node(&syntax, token.NewFileSet(), decl)
		digest := sha256.Sum256(syntax.Bytes())
		if expected == "" || hex.EncodeToString(digest[:]) != expected {
			issues = append(issues, source+": unreviewed canonicalizer caller/control declaration; valid JSON and checked error acceptance are required")
		} else {
			found[fn.Name.Name] = true
		}
	}
	if len(found) != len(callers) {
		issues = append(issues, source+": incomplete reviewed canonicalizer caller/control closure")
	}
	cache := os.Getenv("GOMODCACHE")
	if cache == "" {
		root := os.Getenv("GOPATH")
		if root == "" {
			home, _ := os.UserHomeDir()
			root = filepath.Join(home, "go")
		}
		cache = filepath.Join(strings.Split(root, string(os.PathListSeparator))[0], "pkg", "mod")
	}
	cache, err := filepath.Abs(cache)
	if err != nil {
		issues = append(issues, source+": invalid canonicalizer source cache selection")
	}
	dir := filepath.Join(cache, module+"@"+version, relative)
	expectedSources := map[string]string{
		"jsoncanonicalizer.go": "f77ac1b1e62ca9ab063cc558702ab830a0e6442fe71659d34d63897ea9c4e1ac",
		"es6numfmt.go":         "a5f31e4411d030c309b79d865329d02f90deeaabb9e926ceb0399cf053541e8c",
	}
	names := []string{}
	entries, err := os.ReadDir(dir)
	if err != nil {
		issues = append(issues, source+": selected canonicalizer primary-source directory unavailable: "+dir)
	}
	for _, entry := range entries {
		names = append(names, entry.Name())
	}
	sort.Strings(names)
	directoryDigest := sha256.Sum256([]byte(strings.Join(names, "\n")))
	facts := []operationFact{{dir, "external-package-source-set", hex.EncodeToString(directoryDigest[:])}}
	if strings.Join(names, "\n") != "es6numfmt.go\njsoncanonicalizer.go" {
		issues = append(issues, source+": unreviewed canonicalizer package source set")
	}
	receipts := []externalSourceFact{}
	for _, name := range []string{"es6numfmt.go", "jsoncanonicalizer.go"} {
		path := filepath.Join(dir, name)
		data, readErr := os.ReadFile(path)
		digest := sha256.Sum256(data)
		actual := hex.EncodeToString(digest[:])
		facts = append(facts, operationFact{path, "external-source:" + name, actual})
		if readErr != nil || actual != expectedSources[name] {
			issues = append(issues, source+": selected canonicalizer primary-source bytes missing or changed: "+path)
		}
		receipts = append(receipts, externalSourceFact{module, version, relative + "/" + name, actual, "valid-json-error-checked-root-key-preservation-v1"})
	}
	return facts, receipts, issues
}

func guardedErrorFlow(call *ast.CallExpr, parents map[ast.Node]ast.Node, syntax func(ast.Node) string) bool {
	statement, ok := parents[call].(*ast.ExprStmt)
	if !ok {
		return false
	}
	body, ok := parents[statement].(*ast.BlockStmt)
	if !ok {
		return false
	}
	guard, ok := parents[body].(*ast.IfStmt)
	if !ok || guard.Body != body || guard.Else != nil || syntax(guard.Cond) != "err != nil" {
		return false
	}
	init, ok := guard.Init.(*ast.AssignStmt)
	if !ok || init.Tok != token.DEFINE || len(init.Rhs) != 1 {
		return false
	}
	origin, ok := init.Rhs[0].(*ast.CallExpr)
	if !ok {
		return false
	}
	originName := syntax(origin.Fun)
	if originName != "cmd.Execute" && originName != "readConfiguration" && originName != "run" {
		return false
	}
	var bound *ast.Ident
	for _, value := range init.Lhs {
		if id, ok := value.(*ast.Ident); ok && id.Name == "err" {
			bound = id
		}
	}
	if bound == nil || bound.Obj == nil || len(body.List) != 2 || body.List[0] != statement || syntax(body.List[1]) != "os.Exit(1)" {
		return false
	}
	valid := true
	ast.Inspect(call.Args[1], func(node ast.Node) bool {
		if id, ok := node.(*ast.Ident); ok && id.Name == "err" && id.Obj != bound.Obj {
			valid = false
		}
		return true
	})
	return valid
}

// Documentation-tool exemption receipts are native declaration syntax, never
// source execution. The consumer must match reviewed parser-purpose recipes.
func documentationCustody(source string) {
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, source, nil, 0)
	if err != nil {
		os.Stderr.WriteString("API_DOCUMENTATION_GO_CUSTODY_UNQUALIFIED: " + source + ": " + err.Error() + "\n")
		os.Exit(3)
	}
	operations := []map[string]string{{"kind": "package", "symbol": file.Name.Name, "syntax": "package " + file.Name.Name}}
	for _, node := range file.Decls {
		kind, symbol := "", ""
		switch value := node.(type) {
		case *ast.FuncDecl:
			kind, symbol = "function", value.Name.Name
		case *ast.GenDecl:
			kind, symbol = value.Tok.String(), ""
			for _, spec := range value.Specs {
				switch item := spec.(type) {
				case *ast.ImportSpec:
					if item.Name != nil {
						symbol += item.Name.Name + ":"
					}
					symbol += item.Path.Value + ";"
				case *ast.TypeSpec:
					symbol += item.Name.Name + ";"
				case *ast.ValueSpec:
					for _, name := range item.Names {
						symbol += name.Name + ";"
					}
				default:
					os.Stderr.WriteString("API_DOCUMENTATION_GO_CUSTODY_UNQUALIFIED: " + source + ": unsupported declaration\n")
					os.Exit(3)
				}
			}
		default:
			os.Stderr.WriteString("API_DOCUMENTATION_GO_CUSTODY_UNQUALIFIED: " + source + ": unsupported executable declaration\n")
			os.Exit(3)
		}
		var syntax bytes.Buffer
		format.Node(&syntax, fset, node)
		operations = append(operations, map[string]string{"kind": kind, "symbol": symbol, "syntax": syntax.String()})
	}
	json.NewEncoder(os.Stdout).Encode(map[string]interface{}{"protocol": "docs-go-custody-v1", "operations": operations})
}
