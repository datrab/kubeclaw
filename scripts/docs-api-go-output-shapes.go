// Documentation-only AST discovery. This program does not execute producers.
package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"go/ast"
	"go/format"
	"go/parser"
	"go/token"
	"os"
	"sort"
	"strconv"
	"strings"
)

func bindingKey(id *ast.Ident) string {
	if id.Obj != nil {
		return fmt.Sprintf("%s:%d", id.Name, id.Obj.Pos())
	}
	return id.Name
}

type factoryDependency struct {
	Path         string `json:"path"`
	SourceDigest string `json:"sourceDigest"`
}
type conditionSelection struct {
	Expression string `json:"expression"`
	Result     bool   `json:"result"`
}
type output struct {
	Value               any                  `json:"value"`
	Line                int                  `json:"line"`
	Position            int                  `json:"position"`
	InferredIdentity    bool                 `json:"inferredIdentity,omitempty"`
	RequestMethod       string               `json:"requestMethod,omitempty"`
	RequestPath         any                  `json:"requestPath,omitempty"`
	FactoryDependencies []factoryDependency  `json:"factoryDependencies,omitempty"`
	FactoryExpression   string               `json:"factoryExpression,omitempty"`
	FactoryLine         int                  `json:"factoryLine,omitempty"`
	Conditions          []conditionSelection `json:"conditions,omitempty"`
	RequestAlternatives []any                `json:"requestAlternatives,omitempty"`
}

