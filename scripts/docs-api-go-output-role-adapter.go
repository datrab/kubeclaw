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
	"sort"
	"strconv"
	"strings"
)

type input struct {
	Path string `json:"path"`
}
type output struct {
	Path         string          `json:"path"`
	Line         int             `json:"line"`
	Role         string          `json:"role"`
	Expression   string          `json:"expression"`
	Function     string          `json:"function"`
	Value        string          `json:"value,omitempty"`
	Operation    string          `json:"operation,omitempty"`
	Dependencies []operationFact `json:"dependencies"`
}
type operationFact struct {
	Path   string `json:"path"`
	Symbol string `json:"symbol"`
	SHA256 string `json:"sha256"`
}
type declaration struct {
	path   string
	symbol string
	node   ast.Node
	fset   *token.FileSet
}

func main() {
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
		for len(pending) > 0 {
			decl := pending[len(pending)-1]
			pending = pending[:len(pending)-1]
			key := decl.path + ":" + decl.symbol
			if seen[key] {
				continue
			}
			seen[key] = true
			var buf bytes.Buffer
			format.Node(&buf, decl.fset, decl.node)
			sum := sha256.Sum256(buf.Bytes())
			facts = append(facts, operationFact{decl.path, decl.symbol, hex.EncodeToString(sum[:])})
			ast.Inspect(decl.node, func(node ast.Node) bool {
				if id, ok := node.(*ast.Ident); ok {
					pending = append(pending, pkg[id.Name]...)
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
	for _, in := range inputs {
		fset := token.NewFileSet()
		file, err := parser.ParseFile(fset, in.Path, nil, 0)
		if err != nil {
			os.Exit(3)
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
			return output{in.Path, fset.Position(n.Pos()).Line, role, syntax(n), function, value, operation, factsFor(in.Path, function)}
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
				if !seen[key] && bindings[id.Obj] != nil && writes[id.Obj] == 1 && !escapes[id.Obj] {
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
			if !ok || id.Obj == nil || resolvingParameters[id.Obj] {
				return value
			}
			field, ok := id.Obj.Decl.(*ast.Field)
			if !ok {
				return value
			}
			var owner *ast.FuncDecl
			for p := ast.Node(field); p != nil; p = parents[p] {
				if fn, ok := p.(*ast.FuncDecl); ok {
					owner = fn
					break
				}
			}
			if owner == nil || ast.IsExported(owner.Name.Name) {
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
			ast.Inspect(file, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok {
					return true
				}
				fn, ok := call.Fun.(*ast.Ident)
				if !ok || fn.Obj != owner.Name.Obj {
					return true
				}
				if index >= len(call.Args) {
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
			if selected != nil && !ambiguous {
				return selected
			}
			return value
		}
		fmtName, osName, jsonName, ioName, httpName := "fmt", "os", "json", "io", "http"
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
		writer := func(e ast.Expr) bool {
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
				if conversion, ok := value.(*ast.CallExpr); ok && len(conversion.Args) == 1 {
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
