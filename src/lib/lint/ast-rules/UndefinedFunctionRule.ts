import { AstBasedLinter } from "../AstBasedLinter";
import { LintResult } from "../LintResult";
import { UnrealClass } from "../../parser";
import { getStatementsRecursively, UnrealClassExpression } from "../../parser/ast";
import { SemanticClass } from "../../parser/token";


export class UndefinedFunctionRule implements AstBasedLinter {
    private db: any; 
    private uri: string = '';

    constructor(db: any, uri?: string) {
        this.db = db;
        if (uri) this.uri = uri;
    }

    lint(ast: UnrealClass): LintResult[] | null {
        if (!this.db) return null;
        
        const results: LintResult[] = [];
        
        for (const fn of ast.functions) {
            for (const st of getStatementsRecursively(fn.body)) {
                // Check operator (function call)
                // SemanticClass.Text removed, assuming Identifier or None for unresolved
                if (st.op && (st.op.type === SemanticClass.FunctionReference || st.op.type === SemanticClass.None || st.op.type === SemanticClass.Identifier)) {
                     this.checkToken(st.op, ast, results);
                }
                
                if (st.args) {
                    for (const arg of st.args) {
                        this.checkExpression(arg, ast, results);
                    }
                }
            }
        }

        return results;
    }

    private checkExpression(expr: UnrealClassExpression | any, ast: UnrealClass, results: LintResult[]) {
        if (!expr) return;
        if ('op' in expr) {
             if (expr.op && (expr.op.type === SemanticClass.FunctionReference || expr.op.type === SemanticClass.None || expr.op.type === SemanticClass.Identifier)) {
                 this.checkToken(expr.op, ast, results);
             }
             if (expr.args) {
                 for (const arg of expr.args) {
                     this.checkExpression(arg, ast, results);
                 }
             }
        }
    }

    private checkToken(token: any, ast: UnrealClass, results: LintResult[]) {
         if (this.shouldIgnore(token.textLower)) return;
         if (token.text.length <= 1) return; // Ignore single chars

         if (!this.uri) return;

         const tokenInfo = this.db.findToken(this.uri, token.line, token.position);
         const def = this.db.findDefinition(tokenInfo);
         
         if (!def.found) {
             results.push({
                 message: `Undefined function '${token.text}'`,
                 line: token.line,
                 position: token.position,
                 length: token.text.length,
                 severity: 'error',
                 source: 'linter',
                 originalText: token.text
             });
         }
    }

    private shouldIgnore(name: string): boolean {
        const ignored = ['if', 'else', 'switch', 'case', 'while', 'for', 'foreach', 'return', 'break', 'continue', 'true', 'false', 'default', 'new', 'class', 'self', 'none', 'goto', 'stop', 'assert', 'log'];
        return ignored.includes(name);
    }
}
