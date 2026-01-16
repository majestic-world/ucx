import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { XMLParser } from 'fast-xml-parser';

export async function importUI() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'unrealscript') {
        return;
    }

    const document = editor.document;
    // Assuming class name matches file name
    const className = path.basename(document.fileName, path.extname(document.fileName));

    // 1. Get XML Directory
    const config = vscode.workspace.getConfiguration('ucx');
    let xmlDir = config.get<string>('xmlDirectory');

    if (!xmlDir || !fs.existsSync(xmlDir)) {
        const selection = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            title: 'Select Directory Containing UI XML Files'
        });

        if (selection && selection.length > 0) {
            xmlDir = selection[0].fsPath;
            await config.update('xmlDirectory', xmlDir, vscode.ConfigurationTarget.Workspace);
        } else {
            return; // User cancelled
        }
    }

    // 2. Locate XML File
    const xmlPath = path.join(xmlDir, `${className}.xml`);
    if (!fs.existsSync(xmlPath)) {
        vscode.window.showErrorMessage(`XML file not found: ${xmlPath}`);
        return;
    }

    // 3. Parse XML
    try {
        const xmlContent = fs.readFileSync(xmlPath, 'utf8');
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: ""
        });
        const jsonObj = parser.parse(xmlContent);

        // 4. Extract Elements
        const elements: UIElement[] = [];
        traverseXML(jsonObj, '', elements);

        if (elements.length === 0) {
            vscode.window.showInformationMessage('No valid UI elements found in XML.');
            return;
        }

        // 5. Filter out already imported elements
        const text = document.getText();
        const importedPaths = new Set<string>();
        // Match Get*Handle("Path.To.Element")
        const importedRegex = /Get\w+Handle\s*\(\s*"([^"]+)"\s*\)/gi;
        let match;
        while ((match = importedRegex.exec(text)) !== null) {
            importedPaths.add(match[1]);
        }

        const availableElements = elements.filter(e => !importedPaths.has(e.fullPath));

        if (availableElements.length === 0) {
            vscode.window.showInformationMessage('All elements from XML are already imported.');
            return;
        }

        // 6. Show QuickPick
        const picked = await vscode.window.showQuickPick(availableElements.map(e => ({
            label: e.name,
            description: e.type,
            detail: e.fullPath,
            element: e
        })), {
            placeHolder: 'Select UI Element to Import',
            matchOnDescription: true,
            matchOnDetail: true
        });

        if (picked) {
            // 6. Generate Code
            await injectCode(editor, picked.element);
        }

    } catch (error) {
        vscode.window.showErrorMessage(`Error parsing XML: ${error}`);
    }
}

interface UIElement {
    name: string;
    type: string; // The UnrealScript type (e.g. WindowHandle, ButtonHandle)
    func: string; // The function to call (e.g. GetWindowHandle)
    fullPath: string; // Dot-separated path
}

// Map XML tags to UnrealScript types and Get functions
const tagMap: { [key: string]: { type: string, func: string } } = {
    'Window': { type: 'WindowHandle', func: 'GetWindowHandle' },
    'Button': { type: 'ButtonHandle', func: 'GetButtonHandle' },
    'TextBox': { type: 'TextBoxHandle', func: 'GetTextBoxHandle' },
    'EditBox': { type: 'EditBoxHandle', func: 'GetEditBoxHandle' },
    'CheckBox': { type: 'CheckBoxHandle', func: 'GetCheckBoxHandle' },
    'ListCtrl': { type: 'ListCtrlHandle', func: 'GetListCtrlHandle' },
    'RichListCtrl': { type: 'RichListCtrlHandle', func: 'GetRichListCtrlHandle' },
    'MinimapCtrl': { type: 'MinimapCtrlHandle', func: 'GetMinimapCtrlHandle' },
    'NameCtrl': { type: 'NameCtrlHandle', func: 'GetNameCtrlHandle' },
    'ProgressCtrl': { type: 'ProgressCtrlHandle', func: 'GetProgressCtrlHandle' },
    'PropertyController': { type: 'PropertyControllerHandle', func: 'GetPropertyControllerHandle' },
    'RadarMapCtrl': { type: 'RadarMapCtrlHandle', func: 'GetRadarMapCtrlHandle' },
    'SliderCtrl': { type: 'SliderCtrlHandle', func: 'GetSliderCtrlHandle' },
    'StatusBar': { type: 'StatusBarHandle', func: 'GetStatusBarHandle' },
    'StatusIcon': { type: 'StatusIconHandle', func: 'GetStatusIconHandle' },
    'Tab': { type: 'TabHandle', func: 'GetTabHandle' },
    'TextListBox': { type: 'TextListBoxHandle', func: 'GetTextListBoxHandle' },
    'Texture': { type: 'TextureHandle', func: 'GetTextureHandle' },
    'Tree': { type: 'TreeHandle', func: 'GetTreeHandle' },
    'EffectViewportWnd': { type: 'EffectViewportWndHandle', func: 'GetEffectViewportWndHandle' },
    'CharacterViewportWindow': { type: 'CharacterViewportWindowHandle', func: 'GetCharacterViewportWindowHandle' },
    'ItemWindow': { type: 'ItemWindowHandle', func: 'GetItemWindowHandle' },
    'Html': { type: 'HtmlHandle', func: 'GetHtmlHandle' },
    // Add more fallback for 'Control' or unknown??
};

