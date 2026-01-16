import { lintAst } from "../../lib/lint";
// import { Utils } from "../../lib/lint/buildFullLinter";
import { LintResult } from "../../lib/lint/LintResult";
import { ExtensionConfiguration } from "../config";
import { vscode } from "../vscode";
import { getVsCodeDocumentAst } from "./getAst";
import { db } from "../state"; 

export function processLinterRules(document: vscode.TextDocument, config: ExtensionConfiguration): Iterable<LintResult> {
    const ast = getVsCodeDocumentAst(document);
    // processLinterRules usually calls lintAst, which calls buildFullLinter. 
    // We need to intercept or pass db through config.
    // Looking at lint.ts, it calls buildFullLinter(config).
    // So we can pass db in the config object.
    const linterConfig = {
        ...config.linterConfiguration,
        ...config.linterConfiguration,
        db: db.libdb,
        vscodeDb: db,
        uri: document.uri.toString()
    };
    return lintAst(ast, linterConfig);
}
