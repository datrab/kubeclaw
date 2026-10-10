// Documentation-only AST discovery. This program does not execute producers.
package main

import (
 "encoding/json"
 "fmt"
 "bytes"
 "go/format"
 "go/ast"
 "go/parser"
 "go/token"
 "os"
 "strconv"
 "strings"
)

func bindingKey(id *ast.Ident)string {if id.Obj!=nil{return fmt.Sprintf("%s:%d",id.Name,id.Obj.Pos())};return id.Name}

type output struct { Value any `json:"value"`; Line int `json:"line"`; Position int `json:"position"`; InferredIdentity bool `json:"inferredIdentity,omitempty"`; RequestMethod string `json:"requestMethod,omitempty"` }
func main() {
 var files []string
 if err:=json.NewDecoder(os.Stdin).Decode(&files);err!=nil {panic(err)}
 result:=map[string][]output{}
 for _,name:=range files {
  fset:=token.NewFileSet();file,err:=parser.ParseFile(fset,name,nil,parser.AllErrors)
  if err!=nil {panic(err)}
  typedAPIPackages:=map[string]string{}
  for _,imp:=range file.Imports {packagePath,_:=strconv.Unquote(imp.Path.Value);if strings.HasPrefix(packagePath,"k8s.io/api/")||strings.HasPrefix(packagePath,"k8s.io/apiextensions-apiserver/pkg/apis/"){alias:=packagePath[strings.LastIndex(packagePath,"/")+1:];if imp.Name!=nil{alias=imp.Name.Name};typedAPIPackages[alias]=packagePath}}
  literalBindings:=map[*ast.CompositeLit]*ast.Ident{};bindings:=map[string][]ast.Expr{};indexed:=map[string][]*ast.AssignStmt{};functions:=map[string][]ast.Expr{}
  ast.Inspect(file,func(n ast.Node)bool {
   if a,ok:=n.(*ast.AssignStmt);ok {for i,lhs:=range a.Lhs {if index,ok:=lhs.(*ast.IndexExpr);ok&&i<len(a.Rhs){if id,ok:=index.X.(*ast.Ident);ok {indexed[bindingKey(id)]=append(indexed[bindingKey(id)],a)}};if id,ok:=lhs.(*ast.Ident);ok&&i<len(a.Rhs){bindings[bindingKey(id)]=append(bindings[bindingKey(id)],a.Rhs[i]);if literal,ok:=a.Rhs[i].(*ast.CompositeLit);ok{literalBindings[literal]=id}}}}
   if d,ok:=n.(*ast.ValueSpec);ok {for i,id:=range d.Names {if i<len(d.Values){bindings[bindingKey(id)]=append(bindings[bindingKey(id)],d.Values[i]);if literal,ok:=d.Values[i].(*ast.CompositeLit);ok{literalBindings[literal]=id}}}}
   if fn,ok:=n.(*ast.FuncDecl);ok&&fn.Body!=nil {ast.Inspect(fn.Body,func(child ast.Node)bool{if ret,ok:=child.(*ast.ReturnStmt);ok {for _,expr:=range ret.Results {if _,ok:=expr.(*ast.CompositeLit);ok{functions[fn.Name.Name]=append(functions[fn.Name.Name],expr)}}};return true})}
   return true
  })
  var eval func(ast.Expr,map[string]bool)any
  eval=func(expr ast.Expr,seen map[string]bool)any {
   if expr==nil{return nil}
   switch x:=expr.(type) {
   case *ast.BasicLit:
    if x.Kind==token.STRING {s,e:=strconv.Unquote(x.Value);if e!=nil{panic(e)};return s}
    if x.Kind==token.INT {s,e:=strconv.ParseInt(x.Value,0,64);if e==nil{return s}}
   case *ast.CompositeLit:
    _,isMap:=x.Type.(*ast.MapType)
    if isMap {v:=map[string]any{};for _,element:=range x.Elts {pair,ok:=element.(*ast.KeyValueExpr);if !ok{panic("unexpected map element")};key:=eval(pair.Key,seen);if text,ok:=key.(string);ok {v[text]=eval(pair.Value,seen)}else{v["*"]=eval(pair.Value,seen)}};return v}
    values:=[]any{};for _,item:=range x.Elts {if pair,ok:=item.(*ast.KeyValueExpr);ok {values=append(values,eval(pair.Value,seen))}else{values=append(values,eval(item.(ast.Expr),seen))}};return values
   case *ast.Ident:
    if x.Name=="true"{return true};if x.Name=="false"{return false};if x.Name=="nil"{return nil}
    key:=bindingKey(x)
    if !seen[key] {choices:=bindings[key];var chosen ast.Expr;for _,choice:=range choices {if choice.End()<x.Pos(){chosen=choice}};if chosen==nil&&len(choices)>0{chosen=choices[0]};if chosen!=nil {copy:=map[string]bool{};for k,v:=range seen{copy[k]=v};copy[key]=true;value:=eval(chosen,copy);if object,ok:=value.(map[string]any);ok {for _,assignment:=range indexed[key] {if assignment.Pos()>chosen.Pos()&&assignment.End()<x.Pos() {for i,left:=range assignment.Lhs {if index,ok:=left.(*ast.IndexExpr);ok&&i<len(assignment.Rhs){if name,ok:=eval(index.Index,copy).(string);ok {object[name]=eval(assignment.Rhs[i],copy)}}}}}};return value}}
   case *ast.CallExpr:
    name:="";if id,ok:=x.Fun.(*ast.Ident);ok{name=id.Name};
    if name=="append"&&len(x.Args)>0 {values:=[]any{};if base,ok:=eval(x.Args[0],seen).([]any);ok{values=append(values,base...)};for _,arg:=range x.Args[1:] {values=append(values,eval(arg,seen))};return values}
if sel,ok:=x.Fun.(*ast.SelectorExpr);ok{name=sel.Sel.Name}
    if !seen[name]&&len(functions[name])>0 {copy:=map[string]bool{};for k,v:=range seen{copy[k]=v};copy[name]=true;merged:=map[string]any{};for _,choice:=range functions[name] {if m,ok:=eval(choice,copy).(map[string]any);ok {for k,v:=range m{merged[k]=v}}};return merged}
   case *ast.ParenExpr:return eval(x.X,seen)
   case *ast.UnaryExpr:return eval(x.X,seen)
   }
   var source bytes.Buffer
   if err:=format.Node(&source,fset,expr);err!=nil{panic(err)}
   return map[string]any{"__docsDynamicExpression":source.String()}
  }
  ast.Inspect(file,func(n ast.Node)bool {
   if call,ok:=n.(*ast.CallExpr);ok&&len(call.Args)>=6 {
    if receiver,ok:=call.Fun.(*ast.SelectorExpr);ok&&receiver.Sel.Name=="kube" {
     method:="";if selector,ok:=call.Args[1].(*ast.SelectorExpr);ok {method=selector.Sel.Name}
     kind,version:="",""
     if method=="MethodDelete" {kind="DeleteOptions";version="v1"}
     if method=="MethodPatch" {if target,ok:=call.Args[2].(*ast.CallExpr);ok {if selector,ok:=target.Fun.(*ast.SelectorExpr);ok&&(selector.Sel.Name=="leasePath"||selector.Sel.Name=="statusPath") {kind="BusterNamespaceLease";version="kubeclaw.forgestack.ai/v1alpha1"}}}
     if kind!="" {if body,ok:=eval(call.Args[3],map[string]bool{}).(map[string]any);ok {
      if _,authored:=body["apiVersion"];!authored {body["apiVersion"]=version;body["kind"]=kind;result[name]=append(result[name],output{Value:body,Line:fset.Position(call.Pos()).Line,Position:int(call.Pos()),InferredIdentity:true,RequestMethod:method})}
     }}
    }
   }
   literal,ok:=n.(*ast.CompositeLit);if !ok{return true};if selector,ok:=literal.Type.(*ast.SelectorExpr);ok{if alias,ok:=selector.X.(*ast.Ident);ok&&typedAPIPackages[alias.Name]!=""{panic(fmt.Sprintf("API_PRODUCT_GO_TYPED_CONSTRUCTOR_UNQUALIFIED: %s:%d %s.%s",name,fset.Position(literal.Pos()).Line,alias.Name,selector.Sel.Name))}};if _,ok:=literal.Type.(*ast.MapType);!ok{return true}
   hasVersion,hasKind:=false,false
   for _,element:=range literal.Elts {if pair,ok:=element.(*ast.KeyValueExpr);ok {if key,ok:=pair.Key.(*ast.BasicLit);ok {text,_:=strconv.Unquote(key.Value);hasVersion=hasVersion||text=="apiVersion";hasKind=hasKind||text=="kind"}}}
   if hasVersion&&hasKind {expression:=ast.Expr(literal);if id,ok:=literalBindings[literal];ok {last:=literal.End()+1;for _,assignment:=range indexed[bindingKey(id)] {if assignment.End()>=last{last=assignment.End()+1}};expression=&ast.Ident{Name:id.Name,Obj:id.Obj,NamePos:last}};value:=eval(expression,map[string]bool{});if object,ok:=value.(map[string]any);ok {_,version:=object["apiVersion"].(string);_,kind:=object["kind"].(string);if !version||!kind {panic(fmt.Sprintf("API_PRODUCT_GO_IDENTITY_UNRESOLVED: %s:%d",name,fset.Position(literal.Pos()).Line))};if version&&kind {result[name]=append(result[name],output{Value:value,Line:fset.Position(literal.Pos()).Line,Position:int(literal.Pos())})}}}
   return true
  })
 }
 if err:=json.NewEncoder(os.Stdout).Encode(result);err!=nil {panic(err)}
}
