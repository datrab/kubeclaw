// Documentation-only AST qualification; no producer code is executed.
package main

import (
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"strconv"
	"strings"
)

type input struct {
	Path      string `json:"path"`
	Qualified bool   `json:"qualified"`
}
type output struct {
	Path string `json:"path"`
	Line int    `json:"line"`
	Role string `json:"role"`
}

func main() {
	var inputs []input
	if json.NewDecoder(os.Stdin).Decode(&inputs) != nil {
		os.Exit(2)
	}
	out := []output{}
	for _, in := range inputs {
		if in.Qualified {
			continue
		}
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
				if sel.Sel.Name == "Do" && httpClient(sel.X) {
					return true
				}

				if owner, ok := sel.X.(*ast.Ident); ok && owner.Name == jsonName && (sel.Sel.Name == "Marshal" || sel.Sel.Name == "MarshalIndent" || sel.Sel.Name == "NewEncoder") {
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
				out = append(out, output{in.Path, fset.Position(n.Pos()).Line, "unknown"})
			}
			return true
		})
		ast.Inspect(file, func(n ast.Node) bool {
			// Unsupported writer containers/callbacks and mutable function aliases fail closed.
			if composite, ok := n.(*ast.CompositeLit); ok {
				ast.Inspect(composite, func(child ast.Node) bool {
					if expr, ok := child.(ast.Expr); ok && writer(expr) {
						out = append(out, output{in.Path, fset.Position(child.Pos()).Line, "unknown"})
						return false
					}
					return true
				})
			}
			if assignment, ok := n.(*ast.AssignStmt); ok {
				for i, rhs := range assignment.Rhs {
					if writer(rhs) && i < len(assignment.Lhs) {
						if _, direct := assignment.Lhs[i].(*ast.Ident); !direct {
							out = append(out, output{in.Path, fset.Position(assignment.Pos()).Line, "unknown"})
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
					out = append(out, output{in.Path, fset.Position(call.Pos()).Line, "unknown"})
				}
			}
			if writer(call.Fun) && resolve(call.Fun, map[string]bool{}) == call.Fun {
				if _, alias := call.Fun.(*ast.Ident); alias && call.Fun.(*ast.Ident).Obj != nil {
					out = append(out, output{in.Path, fset.Position(call.Pos()).Line, "unknown"})
					return true
				}
			}
			fn := resolve(call.Fun, map[string]bool{})
			if id, ok := fn.(*ast.Ident); ok && jsonName == "." && (id.Name == "Marshal" || id.Name == "MarshalIndent" || id.Name == "NewEncoder") {
				out = append(out, output{in.Path, fset.Position(call.Pos()).Line, "unknown"})
				return true
			}
			if method, ok := fn.(*ast.SelectorExpr); ok {
				if owner, ok := method.X.(*ast.Ident); ok && owner.Name == jsonName && (method.Sel.Name == "Marshal" || method.Sel.Name == "MarshalIndent" || method.Sel.Name == "NewEncoder") {
					out = append(out, output{in.Path, fset.Position(call.Pos()).Line, "unknown"})
					return true
				}
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
			if sel.Sel.Name == "Marshal" || sel.Sel.Name == "MarshalIndent" || sel.Sel.Name == "NewEncoder" || sel.Sel.Name == "Encode" || sel.Sel.Name == "Do" && httpClient(sel.X) {
				out = append(out, output{in.Path, fset.Position(call.Pos()).Line, "unknown"})
				return true
			}
			if owner, ok := sel.X.(*ast.Ident); ok && ((owner.Name == ioName && (sel.Sel.Name == "Copy" || sel.Sel.Name == "CopyN" || sel.Sel.Name == "CopyBuffer")) || (owner.Name == httpName && sel.Sel.Name == "Post")) {
				out = append(out, output{in.Path, fset.Position(call.Pos()).Line, "unknown"})
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
				if unknown || strings.Contains(staticText, "apiVersion") || strings.Contains(staticText, "%") {
					out = append(out, output{in.Path, fset.Position(call.Pos()).Line, "unknown"})
					return true
				}
			}
			role := "unknown"
			if len(call.Args) > arg {
				value := resolve(call.Args[arg], map[string]bool{})
				if conversion, ok := value.(*ast.CallExpr); ok && len(conversion.Args) == 1 {
					value = conversion.Args[0]
				}
				if lit, ok := value.(*ast.BasicLit); ok && lit.Kind == token.STRING {
					text, _ := strconv.Unquote(lit.Value)
					trim := strings.TrimSpace(text)
					if trim != "" && !strings.HasPrefix(trim, "%") && !strings.HasPrefix(trim, "{") && !strings.HasPrefix(trim, "[") && !strings.HasPrefix(trim, "---") && !strings.Contains(trim, "apiVersion:") {
						role = "non-api"
					}
				}
			}
			out = append(out, output{in.Path, fset.Position(call.Pos()).Line, role})
			return true
		})
	}
	json.NewEncoder(os.Stdout).Encode(out)
}
