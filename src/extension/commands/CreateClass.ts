import { vscode } from "../vscode";
import * as path from 'path';

export async function createClass() {
    const editor = vscode.window.activeTextEditor;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

    if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace open.");
        return;
    }

    const name = await vscode.window.showInputBox({
        prompt: "Enter class name (without .uc)",
        placeHolder: "MyClass"
    });

    if (!name) return;

    // Determine target directory
    const root = workspaceFolder.uri;
    const interfaceClasses = vscode.Uri.joinPath(root, 'Interface', 'Classes');
    const interfaceClassicClasses = vscode.Uri.joinPath(root, 'InterfaceClassic', 'Classes');

    let targetDir = interfaceClasses;
    
    try {
        await vscode.workspace.fs.stat(interfaceClasses);
    } catch {
        try {
            await vscode.workspace.fs.stat(interfaceClassicClasses);
            targetDir = interfaceClassicClasses;
        } catch {
            // If neither exists, default to Interface/Classes (will be created if we used recursive create, but we might just error or ask)
            // User said "Interface\Classes is priority".
            // We will stick with Interface/Classes even if it doesn't exist, so standard mkdir will create parameter directories? 
            // VSCode fs.writeFile's parent dirs? VS Code doesn't auto-create parents on writeFile usually.
            // Let's try to ensure directory exists.
            try {
                await vscode.workspace.fs.createDirectory(interfaceClasses);
            } catch(e) {
                vscode.window.showErrorMessage(`Could not create directory ${interfaceClasses.fsPath}`);
                return;
            }
        }
    }

    const fileName = name.endsWith('.uc') ? name : `${name}.uc`;
    const targetFile = vscode.Uri.joinPath(targetDir, fileName);

    const className = path.basename(fileName, '.uc');
    const content = `class ${className} extends UICommonAPI;\n\n`;

    try {
        await vscode.workspace.fs.writeFile(targetFile, Buffer.from(content, 'utf8'));
        const doc = await vscode.workspace.openTextDocument(targetFile);
        await vscode.window.showTextDocument(doc);
    } catch (e) {
        vscode.window.showErrorMessage(`Failed to create file: ${e}`);
    }
}
