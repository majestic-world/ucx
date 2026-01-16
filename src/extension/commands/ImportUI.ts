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

        // 5. Show QuickPick
        const picked = await vscode.window.showQuickPick(elements.map(e => ({
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

    // 1. Prepare Variable Declaration
    const classRegex = /class\s+\w+\s+(?:extends|expands)\s+\w+[\s\S]*?;/i;
    const classMatch = classRegex.exec(text);
    
    if (!classMatch) {
         vscode.window.showErrorMessage("Could not find class declaration.");
         return;
    }

    const varDecl = `var ${element.type} ${element.name};`;
    const varRegex = new RegExp(`var\\s+${element.type}\\s+${element.name}\\s*;`, 'i');

    if (!varRegex.test(text)) {
        const endOfClassDecl = classMatch.index + classMatch[0].length;
        edits.push({
            text: `\n${varDecl}`,
            position: document.positionAt(endOfClassDecl)
        });
    }

    // 2. Prepare Initialization in OnLoad
    const onLoadRegex = /event\s+OnLoad\s*\(\s*\)/i;
    const onLoadMatch = onLoadRegex.exec(text);
    
    const initLine = `${element.name} = ${element.func}("${element.fullPath}");`;

    if (onLoadMatch) {
        // Find the opening brace after OnLoad
        const afterOnLoad = text.substring(onLoadMatch.index);
        const braceIndex = afterOnLoad.indexOf('{');
        if (braceIndex !== -1) {
            const absoluteBraceIndex = onLoadMatch.index + braceIndex;
            const position = document.positionAt(absoluteBraceIndex + 1);
            
            // Check if already initialized to avoid duplication
            // We check the specific assignment line
            const assignRegex = new RegExp(`${element.name}\\s*=\\s*${element.func}\\s*\\(\\s*"${element.fullPath.replace(/\./g, '\\.')}"\\s*\\)\\s*;`, 'i');
            
            if (!assignRegex.test(text)) {
                 edits.push({
                    text: `\n\t${initLine}`,
                    position: position
                 });
            }
        }
    } else {
        // Create OnLoad event
        const defaultPropsRegex = /defaultproperties/i;
        const dpMatch = defaultPropsRegex.exec(text);
        
        const onLoadBlock = `\n\nevent OnLoad()\n{\n\t${initLine}\n}\n`;
        const lastLine = document.lineCount;

        // If we are appending OnLoad, we prefer before DefaultProperties
        if (dpMatch) {
            edits.push({
                text: onLoadBlock,
                position: document.positionAt(dpMatch.index)
            });
        } else {
            // Append to end of file, assuming inside class
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
        vscode.window.showInformationMessage(`Imported ${element.name}`);
    } else {
        vscode.window.showInformationMessage(`${element.name} is already imported.`);
    }
}