function traverseXML(node: any, currentPath: string, result: UIElement[]) {
    if (typeof node === 'object' && node !== null) {
        for (const key in node) {
            // Check if key is a known UI tag
            if (tagMap[key]) {
                const elementOrArray = node[key];
                if (Array.isArray(elementOrArray)) {
                    elementOrArray.forEach(child => processNode(key, child, currentPath, result));
                } else {
                    processNode(key, elementOrArray, currentPath, result);
                }
            } else if (key !== 'name') {
                 // Continue traversing if it's a nested structure (though usually XML parser handles children as properties)
                 // But wait, fast-xml-parser usually puts children as keys.
                 // Need to be careful not to recurse into attributes if they are just properties.
                 // The parser config 'ignoreAttributes: false' puts attributes as properties.
                 // We only traverse keys that are objects?
                 // No, in our XML structure, children are nested tags.
                 // We shouldn't blindly traverse keys as path.
                 // The 'path' in GetHandle("Path") logic usually follows the 'name' attribute hierarchy.
            }
        }
    }
}

function processNode(tag: string, node: any, parentPath: string, result: UIElement[]) {
    // Check if this node has a 'name' attribute
    const name = node.name;
    
    if (name && name !== 'undefined' && name !== '-9999') {
        const mapping = tagMap[tag];
        const fullPath = parentPath ? `${parentPath}.${name}` : name;
        
        result.push({
            name: name,
            type: mapping.type,
            func: mapping.func,
            fullPath: fullPath
        });

        // Traverse children
        // Children are properties of 'node' that match tags
        for (const childKey in node) {
             if (tagMap[childKey]) {
                 // It's a child element
                const childOrArray = node[childKey];
                if (Array.isArray(childOrArray)) {
                    childOrArray.forEach(child => processNode(childKey, child, fullPath, result));
                } else {
                    processNode(childKey, childOrArray, fullPath, result);
                }
             } else if (childKey === 'Window') { 
                // Explicitly check for Window nesting if not in tagMap (though Window is in tagMap)
             }
        }
    }
}

