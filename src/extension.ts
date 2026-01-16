// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below

import { diagnostics, resetExtensionState } from './extension/state';
import { vscode } from './extension/vscode';
import { langId } from './extension/constants';
import { 
    DefinitionProvider, 
    ColorProvider, 
    DocumentSymbolProvider, 
    FormattingProvider, 
    HoverProvider, 
    SemanticTokensProvider, 
    WorkspaceSymbolProvider, 
    CompletionProvider,
    FoldingRangeProvider,
    TypeHierarchyProvider,
    SignatureProvider,
    ReferenceProvider,
    RenameProvider,
    CreateFunctionCodeActionProvider,
} from './extension/providers';
import { smartBackspace } from './extension/commands/SmartBackspace';


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	
    resetExtensionState();

    const semanticTokensProvider = new SemanticTokensProvider();
    const lang = vscode.languages;
    const cmds = vscode.commands;
    const completion = new CompletionProvider();

    context.subscriptions.push(
        lang.registerSignatureHelpProvider(langId.uc, new SignatureProvider(), '(', ','),
        lang.registerTypeHierarchyProvider(langId.uc, new TypeHierarchyProvider()),
        lang.registerDocumentRangeFormattingEditProvider(langId.uc, new FormattingProvider()),
        lang.registerDefinitionProvider(langId.uc, new DefinitionProvider()),
        lang.registerWorkspaceSymbolProvider(new WorkspaceSymbolProvider()),
        lang.registerColorProvider(langId.uc, new ColorProvider()),
        lang.registerDocumentSymbolProvider(langId.uc, new DocumentSymbolProvider()),
        lang.registerHoverProvider(langId.uc, new HoverProvider()),
        lang.registerCompletionItemProvider(langId.uc, completion, "'", '.', '<'), // invoke after trigger chars
        lang.registerReferenceProvider(langId.uc, new ReferenceProvider()),
        lang.registerRenameProvider(langId.uc, new RenameProvider()),
        lang.registerCodeActionsProvider(langId.uc, new CreateFunctionCodeActionProvider()),
        lang.registerDocumentSemanticTokensProvider(langId.uc, semanticTokensProvider, semanticTokensProvider.legend),
        cmds.registerCommand('ucx.restartServer', resetExtensionState),
        cmds.registerCommand('ucx.moveCursor', async (uri: string, line: number, character: number) => {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.uri.toString() === uri) {
                const newPos = new vscode.Position(line, character);
                const newSelection = new vscode.Selection(newPos, newPos);
                editor.selection = newSelection;
                editor.revealRange(new vscode.Range(newPos, newPos));
            }
        }),
        cmds.registerCommand('ucx.smartBackspace', smartBackspace),
        vscode.languages.registerFoldingRangeProvider(langId.uc, new FoldingRangeProvider()),
        diagnostics,
        vscode.workspace.onDidChangeTextDocument(event => diagnostics.updateDiagnostics(event.document)),
    );

}
