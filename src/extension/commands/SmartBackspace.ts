import { vscode } from '../vscode';

export async function smartBackspace() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const document = editor.document;
    const selections = editor.selections;

    // We only handle single cursor for simplicity in this smart behavior to avoid conflicts
    if (selections.length !== 1) {
        await vscode.commands.executeCommand('deleteLeft');
        return;
    }

    const selection = selections[0];
    if (!selection.isEmpty) {
        await vscode.commands.executeCommand('deleteLeft');
        return;
    }

    const position = selection.active;
    const line = document.lineAt(position.line);
    
    // Check if the cursor is at the end of the line (or we just want to check if the line is empty/whitespace)
    // The requirement: "when the line has many spaces and no content... delete it completely and jump to the one above"
    // This implies determining if the line is "empty" (whitespace only).

    if (line.isEmptyOrWhitespace) {
        // If we are on the first line, we can't delete "up" exactly like joining, but we can delete the line.
        if (position.line === 0) {
            // Check if there are next lines to pull up? Or just clear it?
            // Standard backspace on empty first line doesn't destroy the line usually unless it wasn't empty.
            // Let's stick to standard behavior for first line to be safe.
            await vscode.commands.executeCommand('deleteLeft');
            return;
        }

        // Delete the current line including the newline character of the previous line
        // Range to delete: From end of previous line to end of current line (or start of next).
        
        // Actually, easiest way to "delete line and jump up":
        // Delete the range of the line + the EOL of previous line.
        
        const prevLine = document.lineAt(position.line - 1);
        const rangeToDelete = new vscode.Range(prevLine.range.end, line.range.end);
        
        // However, user said "dispensing the need to press backspace multiple times".
        // This implies he wants to behave as if the line didn't exist.
        
        // Let's delete the whole line range.
        await editor.edit(editBuilder => {
            // We want to remove the line break from the previous line AND the whitespace on the current line.
            // Previous line end -> Current line end.
            editBuilder.delete(rangeToDelete);
        });
    } else {
        // Line has content, standard backspace
        await vscode.commands.executeCommand('deleteLeft');
    }
}