async function injectCode(editor: vscode.TextEditor, element: UIElement) {
    const document = editor.document;
    const text = document.getText();

    const edits: { text: string, position: vscode.Position }[] = [];

    // 0. Determine Unique Variable Name
    let varName = element.name;
    const parentName = getParentName(element.fullPath);
    
    // Check if variable already exists
    // Regex to match "var Type Name;"
    // We need to be careful: if it exists, is it the SAME element (same path)?
    // If same path, we use the existing name (and maybe update/init if missing).
    // If different path, we rename.
    
    const existingVarRegex = new RegExp(`var\\s+${element.type}\\s+(\\w+)\\s*;`, 'g');
    let match;
    let collisionFound = false;

    // We scan all vars of this type to see if our name is taken
    // Actually, simple check: does 'var Type varName;' exist?
    // Or just 'varName' usage? Uniqueness is usually per class scope.
    // Let's assume class scope uniqueness.
    
    // Helper to check if a specific var name exists
    const varExists = (name: string) => new RegExp(`var\\s+${element.type}\\s+${name}\\s*;`, 'i').test(text);

    if (varExists(varName)) {
        // Variable with this name exists. Check if it's assigned to the same path.
        // e.g. varName = GetHandle("Path");
        // We look for ANY assignment to this varName with a GetHandle call.
        const assignmentRegex = new RegExp(`${varName}\\s*=\\s*${element.func}\\s*\\(\\s*"([^"]+)"\\s*\\)\\s*;`, 'i');
        const assignmentMatch = assignmentRegex.exec(text);

        if (assignmentMatch) {
            const existingPath = assignmentMatch[1];
            if (existingPath !== element.fullPath) {
                // Collision! Same name, different path.
                collisionFound = true;
            } else {
                // Same name, same path. Already imported or compatible.
                // We keep varName as is.
            }
        } else {
            // Variable exists but not initialized? Or initialized with something else.
            // Safe to assume collision if we are importing a new specific path.
            // If the user manually defined 'var ButtonHandle MyBtn;' and we want to import 'MyBtn' from XML, 
            // maybe they meant this one. But if they haven't initialized it, we might double init?
            // User request implies: "If RegiFeeTitle_txt exists... create RegiFeeTitle_txt_Dialog_Wnd"
            // So if it exists, we assume collision unless proven it's this exact one.
            // But if it's this exact one, usually we'd see the init.
            // Let's assume if var exists and we can't confirm it's ours, we rename to be safe OR we assume collision.
            // Given the user prompt "existen 2 campos com o mesmo nome... crie a regra", implies distinct elements.
            // Unique path = unique element.
            collisionFound = true;
        }
    }

    if (collisionFound) {
        // Strategy: {name}_{parent}
        // If parent is empty/root, maybe just keep name? But we found collision.
        // If Parent is not empty:
        if (parentName) {
            varName = `${element.name}_${parentName}`;
            
            // Check again if THIS new name exists
             if (varExists(varName)) {
                 // Check if it matches OUR path
                const assignmentRegex = new RegExp(`${varName}\\s*=\\s*${element.func}\\s*\\(\\s*"([^"]+)"\\s*\\)\\s*;`, 'i');
                const assignmentMatch = assignmentRegex.exec(text);
                 if (assignmentMatch && assignmentMatch[1] === element.fullPath) {
                     // It's already imported with the suffixed name. Good.
                     collisionFound = false; // We use this name
                 } else {
                     // Even the suffixed name is taken by something else?
                     // Edge case. We could append more parents or numbers.
                     // For now, let's leave it as is or maybe alert.
                     // User only asked for {name}_{parent}.
                 }
             }
        }
    }

    // 1. Prepare Variable Declaration
    const classRegex = /class\s+\w+\s+(?:extends|expands)\s+\w+[\s\S]*?;/i;
    const classMatch = classRegex.exec(text);
    
    if (!classMatch) {
         vscode.window.showErrorMessage("Could not find class declaration.");
         return;
    }

    const varDecl = `var ${element.type} ${varName};`;
    // Check uniqueness again just for insertion logic
    if (!varExists(varName)) {
        // Search for the last "var ...Handle ...;" to insert AFTER it
        // We match `var` followed by anything, then `Handle`, check line by line?
        // Let's rely on regex `var\s+\w+Handle\s+.*;` global search.
        const handleVarRegex = /var\s+\w+Handle\s+.*;/g;
        let lastMatch: RegExpExecArray | null = null;
        let tempMatch;
        while ((tempMatch = handleVarRegex.exec(text)) !== null) {
            lastMatch = tempMatch;
        }

        let insertPos: vscode.Position;
        let varDeclWithPrefix: string;
        if (lastMatch) {
            // Insert after the last handle variable
            const endPos = document.positionAt(lastMatch.index + lastMatch[0].length);
            insertPos = endPos;
            varDeclWithPrefix = `\n${varDecl}`;
        } else {
            // No handles yet, insert after class declaration
            const endOfClassDecl = classMatch.index + classMatch[0].length;
            insertPos = document.positionAt(endOfClassDecl);
            varDeclWithPrefix = `\n${varDecl}`;
        }
        
        // Minor formatting: If inserting after class, we might want double newline if not present, but simple newline is safe.
        edits.push({
            text: varDeclWithPrefix,
            position: insertPos
        });
    }

    // 2. Prepare Initialization in OnLoad
    const onLoadRegex = /event\s+OnLoad\s*\(\s*\)/i;
    const onLoadMatch = onLoadRegex.exec(text);
    
    const initLine = `${varName} = ${element.func}("${element.fullPath}");`;

    if (onLoadMatch) {
        // Find the opening brace after OnLoad
        const afterOnLoadMatch = text.substring(onLoadMatch.index);
        const braceIndex = afterOnLoadMatch.indexOf('{');
        
        if (braceIndex !== -1) {
             const absoluteBraceIndex = onLoadMatch.index + braceIndex;
             // Check if already initialized to the SAME path
             const assignRegex = new RegExp(`${varName}\\s*=\\s*${element.func}\\s*\\(\\s*"${element.fullPath.replace(/\./g, '\\.')}"\\s*\\)\\s*;`, 'i');
            
             if (!assignRegex.test(text)) {
                 // Scan for the last "Get...Handle(" inside OnLoad
                 // We need to limit search to inside OnLoad block roughly.
                 // Finding end of OnLoad is tricky without tokenizer.
                 // Heuristic: Search for ` = Get...Handle(...)` starting from OnLoad pos.
                 // We assume handles are grouped.
                 // We search from OnLoad start, but we want the *last* one.
                 // If we find one, we use it. If not, insert after `{`.
                 
                 // Look for assignments *after* OnLoad header
                 const textFromGeneric = text.substring(absoluteBraceIndex); // from { onwards
                 const getHandleRegex = /=\s*Get\w+Handle\s*\(.*\)\s*;/g;
                 
                 let lastGetHandleIndex = -1;
                 let lastGetHandleLength = 0;
                 let m;
                 
                 // Note: this regex might match stuff outside OnLoad if OnLoad is short and user has other functions.
                 // But typically Get*Handle is only in OnLoad.
                 // Risk: confusing with other functions.
                 // We could check indentation?
                 // Safer: Just find assignments up to next `event` or `function` keyword?
                 // Or just last one we find that looks like an init.
                 
                 // Let's limit search? No, `Get...Handle` is specific enough usually.
                 while ((m = getHandleRegex.exec(textFromGeneric)) !== null) {
                     // Check if this match is "too far"? e.g. different function.
                     // It's hard to know. But usually these are grouped.
                     lastGetHandleIndex = m.index;
                     lastGetHandleLength = m[0].length;
                 }
                 
                 if (lastGetHandleIndex !== -1) {
                     // Insert after the last GetHandle
                     const absPos = absoluteBraceIndex + lastGetHandleIndex + lastGetHandleLength;
                     edits.push({
                        text: `\n\t${initLine}`,
                        position: document.positionAt(absPos)
                     });
                 } else {
                     // Insert after brace {
                     edits.push({
                        text: `\n\t${initLine}`,
                        position: document.positionAt(absoluteBraceIndex + 1)
                     });
                 }
             }
        }
    } else {
        // Create OnLoad event
        const defaultPropsRegex = /defaultproperties/i;
        const dpMatch = defaultPropsRegex.exec(text);
        
        const onLoadBlock = `\n\nevent OnLoad()\n{\n\t${initLine}\n}\n`;
        const lastLine = document.lineCount;

        if (dpMatch) {
            edits.push({
                text: onLoadBlock,
                position: document.positionAt(dpMatch.index)
            });
        } else {
            edits.push({
                text: onLoadBlock,
                position: new vscode.Position(lastLine, 0)
            });
        }
    }

    if (edits.length > 0) {
        await editor.edit(editBuilder => {
            edits.forEach(edit => {
                editBuilder.insert(edit.position, edit.text);
            });
        });
        vscode.window.showInformationMessage(`Imported ${varName}`);
    } else {
        vscode.window.showInformationMessage(`${varName} is already imported.`);
    }
}

function getParentName(fullPath: string): string {
    const parts = fullPath.split('.');
    if (parts.length > 1) {
        return parts[parts.length - 2];
    }
    return '';
}