func main() {
	var files []string
	if err := json.NewDecoder(os.Stdin).Decode(&files); err != nil {
		panic(err)
	}
	result := map[string][]output{}
	// Follow actual map parameters through local forwarding helpers. Emission
	// occurs when the caller invokes the helper, before later caller writes.
	forwarders := map[string]map[string]int{}
	packageFiles := map[string][]*ast.File{}
	packageDependencies := map[string][]factoryDependency{}
	for _, name := range files {
		f, err := parser.ParseFile(token.NewFileSet(), name, nil, 0)
		if err != nil {
			panic(err)
		}
		dir := name[:strings.LastIndex(name, "/")]
		packageFiles[dir] = append(packageFiles[dir], f)
		content, err := os.ReadFile(name)
		if err != nil {
			panic(err)
		}
		packageDependencies[dir] = append(packageDependencies[dir], factoryDependency{Path: name, SourceDigest: fmt.Sprintf("%x", sha256.Sum256(content))})
	}
	callName := func(e ast.Expr) string {
		switch v := e.(type) {
		case *ast.Ident:
			return v.Name
		case *ast.SelectorExpr:
			return v.Sel.Name
		}
		return ""
	}
	for dir, asts := range packageFiles {
		known := map[string]int{"kube": 3, "requestPayload": 0}
		forwarders[dir] = known
		for changed := true; changed; {
			changed = false
			for _, f := range asts {
				for _, decl := range f.Decls {
					fn, ok := decl.(*ast.FuncDecl)
					if !ok || fn.Body == nil {
						continue
					}
					params := map[*ast.Object]int{}
					index := 0
					for _, field := range fn.Type.Params.List {
						for _, id := range field.Names {
							params[id.Obj] = index
							index++
						}
					}
					ast.Inspect(fn.Body, func(n ast.Node) bool {
						if call, ok := n.(*ast.CallExpr); ok {
							if argIndex, forward := known[callName(call.Fun)]; forward && argIndex < len(call.Args) {
								if id, ok := call.Args[argIndex].(*ast.Ident); ok {
									if callerIndex, param := params[id.Obj]; param {
										existing, present := known[fn.Name.Name]
										if present && existing != callerIndex {
											panic("API_PRODUCT_GO_HELPER_PAYLOAD_UNQUALIFIED")
										}
										if !present {
											known[fn.Name.Name] = callerIndex
											changed = true
										}
									}
								}
							}
						}
						return true
					})
				}
			}
		}
	}
	for _, name := range files {
		fset := token.NewFileSet()
		file, err := parser.ParseFile(fset, name, nil, parser.AllErrors)
		if err != nil {
			panic(err)
		}
		typedAPIPackages := map[string]string{}
		for _, imp := range file.Imports {
			packagePath, _ := strconv.Unquote(imp.Path.Value)
			if strings.HasPrefix(packagePath, "k8s.io/api/") || strings.HasPrefix(packagePath, "k8s.io/apiextensions-apiserver/pkg/apis/") {
				alias := packagePath[strings.LastIndex(packagePath, "/")+1:]
				if imp.Name != nil {
					alias = imp.Name.Name
				}
				typedAPIPackages[alias] = packagePath
			}
		}
		literalBindings := map[*ast.CompositeLit]*ast.Ident{}
		bindings := map[string][]ast.Expr{}
		indexed := map[string][]*ast.AssignStmt{}
		functions := map[string][]ast.Expr{}
		ast.Inspect(file, func(n ast.Node) bool {
			if a, ok := n.(*ast.AssignStmt); ok {
				for i, lhs := range a.Lhs {
					if index, ok := lhs.(*ast.IndexExpr); ok && i < len(a.Rhs) {
						if id, ok := index.X.(*ast.Ident); ok {
							indexed[bindingKey(id)] = append(indexed[bindingKey(id)], a)
						}
					}
					if id, ok := lhs.(*ast.Ident); ok && i < len(a.Rhs) {
						bindings[bindingKey(id)] = append(bindings[bindingKey(id)], a.Rhs[i])
						if literal, ok := a.Rhs[i].(*ast.CompositeLit); ok {
							literalBindings[literal] = id
						}
					}
				}
			}
			if d, ok := n.(*ast.ValueSpec); ok {
				for i, id := range d.Names {
					if i < len(d.Values) {
						bindings[bindingKey(id)] = append(bindings[bindingKey(id)], d.Values[i])
						if literal, ok := d.Values[i].(*ast.CompositeLit); ok {
							literalBindings[literal] = id
						}
					}
				}
			}
			if fn, ok := n.(*ast.FuncDecl); ok && fn.Body != nil {
				ast.Inspect(fn.Body, func(child ast.Node) bool {
					if ret, ok := child.(*ast.ReturnStmt); ok {
						for _, expr := range ret.Results {
							if _, ok := expr.(*ast.CompositeLit); ok {
								functions[fn.Name.Name] = append(functions[fn.Name.Name], expr)
							}
						}
					}
					return true
				})
			}
			return true
		})
		// Literal map shapes cannot absorb effects through projected aliases or
		// nested writes. Refuse those source semantics instead of publishing the
		// unchanged origin. Direct root writes are evaluated at each submission.
		checkLiteralEffects := func(id *ast.Ident) {
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
			aliases := map[string]bool{bindingKey(id): true}
			var references func(ast.Expr) bool
			references = func(e ast.Expr) bool {
				found := false
				ast.Inspect(e, func(n ast.Node) bool {
					if ref, ok := n.(*ast.Ident); ok && aliases[bindingKey(ref)] {
						found = true
					}
					return true
				})
				return found
			}
			for changed := true; changed; {
				changed = false
				ast.Inspect(file, func(n ast.Node) bool {
					if a, ok := n.(*ast.AssignStmt); ok {
						for i, left := range a.Lhs {
							if dest, ok := left.(*ast.Ident); ok && i < len(a.Rhs) && references(a.Rhs[i]) && !aliases[bindingKey(dest)] {
								aliases[bindingKey(dest)] = true
								changed = true
							}
						}
					}
					return true
				})
			}
			ast.Inspect(file, func(n ast.Node) bool {
				if a, ok := n.(*ast.AssignStmt); ok {
					for _, left := range a.Lhs {
						if index, ok := left.(*ast.IndexExpr); ok && references(index.X) {
							base, direct := index.X.(*ast.Ident)
							if direct && bindingKey(base) == bindingKey(id) {
								for parent := parents[a]; parent != nil; parent = parents[parent] {
									switch parent.(type) {
									case *ast.IfStmt, *ast.ForStmt, *ast.RangeStmt, *ast.SwitchStmt, *ast.TypeSwitchStmt, *ast.SelectStmt:
										panic(fmt.Sprintf("API_PRODUCT_GO_CONDITIONAL_MAP_EFFECT_UNQUALIFIED: %s:%d", name, fset.Position(a.Pos()).Line))
									}
								}
							}
							if !direct || bindingKey(base) != bindingKey(id) {
								panic(fmt.Sprintf("API_PRODUCT_GO_MAP_EFFECT_UNQUALIFIED: %s:%d", name, fset.Position(a.Pos()).Line))
							}
						}
					}
				}
				return true
			})
		}
		// Package-local factories can be declared in a different file from
		// their submission. Their constructors remain source-bound AST values.
		for _, pkgFile := range packageFiles[name[:strings.LastIndex(name, "/")]] {
			for _, decl := range pkgFile.Decls {
				if fn, ok := decl.(*ast.FuncDecl); ok && fn.Body != nil {
					ast.Inspect(fn.Body, func(n ast.Node) bool {
						if ret, ok := n.(*ast.ReturnStmt); ok {
							for _, value := range ret.Results {
								if _, literal := value.(*ast.CompositeLit); literal {
									functions[fn.Name.Name] = append(functions[fn.Name.Name], value)
								}
							}
						}
						return true
					})
				}
			}
		}
		conditionParents := map[ast.Node]ast.Node{}
		conditionStack := []ast.Node{}
		ast.Inspect(file, func(n ast.Node) bool {
			if n == nil {
				conditionStack = conditionStack[:len(conditionStack)-1]
				return true
			}
			if len(conditionStack) > 0 {
				conditionParents[n] = conditionStack[len(conditionStack)-1]
			}
			conditionStack = append(conditionStack, n)
			return true
		})
		enclosingConditions := func(n ast.Node) map[*ast.IfStmt]bool {
			out := map[*ast.IfStmt]bool{}
			for parent := conditionParents[n]; parent != nil; n, parent = parent, conditionParents[parent] {
				if branch, ok := parent.(*ast.IfStmt); ok {
					out[branch] = n == branch.Body
				}
			}
			return out
		}
		activeConditions := map[*ast.IfStmt]bool{}
		var eval func(ast.Expr, map[string]bool) any
		eval = func(expr ast.Expr, seen map[string]bool) any {
			if expr == nil {
				return nil
			}
			switch x := expr.(type) {
			case *ast.BasicLit:
				if x.Kind == token.STRING {
					s, e := strconv.Unquote(x.Value)
					if e != nil {
						panic(e)
					}
					return s
				}
				if x.Kind == token.INT {
					s, e := strconv.ParseInt(x.Value, 0, 64)
					if e == nil {
						return s
					}
				}
			case *ast.CompositeLit:
				_, isMap := x.Type.(*ast.MapType)
				if isMap {
					v := map[string]any{}
					for _, element := range x.Elts {
						pair, ok := element.(*ast.KeyValueExpr)
						if !ok {
							panic("unexpected map element")
						}
						key := eval(pair.Key, seen)
						if text, ok := key.(string); ok {
							v[text] = eval(pair.Value, seen)
						} else {
							v["*"] = eval(pair.Value, seen)
						}
					}
					return v
				}
				values := []any{}
				for _, item := range x.Elts {
					if pair, ok := item.(*ast.KeyValueExpr); ok {
						values = append(values, eval(pair.Value, seen))
					} else {
						values = append(values, eval(item.(ast.Expr), seen))
					}
				}
				return values
			case *ast.Ident:
				if x.Name == "true" {
					return true
				}
				if x.Name == "false" {
					return false
				}
				if x.Name == "nil" {
					return nil
				}
				key := bindingKey(x)
				seenKey := key + ":" + strconv.Itoa(int(x.Pos()))
				if !seen[seenKey] {
					choices := bindings[key]
					var chosen ast.Expr
					for _, choice := range choices {
						permitted := true
						for branch, taken := range enclosingConditions(choice) {
							if selected, known := activeConditions[branch]; known && selected != taken {
								permitted = false
							}
						}
						if choice.End() < x.Pos() && permitted {
							chosen = choice
						}
					}
					if chosen == nil && len(choices) > 0 {
						chosen = choices[0]
					}
					if chosen != nil {
						// A conditional scalar assignment is not an unconditional
						// value at a later publication. Preserve its source binding
						// unless the selected branch or use site determines it.
						if _, scalar := chosen.(*ast.BasicLit); scalar {
							useConditions := enclosingConditions(x)
							for branch, taken := range enclosingConditions(chosen) {
								_, selected := activeConditions[branch]
								useTaken, dominated := useConditions[branch]
								if !selected && (!dominated || useTaken != taken) {
									return map[string]any{"__docsDynamicExpression": x.Name}
								}
							}
						}
						copy := map[string]bool{}
						for k, v := range seen {
							copy[k] = v
						}
						copy[seenKey] = true
						value := eval(chosen, copy)
						if object, ok := value.(map[string]any); ok {
							for _, assignment := range indexed[key] {
								if assignment.Pos() > chosen.Pos() && assignment.End() < x.Pos() {
									for i, left := range assignment.Lhs {
										if index, ok := left.(*ast.IndexExpr); ok && i < len(assignment.Rhs) {
											if name, ok := eval(index.Index, copy).(string); ok {
												object[name] = eval(assignment.Rhs[i], copy)
											}
										}
									}
								}
							}
						}
						return value
					}
				}
			case *ast.CallExpr:
				name := ""
				if id, ok := x.Fun.(*ast.Ident); ok {
					name = id.Name
				}
				if name == "append" && len(x.Args) > 0 {
					values := []any{}
					baseValue := eval(x.Args[0], seen)
					base, baseKnown := baseValue.([]any)
					if !baseKnown && baseValue != nil {
						items := []any{}
						for i, arg := range x.Args[1:] {
							value := eval(arg, seen)
							if x.Ellipsis.IsValid() && i == len(x.Args)-2 {
								spread, known := value.([]any)
								if !known {
									panic("API_PRODUCT_GO_DYNAMIC_APPEND_SPREAD_UNQUALIFIED")
								}
								items = append(items, spread...)
							} else {
								items = append(items, value)
							}
						}
						var source bytes.Buffer
						format.Node(&source, fset, x)
						return map[string]any{"__docsDynamicExpression": source.String(), "__docsSupportedSequenceAppend": map[string]any{"items": items, "spread": false}}
					}
					values = append(values, base...)
					for i, arg := range x.Args[1:] {
						value := eval(arg, seen)
						if x.Ellipsis.IsValid() && i == len(x.Args)-2 {
							spread, known := value.([]any)
							if !known {
								// An empty prefix plus a single inherited spread is an
								// exact symbolic copy. A nonempty unknown spread has
								// unrepresentable relative item effects and fails closed.
								if len(values) != 0 {
									panic("API_PRODUCT_GO_DYNAMIC_APPEND_SPREAD_UNQUALIFIED")
								}
								var source bytes.Buffer
								format.Node(&source, fset, x)
								return map[string]any{"__docsDynamicExpression": source.String()}
							}
							values = append(values, spread...)
						} else {
							values = append(values, value)
						}
					}
					return values
				}
				if sel, ok := x.Fun.(*ast.SelectorExpr); ok {
					name = sel.Sel.Name
				}
				if !seen[name] && len(functions[name]) > 0 {
					copy := map[string]bool{}
					for k, v := range seen {
						copy[k] = v
					}
					copy[name] = true
					merged := map[string]any{}
					for _, choice := range functions[name] {
						if m, ok := eval(choice, copy).(map[string]any); ok {
							for k, v := range m {
								merged[k] = v
							}
						}
					}
					return merged
				}
			case *ast.ParenExpr:
				return eval(x.X, seen)
			case *ast.UnaryExpr:
				return eval(x.X, seen)
			}
			var source bytes.Buffer
			if err := format.Node(&source, fset, expr); err != nil {
				panic(err)
			}
			return map[string]any{"__docsDynamicExpression": source.String()}
		}
		// Keep a constructor/create alternative, then discover each changed
		// factory result at its actual submission point. Live scalar values stay
		// symbolic expressions; this does not fabricate a fetched resource.
		type projection struct {
			root *ast.Object
			path []string
		}
		aliases := map[*ast.Object]projection{}
		var project func(ast.Expr) (projection, bool)
		project = func(e ast.Expr) (projection, bool) {
			switch v := e.(type) {
			case *ast.Ident:
				if alias, ok := aliases[v.Obj]; ok {
					return alias, true
				}
				return projection{root: v.Obj}, v.Obj != nil
			case *ast.ParenExpr:
				return project(v.X)
			case *ast.TypeAssertExpr:
				return project(v.X)
			case *ast.IndexExpr:
				base, ok := project(v.X)
				if !ok {
					return base, false
				}
				key, ok := eval(v.Index, map[string]bool{}).(string)
				if !ok {
					return base, false
				}
				base.path = append(append([]string{}, base.path...), key)
				return base, true
			case *ast.CallExpr:
				if callName(v.Fun) == "objectValue" && len(v.Args) == 1 {
					return project(v.Args[0])
				}
			}
			return projection{}, false
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
		owner := func(n ast.Node) *ast.FuncDecl {
			for n != nil {
				if fn, ok := n.(*ast.FuncDecl); ok {
					return fn
				}
				n = parents[n]
			}
			return nil
		}
		// Source-ordered alias construction avoids borrowing aliases created
		// after a publication. Opaque projection calls are explicit gaps below.
		ast.Inspect(file, func(n ast.Node) bool {
			if a, ok := n.(*ast.AssignStmt); ok {
				for i, left := range a.Lhs {
					if id, ok := left.(*ast.Ident); ok && i < len(a.Rhs) {
						if value, ok := project(a.Rhs[i]); ok && len(value.path) > 0 {
							aliases[id.Obj] = value
						}
					}
				}
			}
			return true
		})
		ast.Inspect(file, func(n ast.Node) bool {
			origin, ok := n.(*ast.AssignStmt)
			if !ok {
				return true
			}
			for i, left := range origin.Lhs {
				id, ok := left.(*ast.Ident)
				if !ok || i >= len(origin.Rhs) {
					continue
				}
				factory, ok := origin.Rhs[i].(*ast.CallExpr)
				if !ok {
					continue
				}
				// append returns a sequence, never an API-object factory.
				if callName(factory.Fun) == "append" {
					continue
				}
				base, ok := eval(factory, map[string]bool{}).(map[string]any)
				if !ok {
					continue
				}
				if _, ok := base["apiVersion"].(string); !ok {
					continue
				}
				if _, ok := base["kind"].(string); !ok {
					continue
				}
				ast.Inspect(owner(origin).Body, func(child ast.Node) bool {
					submission, ok := child.(*ast.CallExpr)
					if !ok || submission.Pos() < origin.End() {
						return true
					}
					known := forwarders[name[:strings.LastIndex(name, "/")]]
					bodyIndex, forward := known[callName(submission.Fun)]
					if !forward || bodyIndex >= len(submission.Args) {
						return true
					}
					body, ok := project(submission.Args[bodyIndex])
					if !ok || body.root != id.Obj || len(body.path) != 0 {
						return true
					}
					// Round-trip only the AST-derived shape, not product bytes.
					encoded, _ := json.Marshal(base)
					value := map[string]any{}
					json.Unmarshal(encoded, &value)
					changed := false
					ast.Inspect(owner(origin).Body, func(effect ast.Node) bool {
						if effect == nil || effect.Pos() < origin.End() || effect.End() >= submission.Pos() {
							return true
						}
						assignment, ok := effect.(*ast.AssignStmt)
						if !ok {
							return true
						}
						for _, left := range assignment.Lhs {
							if target, ok := left.(*ast.Ident); ok && target.Obj == id.Obj {
								panic(fmt.Sprintf("API_PRODUCT_GO_FACTORY_REASSIGNMENT_UNQUALIFIED: %s:%d", name, fset.Position(assignment.Pos()).Line))
							}
						}

						for j, target := range assignment.Lhs {
							selected, qual := project(target)
							if !qual {
								found := false
								ast.Inspect(target, func(n ast.Node) bool {
									if ref, ok := n.(*ast.Ident); ok {
										root, ok := project(ref)
										if ok && root.root == id.Obj {
											found = true
										}
									}
									return true
								})
								if found {
									panic(fmt.Sprintf("API_PRODUCT_GO_FACTORY_PROJECTION_UNQUALIFIED: %s:%d", name, fset.Position(assignment.Pos()).Line))
								}
							}
							if !qual || selected.root != id.Obj || len(selected.path) == 0 {
								continue
							}
							if j >= len(assignment.Rhs) {
								panic("API_PRODUCT_GO_FACTORY_EFFECT_UNQUALIFIED")
							}
							for parent := parents[assignment]; parent != nil && parent != owner(origin); parent = parents[parent] {
								switch parent.(type) {
								case *ast.IfStmt, *ast.ForStmt, *ast.RangeStmt, *ast.SwitchStmt, *ast.TypeSwitchStmt, *ast.SelectStmt:
									panic(fmt.Sprintf("API_PRODUCT_GO_CONDITIONAL_MAP_EFFECT_UNQUALIFIED: %s:%d", name, fset.Position(assignment.Pos()).Line))
								}
							}
							selectedMap := value
							for _, key := range selected.path[:len(selected.path)-1] {
								next, ok := selectedMap[key].(map[string]any)
								if !ok || next["__docsDynamicExpression"] != nil {
									panic(fmt.Sprintf("API_PRODUCT_GO_FACTORY_PROJECTION_UNQUALIFIED: %s:%d", name, fset.Position(assignment.Pos()).Line))
								}
								selectedMap = next
							}
							selectedMap[selected.path[len(selected.path)-1]] = eval(assignment.Rhs[j], map[string]bool{})
							changed = true
						}
						return true
					})
					if changed {
						method := ""
						requestPath := any(nil)
						if callName(submission.Fun) == "kube" && len(submission.Args) == 6 {
							if sel, ok := submission.Args[1].(*ast.SelectorExpr); ok {
								method = sel.Sel.Name
							} else if text, ok := eval(submission.Args[1], map[string]bool{}).(string); ok {
								method = text
							}
							requestPath = eval(submission.Args[2], map[string]bool{})
						}
						if method == "" {
							panic(fmt.Sprintf("API_PRODUCT_GO_FACTORY_SUBMISSION_UNQUALIFIED: %s:%d", name, fset.Position(submission.Pos()).Line))
						}
						result[name] = append(result[name], output{Value: value, Line: fset.Position(submission.Pos()).Line, Position: int(submission.Pos()), RequestMethod: method, RequestPath: requestPath, FactoryDependencies: packageDependencies[name[:strings.LastIndex(name, "/")]], FactoryExpression: func() string { var b bytes.Buffer; format.Node(&b, fset, factory); return b.String() }(), FactoryLine: fset.Position(origin.Pos()).Line})
					}
					return true
				})
			}
			return true
		})
		literalConditionVariants := func(literal *ast.CompositeLit) []map[*ast.IfStmt]bool {
			referenced := map[string]bool{}
			var visit func(ast.Expr)
			visit = func(e ast.Expr) {
				ast.Inspect(e, func(n ast.Node) bool {
					if id, ok := n.(*ast.Ident); ok && id.Obj != nil {
						key := bindingKey(id)
						if !referenced[key] {
							referenced[key] = true
							for _, rhs := range bindings[key] {
								visit(rhs)
							}
						}
					}
					return true
				})
			}
			visit(literal)
			branches := []*ast.IfStmt{}
			dominant := enclosingConditions(literal)
			seen := map[*ast.IfStmt]bool{}
			for key := range referenced {
				for _, rhs := range bindings[key] {
					for branch := range enclosingConditions(rhs) {
						if _, required := dominant[branch]; required {
							continue
						}
						if !seen[branch] {
							seen[branch] = true
							branches = append(branches, branch)
						}
					}
				}
			}
			sort.Slice(branches, func(i, j int) bool { return branches[i].Pos() < branches[j].Pos() })
			if len(branches) > 5 {
				panic(fmt.Sprintf("API_PRODUCT_GO_CONSTRUCTOR_CONDITIONS_UNQUALIFIED: %s:%d", name, fset.Position(literal.Pos()).Line))
			}
			variants := []map[*ast.IfStmt]bool{{}}
			for _, branch := range branches {
				next := []map[*ast.IfStmt]bool{}
				for _, variant := range variants {
					for _, value := range []bool{false, true} {
						copy := map[*ast.IfStmt]bool{}
						for key, v := range variant {
							copy[key] = v
						}
						copy[branch] = value
						next = append(next, copy)
					}
				}
				variants = next
			}
			return variants
		}
		// The original Secret-copy path preserves a finite served Secret body,
		// apart from structurally inspected metadata deletes and namespace
		// rewrites. Record inherited shape, never invented live field values.
		type inheritedTransform struct {
			removed     []string
			rewrites    []map[string]any
			declaration *ast.FuncDecl
		}
		transforms := map[string]inheritedTransform{}
		for _, decl := range file.Decls {
			fn, ok := decl.(*ast.FuncDecl)
			if !ok || fn.Body == nil || fn.Type.Params == nil {
				continue
			}
			var params []*ast.Ident
			for _, field := range fn.Type.Params.List {
				params = append(params, field.Names...)
			}
			if len(params) < 2 {
				continue
			}
			var copied, meta *ast.Object
			removed := []string{}
			rewrites := []map[string]any{}
			candidate := false
			// A map-to-map transformer remains selected when its copying step
			// changes. Unsupported transformations must not disappear after
			// a refreshed receipt. Only actual downstream submissions qualify.
			if fn.Type.Results != nil && len(fn.Type.Results.List) == 1 {
				_, mapResult := fn.Type.Results.List[0].Type.(*ast.MapType)
				_, mapInput := fn.Type.Params.List[0].Type.(*ast.MapType)
				candidate = mapResult && mapInput
			}
			qualified := true
			returned := false
			deleteCall := func(e ast.Expr, key ast.Expr) bool {
				call, ok := e.(*ast.CallExpr)
				if !ok || callName(call.Fun) != "delete" || len(call.Args) != 2 {
					return false
				}
				id, ok := call.Args[0].(*ast.Ident)
				return ok && id.Obj == meta && call.Args[1] == key
			}
			for _, statement := range fn.Body.List {
				switch stmt := statement.(type) {
				case *ast.AssignStmt:
					if len(stmt.Lhs) != 1 || len(stmt.Rhs) != 1 {
						qualified = false
						continue
					}
					if id, ok := stmt.Lhs[0].(*ast.Ident); ok {
						call, ok := stmt.Rhs[0].(*ast.CallExpr)
						if !ok {
							qualified = false
							continue
						}
						if callName(call.Fun) == "deepCopyMap" && len(call.Args) == 1 {
							argument, ok := call.Args[0].(*ast.Ident)
							if ok && argument.Obj == params[0].Obj {
								copied = id.Obj
								candidate = true
								continue
							}
						}
						if callName(call.Fun) == "objectValue" && len(call.Args) == 1 {
							index, ok := call.Args[0].(*ast.IndexExpr)
							if ok {
								base, ok := index.X.(*ast.Ident)
								key, keyOK := index.Index.(*ast.BasicLit)
								if ok && base.Obj == copied && keyOK {
									text, _ := strconv.Unquote(key.Value)
									if text == "metadata" {
										meta = id.Obj
										continue
									}
								}
							}
						}
						qualified = false
						continue
					}
					index, ok := stmt.Lhs[0].(*ast.IndexExpr)
					if !ok {
						qualified = false
						continue
					}
					base, ok := index.X.(*ast.Ident)
					key, keyOK := index.Index.(*ast.BasicLit)
					if !ok || !keyOK {
						qualified = false
						continue
					}
					text, _ := strconv.Unquote(key.Value)
					if base.Obj == copied && text == "metadata" {
						value, ok := stmt.Rhs[0].(*ast.Ident)
						if ok && value.Obj == meta {
							continue
						}
					}
					if base.Obj != meta {
						qualified = false
						continue
					}
					var parameter = -1
					for i, param := range params {
						if value, ok := stmt.Rhs[0].(*ast.Ident); ok && value.Obj == param.Obj {
							parameter = i
						}
					}
					if parameter < 0 {
						if _, literal := stmt.Rhs[0].(*ast.BasicLit); !literal {
							qualified = false
							continue
						}
					}
					rewrites = append(rewrites, map[string]any{"fieldPath": "$.metadata." + text, "parameter": parameter, "expression": stmt.Rhs[0]})
				case *ast.RangeStmt:
					values, ok := stmt.X.(*ast.CompositeLit)
					key, hasKey := stmt.Value.(*ast.Ident)
					if !ok || !hasKey || len(stmt.Body.List) != 1 {
						qualified = false
						continue
					}
					expr, ok := stmt.Body.List[0].(*ast.ExprStmt)
					if !ok {
						qualified = false
						continue
					}
					call, ok := expr.X.(*ast.CallExpr)
					if !ok || len(call.Args) != 2 {
						qualified = false
						continue
					}
					ref, ok := call.Args[1].(*ast.Ident)
					if !ok || ref.Obj != key.Obj || !deleteCall(call, call.Args[1]) {
						qualified = false
						continue
					}
					for _, element := range values.Elts {
						value, ok := element.(*ast.BasicLit)
						if !ok {
							qualified = false
							continue
						}
						text, err := strconv.Unquote(value.Value)
						if err != nil {
							qualified = false
							continue
						}
						removed = append(removed, "$.metadata."+text)
					}
				case *ast.ExprStmt:
					call, ok := stmt.X.(*ast.CallExpr)
					if !ok || len(call.Args) != 2 || !deleteCall(call, call.Args[1]) {
						qualified = false
						continue
					}
					key, ok := call.Args[1].(*ast.BasicLit)
					if !ok {
						qualified = false
						continue
					}
					text, err := strconv.Unquote(key.Value)
					if err != nil {
						qualified = false
						continue
					}
					removed = append(removed, "$.metadata."+text)
				case *ast.ReturnStmt:
					if len(stmt.Results) != 1 {
						qualified = false
						continue
					}
					id, ok := stmt.Results[0].(*ast.Ident)
					returned = ok && id.Obj == copied
					qualified = qualified && returned
				default:
					qualified = false
				}
			}
			if candidate {
				if !qualified || !returned || meta == nil {
					transforms[fn.Name.Name] = inheritedTransform{}
				} else {
					transforms[fn.Name.Name] = inheritedTransform{removed: removed, rewrites: rewrites, declaration: fn}
				}
			}
		}
		ast.Inspect(file, func(n ast.Node) bool {
			origin, ok := n.(*ast.AssignStmt)
			if !ok || len(origin.Lhs) != 1 || len(origin.Rhs) != 1 {
				return true
			}
			target, ok := origin.Lhs[0].(*ast.Ident)
			if !ok {
				return true
			}
			transformCall, ok := origin.Rhs[0].(*ast.CallExpr)
			if !ok {
				return true
			}
			transform, selected := transforms[callName(transformCall.Fun)]
			if !selected {
				return true
			}
			// The capability is relevant only when its returned map is the
			// actual body of a later API submission in the same function.
			actualSubmission := false
			if fn := owner(origin); fn != nil {
				ast.Inspect(fn.Body, func(n ast.Node) bool {
					call, ok := n.(*ast.CallExpr)
					if !ok || call.Pos() < origin.End() || callName(call.Fun) != "createOrPatch" || len(call.Args) != 5 {
						return true
					}
					body, ok := call.Args[3].(*ast.Ident)
					actualSubmission = actualSubmission || (ok && body.Obj == target.Obj)
					return true
				})
			}
			if !actualSubmission {
				return true
			}
			if transform.declaration == nil {
				panic(fmt.Sprintf("API_PRODUCT_GO_INHERITED_TRANSFORM_UNQUALIFIED: %s:%d", name, fset.Position(origin.Pos()).Line))
			}
			source, ok := transformCall.Args[0].(*ast.Ident)
			if !ok {
				panic("API_PRODUCT_GO_INHERITED_SOURCE_UNQUALIFIED")
			}
			var read *ast.CallExpr
			ast.Inspect(owner(origin).Body, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok || callName(call.Fun) != "kube" || len(call.Args) != 6 || call.End() >= origin.Pos() {
					return true
				}
				method, ok := call.Args[1].(*ast.SelectorExpr)
				if !ok || method.Sel.Name != "MethodGet" {
					return true
				}
				address, ok := call.Args[5].(*ast.UnaryExpr)
				if !ok || address.Op != token.AND {
					return true
				}
				id, ok := address.X.(*ast.Ident)
				if ok && id.Obj == source.Obj {
					read = call
				}
				return true
			})
			if read == nil {
				panic("API_PRODUCT_GO_INHERITED_READ_UNQUALIFIED")
			}
			secretRoute := func(expr ast.Expr, collection bool) bool {
				parts := []ast.Expr{}
				var flatten func(ast.Expr)
				flatten = func(e ast.Expr) {
					if binary, ok := e.(*ast.BinaryExpr); ok && binary.Op == token.ADD {
						flatten(binary.X)
						flatten(binary.Y)
					} else {
						parts = append(parts, e)
					}
				}
				flatten(expr)
				count := 4
				if collection {
					count = 3
				}
				if len(parts) != count {
					return false
				}
				literal := func(e ast.Expr, expected string) bool {
					value, ok := e.(*ast.BasicLit)
					if !ok || value.Kind != token.STRING {
						return false
					}
					text, err := strconv.Unquote(value.Value)
					return err == nil && text == expected
				}
				suffix := "/secrets/"
				if collection {
					suffix = "/secrets"
				}
				return literal(parts[0], "/api/v1/namespaces/") && literal(parts[2], suffix)
			}
			if !secretRoute(read.Args[2], false) {
				panic("API_PRODUCT_GO_INHERITED_RECEIVER_UNQUALIFIED")
			}
			ast.Inspect(owner(origin).Body, func(n ast.Node) bool {
				assignment, ok := n.(*ast.AssignStmt)
				if !ok || assignment.Pos() < read.End() || assignment.End() >= origin.Pos() {
					return true
				}
				for _, left := range assignment.Lhs {
					projection, ok := project(left)
					if ok && projection.root == source.Obj {
						panic("API_PRODUCT_GO_INHERITED_SOURCE_EFFECT_UNQUALIFIED")
					}
				}
				return true
			})
			ast.Inspect(owner(origin).Body, func(n ast.Node) bool {
				submission, ok := n.(*ast.CallExpr)
				if !ok || submission.Pos() < origin.End() || callName(submission.Fun) != "createOrPatch" || len(submission.Args) != 5 {
					return true
				}
				body, ok := submission.Args[3].(*ast.Ident)
				if !ok || body.Obj != target.Obj {
					return true
				}
				if !secretRoute(submission.Args[1], true) || !secretRoute(submission.Args[2], false) {
					panic("API_PRODUCT_GO_INHERITED_TARGET_RECEIVER_UNQUALIFIED")
				}
				// Qualify the actual forwarding implementation rather than assuming
				// that its name still means POST followed by PATCH after a refresh.
				helperQualified := false
				for _, packageFile := range packageFiles[name[:strings.LastIndex(name, "/")]] {
					for _, declaration := range packageFile.Decls {
						fn, ok := declaration.(*ast.FuncDecl)
						if !ok || fn.Name.Name != callName(submission.Fun) || fn.Body == nil {
							continue
						}
						params := []*ast.Ident{}
						for _, field := range fn.Type.Params.List {
							params = append(params, field.Names...)
						}
						if len(params) != 5 {
							continue
						}
						methods := []string{}
						valid := true
						ast.Inspect(fn.Body, func(n ast.Node) bool {
							call, ok := n.(*ast.CallExpr)
							if !ok || callName(call.Fun) != "kube" {
								return true
							}
							if len(call.Args) != 6 {
								valid = false
								return true
							}
							method, methodOK := call.Args[1].(*ast.SelectorExpr)
							path, pathOK := call.Args[2].(*ast.Ident)
							body, bodyOK := call.Args[3].(*ast.Ident)
							if !methodOK || !pathOK || !bodyOK || body.Obj != params[3].Obj {
								valid = false
								return true
							}
							index := 1
							if method.Sel.Name == "MethodPatch" {
								index = 2
							} else if method.Sel.Name != "MethodPost" {
								valid = false
							}
							if path.Obj != params[index].Obj {
								valid = false
							}
							methods = append(methods, method.Sel.Name)
							return true
						})
						helperQualified = valid && len(methods) == 2 && methods[0] == "MethodPost" && methods[1] == "MethodPatch"
					}
				}
				if !helperQualified {
					panic("API_PRODUCT_GO_INHERITED_FORWARDER_UNQUALIFIED")
				}
				ast.Inspect(owner(origin).Body, func(n ast.Node) bool {
					assignment, ok := n.(*ast.AssignStmt)
					if !ok || assignment.Pos() < origin.End() || assignment.End() >= submission.Pos() {
						return true
					}
					for _, left := range assignment.Lhs {
						selected, ok := project(left)
						if ok && selected.root == target.Obj {
							panic(fmt.Sprintf("API_PRODUCT_GO_INHERITED_CALLER_EFFECT_UNQUALIFIED: %s:%d", name, fset.Position(assignment.Pos()).Line))
						}
					}
					return true
				})
				rewrites := []map[string]any{}
				for _, rewrite := range transform.rewrites {
					parameter := rewrite["parameter"].(int)
					value := any(nil)
					if parameter >= 0 {
						if parameter >= len(transformCall.Args) {
							panic("API_PRODUCT_GO_INHERITED_REWRITE_UNQUALIFIED")
						}
						value = eval(transformCall.Args[parameter], map[string]bool{})
					} else {
						value = eval(rewrite["expression"].(ast.Expr), map[string]bool{})
					}
					rewrites = append(rewrites, map[string]any{"fieldPath": rewrite["fieldPath"], "value": value})
				}
				marker := map[string]any{"input": source.Name, "sourceReceiver": map[string]any{"apiVersion": "v1", "kind": "Secret", "requestMethod": "GET", "requestPath": eval(read.Args[2], map[string]bool{})}, "retainedRootFields": []string{"apiVersion", "kind", "metadata", "data", "type", "immutable"}, "excludedRootFields": []string{"stringData"}, "removedPaths": transform.removed, "rewrittenPaths": rewrites, "validation": "source-bound-kubernetes-get-sanitize-createOrPatch", "serializationLine": fset.Position(submission.Pos()).Line}
				var expression bytes.Buffer
				format.Node(&expression, fset, transformCall)
				value := map[string]any{"apiVersion": "v1", "kind": "Secret", "__docsDynamicExpression": expression.String(), "__docsSupportedSchemaPassthrough": marker}
				alternatives := []any{map[string]any{"method": "MethodPost", "path": eval(submission.Args[1], map[string]bool{})}, map[string]any{"method": "MethodPatch", "path": eval(submission.Args[2], map[string]bool{})}}
				result[name] = append(result[name], output{Value: value, Line: fset.Position(submission.Pos()).Line, Position: int(submission.Pos()), InferredIdentity: true, RequestMethod: "POST-or-PATCH", RequestAlternatives: alternatives, FactoryExpression: expression.String(), FactoryLine: fset.Position(origin.Pos()).Line, FactoryDependencies: packageDependencies[name[:strings.LastIndex(name, "/")]]})
				return true
			})
			return true
		})
		// Receiver identity is qualified only for the source-declared default
		// configuration. Environment overrides do not inherit its schema proof.
		leaseDefaults := map[string]string{}
		for _, packageFile := range packageFiles[name[:strings.LastIndex(name, "/")]] {
			ast.Inspect(packageFile, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok || callName(call.Fun) != "env" || len(call.Args) != 2 {
					return true
				}
				setting, settingOK := call.Args[0].(*ast.BasicLit)
				fallback, fallbackOK := call.Args[1].(*ast.BasicLit)
				if !settingOK || !fallbackOK || setting.Kind != token.STRING || fallback.Kind != token.STRING {
					return true
				}
				key, _ := strconv.Unquote(setting.Value)
				value, _ := strconv.Unquote(fallback.Value)
				if key == "BUSTER_LEASE_API_GROUP" || key == "BUSTER_LEASE_API_VERSION" {
					leaseDefaults[key] = value
				}
				return true
			})
		}
		// Prefer actual direct publication positions to a fabricated post-mutation
		// identifier. Unsubmitted constructors retain their selected source shape.
		submissions := map[string][]*ast.CallExpr{}
		ast.Inspect(file, func(n ast.Node) bool {
			if call, ok := n.(*ast.CallExpr); ok {
				known := forwarders[name[:strings.LastIndex(name, "/")]]
				if index, forward := known[callName(call.Fun)]; forward && index < len(call.Args) {
					if id, ok := call.Args[index].(*ast.Ident); ok {
						submissions[bindingKey(id)] = append(submissions[bindingKey(id)], call)
					}
				}
			}
			return true
		})
		ast.Inspect(file, func(n ast.Node) bool {
			if call, ok := n.(*ast.CallExpr); ok && len(call.Args) >= 6 {
				if receiver, ok := call.Fun.(*ast.SelectorExpr); ok && receiver.Sel.Name == "kube" {
					method := ""
					if selector, ok := call.Args[1].(*ast.SelectorExpr); ok {
						method = selector.Sel.Name
					}
					if text, ok := call.Args[1].(*ast.BasicLit); ok {
						method, _ = strconv.Unquote(text.Value)
						if method == "PATCH" {
							method = "MethodPatch"
						}
						if method == "DELETE" {
							method = "MethodDelete"
						}
					}
					kind, version := "", ""
					receiverConditions := []conditionSelection{}
					if method == "MethodDelete" {
						kind = "DeleteOptions"
						version = "v1"
					}
					if method == "MethodPatch" {
						if target, ok := call.Args[2].(*ast.CallExpr); ok {
							if selector, ok := target.Fun.(*ast.SelectorExpr); ok && (selector.Sel.Name == "leasePath" || selector.Sel.Name == "statusPath") {
								group, apiVersion := leaseDefaults["BUSTER_LEASE_API_GROUP"], leaseDefaults["BUSTER_LEASE_API_VERSION"]
								if group == "" || apiVersion == "" {
									panic("API_PRODUCT_GO_CONFIGURED_RECEIVER_UNQUALIFIED")
								}
								kind = "BusterNamespaceLease"
								version = group + "/" + apiVersion
								receiverConditions = []conditionSelection{{Expression: "c.apiGroup == " + strconv.Quote(group), Result: true}, {Expression: "c.apiVersion == " + strconv.Quote(apiVersion), Result: true}}
							}
						}
					}
					if method == "MethodPatch" && kind == "" {
						if target, ok := call.Args[2].(*ast.BasicLit); ok && target.Kind == token.STRING {
							path, _ := strconv.Unquote(target.Value)
							parts := strings.Split(strings.Trim(path, "/"), "/")
							if len(parts) == 6 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "namespaces" {
								kinds := map[string]string{"secrets": "Secret", "configmaps": "ConfigMap", "pods": "Pod", "services": "Service", "endpoints": "Endpoints", "serviceaccounts": "ServiceAccount", "persistentvolumeclaims": "PersistentVolumeClaim"}
								kind = kinds[parts[4]]
								version = "v1"
							}
							if len(parts) == 4 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "namespaces" {
								kind = "Namespace"
								version = "v1"
							}
						}
					}
					if method == "MethodPatch" && kind == "" {
						if body, ok := eval(call.Args[3], map[string]bool{}).(map[string]any); ok {
							if _, identity := body["apiVersion"]; !identity && body["__docsDynamicExpression"] == nil {
								panic(fmt.Sprintf("API_PRODUCT_GO_PATCH_RECEIVER_UNQUALIFIED: %s:%d", name, fset.Position(call.Pos()).Line))
							}
						}
					}
					if kind != "" {
						if body, ok := eval(call.Args[3], map[string]bool{}).(map[string]any); ok {
							if _, authored := body["apiVersion"]; !authored {
								body["apiVersion"] = version
								body["kind"] = kind
								result[name] = append(result[name], output{Value: body, Line: fset.Position(call.Pos()).Line, Position: int(call.Pos()), InferredIdentity: true, RequestMethod: method, RequestPath: eval(call.Args[2], map[string]bool{}), Conditions: receiverConditions})
							}
						}
					}
				}
			}
			literal, ok := n.(*ast.CompositeLit)
			if !ok {
				return true
			}
			if selector, ok := literal.Type.(*ast.SelectorExpr); ok {
				if alias, ok := selector.X.(*ast.Ident); ok && typedAPIPackages[alias.Name] != "" {
					panic(fmt.Sprintf("API_PRODUCT_GO_TYPED_CONSTRUCTOR_UNQUALIFIED: %s:%d %s.%s", name, fset.Position(literal.Pos()).Line, alias.Name, selector.Sel.Name))
				}
			}
			if _, ok := literal.Type.(*ast.MapType); !ok {
				return true
			}
			hasVersion, hasKind := false, false
			for _, element := range literal.Elts {
				if pair, ok := element.(*ast.KeyValueExpr); ok {
					if key, ok := pair.Key.(*ast.BasicLit); ok {
						text, _ := strconv.Unquote(key.Value)
						hasVersion = hasVersion || text == "apiVersion"
						hasKind = hasKind || text == "kind"
					}
				}
			}
			if hasVersion && hasKind {
				expressions := []ast.Expr{literal}
				if id, ok := literalBindings[literal]; ok {
					checkLiteralEffects(id)
					if calls := submissions[bindingKey(id)]; len(calls) > 0 {
						expressions = nil
						for _, call := range calls {
							expressions = append(expressions, &ast.Ident{Name: id.Name, Obj: id.Obj, NamePos: call.Pos()})
						}
					} else {
						last := literal.End() + 1
						for _, assignment := range indexed[bindingKey(id)] {
							if assignment.End() >= last {
								last = assignment.End() + 1
							}
						}
						expressions = []ast.Expr{&ast.Ident{Name: id.Name, Obj: id.Obj, NamePos: last}}
					}
				}
				for _, variant := range literalConditionVariants(literal) {
					activeConditions = variant
					for _, expression := range expressions {
						value := eval(expression, map[string]bool{})
						if object, ok := value.(map[string]any); ok {
							_, version := object["apiVersion"].(string)
							_, kind := object["kind"].(string)
							if !version || !kind {
								panic(fmt.Sprintf("API_PRODUCT_GO_IDENTITY_UNRESOLVED: %s:%d", name, fset.Position(literal.Pos()).Line))
							}
							if version && kind {
								record := output{Value: value, Line: fset.Position(literal.Pos()).Line, Position: int(expression.Pos())}
								for branch, taken := range variant {
									var b bytes.Buffer
									format.Node(&b, fset, branch.Cond)
									record.Conditions = append(record.Conditions, conditionSelection{Expression: b.String(), Result: taken})
								}
								sort.Slice(record.Conditions, func(i, j int) bool { return record.Conditions[i].Expression < record.Conditions[j].Expression })
								ast.Inspect(file, func(n ast.Node) bool {
									if call, ok := n.(*ast.CallExpr); ok && len(call.Args) == 6 {
										if sel, ok := call.Fun.(*ast.SelectorExpr); ok && sel.Sel.Name == "kube" && (call.Pos() == expression.Pos() || call.Args[3] == literal) {
											if method, ok := call.Args[1].(*ast.SelectorExpr); ok {
												record.RequestMethod = method.Sel.Name
											}
											if text, ok := call.Args[1].(*ast.BasicLit); ok {
												record.RequestMethod, _ = strconv.Unquote(text.Value)
											}
											record.RequestPath = eval(call.Args[2], map[string]bool{})
										}
									}
									return true
								})
								result[name] = append(result[name], record)
							}
						}
					}
				}
				activeConditions = map[*ast.IfStmt]bool{}
			}
			return true
		})
	}
	if err := json.NewEncoder(os.Stdout).Encode(result); err != nil {
		panic(err)
	}
}
