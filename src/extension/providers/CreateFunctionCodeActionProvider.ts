import { CodeAction, CodeActionKind, CodeActionProvider, Command, ProviderResult, Range, Selection, TextDocument, WorkspaceEdit, Position, CancellationToken, CodeActionContext } from "vscode";
import { db } from "../state";
import { SemanticClass } from "../../lib/parser";
import { getStatementsRecursively, UnrealClassStatement, UnrealClassExpression } from "../../lib/parser/ast";

export class CreateFunctionCodeActionProvider implements CodeActionProvider {
    
    provideCodeActions(document: TextDocument, range: Range | Selection, context: CodeActionContext, token: CancellationToken): ProviderResult<(Command | CodeAction)[]> {
        // Filter for our specific diagnostic
        // Diagnostics.ts sets source to 'ucx'.
        const diagnostic = context.diagnostics.find(d => d.source === 'ucx' && d.message.startsWith("Undefined function"));
        if (!diagnostic) return [];

        const result: CodeAction[] = [];
        
        // 1. Get the AST for the current document
        const ast = db.updateDocumentAndGetAst(document, token);
        if (!ast) return result;

        // 2. Identify the function call at the diagnostic location
        // We use the diagnostic range to locate the token
        const line = diagnostic.range.start.line;
        const character = diagnostic.range.start.character;
        let callerToken: { token: { text: string; textLower: string; type: SemanticClass } } | undefined;
        let foundStatement: UnrealClassStatement | undefined;

        for (const fn of ast.functions) {
            if (line < (fn.bodyFirstToken?.line ?? 0) || line > (fn.bodyLastToken?.line ?? 0)) continue;
            
            for (const st of getStatementsRecursively(fn.body)) {
                // Check if cursor/diagnostic matches the operator
                if (st.op && st.op.line === line && st.op.position === character) {
                     callerToken = { token: st.op };
                     foundStatement = st;
                     break;
                }
                // Also check nested expressions if the diagnostic pointed there
                 if (st.args) {
                    for (const arg of st.args) {
                        this.checkExpressionForMatch(arg, line, character, (tok, stmt) => {
                             callerToken = { token: tok };
                             foundStatement = st; // We associate with the top statement for now, ideally we want the expression context
                        });
                    }
                }
            }
            if (callerToken) break;
        }
        
        if (!callerToken || !callerToken.token) return result;

        // Create the code action
        const action = new CodeAction(`Create function '${callerToken.token.text}'`, CodeActionKind.QuickFix);
        action.edit = new WorkspaceEdit();
        action.diagnostics = [diagnostic];
        
        // Calculate types and names from arguments
        const newArgs: { name: string; type: string }[] = [];
        
        if (foundStatement && foundStatement.op === callerToken.token) {
             if (foundStatement.args) {
                for (let i = 0; i < foundStatement.args.length; i++) {
                    const arg = foundStatement.args[i];
                    const type = this.inferType(arg, ast);
                    let name = `arg${i + 1}`;
                    
                    // Try to use the variable name if it's an identifier
                    if ('text' in arg && arg.type !== SemanticClass.LiteralString && arg.type !== SemanticClass.LiteralNumber && arg.text) {
                        // Check if it looks like a valid identifier
                        const text = arg.text;
                        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(text) && text.toLowerCase() !== 'true' && text.toLowerCase() !== 'false') {
                            name = text;
                        }
                    }
                    newArgs.push({ name, type });
                }
            }
        }
        
        // Construct new text
        const argString = newArgs.map(arg => `${arg.type} ${arg.name}`).join(', ');
        
        const lastFn = ast.functions[ast.functions.length - 1];
        let insertLine = -1;

        // Find the first function that is NOT an event
        const firstNonEventFunc = ast.functions.find((f: any) => !f.isEvent);

        if (firstNonEventFunc) {
            // Insert before the first function
            // We use the name token line as a safe approximation for the start of the function
            if (firstNonEventFunc.name) {
                insertLine = firstNonEventFunc.name.line;
            } else if (firstNonEventFunc.bodyFirstToken) {
                 insertLine = firstNonEventFunc.bodyFirstToken.line;
            } else {
                 // Fallback if no tokens (shouldn't happen for valid func)
                 insertLine = (lastFn?.bodyLastToken?.line ?? 0) + 1;
            }
        } else {
            // No non-event functions. Insert after the last event (if any).
             // If all functions are events, lastFn is the last event.
            if (lastFn) {
                insertLine = (lastFn.bodyLastToken?.line ?? 0) + 1;
            } else {
                // No functions or events at all. Insert at the end or after class decl.
                // Try to find the last meaningful token in the class to append after.
                // We'll default to end of document (or logic similar to before).
                insertLine = (ast.classDeclarationFirstToken?.line ?? 0) + 1;
                // Check variables to push it further down? 
                // For now, let's just use document end if no functions exist, 
                // effectively similar to old behavior but handling the 'no functions' case.
                 insertLine = document.lineCount; 
            }
        }
        
        if (insertLine < 0) insertLine = document.lineCount;

        let newText = "";
        let cursorOffset = 0;

        if (firstNonEventFunc) {
            // Inserting before an existing function.
            newText = `function ${callerToken.token.text}(${argString})\n{\n\t\n}\n\n`;
            cursorOffset = 2;
        } else {
            // Inserting after the last event (or at end).
            newText = `\n\nfunction ${callerToken.token.text}(${argString})\n{\n\t\n}`;
            cursorOffset = 4;
        }
        
        action.edit.insert(document.uri, new Position(insertLine, 0), newText);

        action.command = {
            command: 'ucx.moveCursor',
            title: 'Move Cursor',
            arguments: [document.uri.toString(), insertLine + cursorOffset, 1] 
        };
        
        result.push(action);
        return result;
    }

    private checkExpressionForMatch(expr: UnrealClassExpression | any, line: number, char: number, callback: (token: any, parent: any) => void) {
        if (!expr) return;
        if ('op' in expr) {
             if (expr.op && expr.op.line === line && expr.op.position === char) {
                 callback(expr.op, expr);
             }
             if (expr.args) {
                 for (const arg of expr.args) {
                     this.checkExpressionForMatch(arg, line, char, callback);
                 }
             }
        }
    }

    private inferType(arg: UnrealClassExpression | any, ast: any): string {
        if ('text' in arg) {
            const text = arg.text;
            if (text.startsWith('"') || text.startsWith("'")) return 'string';
            if (/^[0-9]+$/.test(text)) return 'int';
            if (/^[0-9]+\.[0-9]+$/.test(text)) return 'float';
            if (text.toLowerCase() === 'true' || text.toLowerCase() === 'false') return 'bool';
            
            const classVar = ast.variables.find((v: any) => v.name?.textLower === text.toLowerCase());
            if (classVar && classVar.type) return classVar.type.text;
            
             if (text.toLowerCase().includes('id')) return 'int';
             if (text.toLowerCase().includes('str') || text.toLowerCase().includes('name') || text.toLowerCase().includes('param')) return 'string';
             if (text.toLowerCase().includes('b') && text.length > 1 && text[1] === text[1].toUpperCase()) return 'bool';
        }
        return 'int'; 
    }
}
