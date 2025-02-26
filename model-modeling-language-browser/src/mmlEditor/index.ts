/**
 * Configuration for monaco-editor-wrapper 1.6.0
 *
 *
 * "monaco-editor-wrapper": "^1.6.0",
 */


import {buildWorkerDefinition} from 'monaco-editor-workers';
import {CodeEditorConfig, monaco, MonacoEditorLanguageClientWrapper, WorkerConfigOptions} from 'monaco-editor-wrapper';
import {Diagnostic, DiagnosticSeverity, NotificationType} from 'vscode-languageserver/browser.js';

type DocumentChange = { uri: string, content: string, diagnostics: Diagnostic[] };

// registers a factory function determining the required bundle
//  and firing up a worker taking over some task of the monaco editor in background
buildWorkerDefinition('.', import.meta.url, true);

// hooks monaco-specific css-definitions into the dom
MonacoEditorLanguageClientWrapper.addMonacoStyles('monaco-editor-styles');

// instantiate the language wrapper collecting the editor settings, ...
const client = new MonacoEditorLanguageClientWrapper('42');

// ... add the required settings, ...
configureEditor((client.getEditorConfig()));

// ... and fire the editor within the given container, ...
client.startEditor(document.getElementById("monaco-editor-root") || undefined);
const editor = client.getEditor();


let workspacePath: string | undefined = undefined;

const generatorStorage: Map<string, string> = new Map<string, string>();
const diagnosticStorage: Map<string, number> = new Map<string, number>();

// ... and register a notification listener expecting the AST in json,
//  deserializing and storing metamodels and instances in the cache.
// Such notifications are not sent by Langium by default,
//  it's a customization in the extended language server implementation,
//  see node_modules/model-modeling-langugage/src/language-server/main-browser.ts
client.getLanguageClient()?.onNotification(
    new NotificationType<DocumentChange>('browser/DocumentChange'),
    dc => {
        const errors = dc.diagnostics.filter(d => d.severity === DiagnosticSeverity.Error);
        if (errors.length !== 0) {
            console.log(`Input contains error in line ${errors[0].range.start.line}: ${errors[0].message}`);
            diagnosticStorage.set(dc.uri, errors.length);
            generatorStorage.delete(dc.uri);
        } else {
            const result = dc.content
            generatorStorage.set(dc.uri, result);
            diagnosticStorage.delete(dc.uri);
            console.log("Final computable expression is equal to: " + result);
        }
    }
);

function configureEditor(editorConfig: CodeEditorConfig) {
    editorConfig.setTheme('vs-dark');
    editorConfig.setAutomaticLayout(true /* 'true' is the default value! */);
    editorConfig.setUseLanguageClient(true);
    editorConfig.setUseWebSocket(false);
    editorConfig.setMainLanguageId('model-modeling-language');
    editorConfig.setMonacoEditorOptions({
        "semanticHighlighting.enabled": true,
        fontLigatures: true,
        smoothScrolling: true,
        glyphMargin: true,
        autoClosingBrackets: "always",
        bracketPairColorization: {enabled: true, independentColorPoolPerBracketType: true}
    });
    editorConfig.setLanguageClientConfigOptions(<WorkerConfigOptions>{
        workerType: 'module',
        workerName: 'LS',
        workerURL: new URL('./mmlServerWorker.js', import.meta.url).href
    });

    editorConfig.setMonarchTokensProvider({
        keywords: [
            '@opposite', 'abstract', 'as', 'attribute', 'bool', 'class', 'derived', 'double', 'enum', 'extends', 'false', 'float', 'for', 'function', 'id', 'implements', 'import', 'in', 'instance', 'int', 'interface', 'macro', 'ordered', 'package', 'readonly', 'reference', 'resolve', 'return', 'returns', 'string', 'transient', 'true', 'tuple', 'unique', 'unsettable', 'using', 'volatile'
        ],
        operators: [
            '%', '*', '+', ',', '-', '->', '.', '..', '/', ':', ';', '=', '^'
        ],
        symbols: /%|\(|\)|\*|\+|,|-|->|\.|\.\.|\/|:|;|=|\[|\]|\^|\{|\}/,

        tokenizer: {
            initial: [
                {regex: /[0-9]+/, action: {"token": "number"}},
                {regex: /"[^"]*"/, action: {"token": "string"}},
                {
                    regex: /[a-zA-Z_][\w_]*/,
                    action: {cases: {'@keywords': {"token": "keyword"}, '@default': {"token": "string"}}}
                },
                {include: '@whitespace'},
                {regex: /@symbols/, action: {cases: {'@operators': {"token": "operator"}, '@default': {"token": ""}}}},
            ],
            whitespace: [
                {regex: /\s+/, action: {"token": "white"}},
                {regex: /\/\*/, action: {"token": "comment", "next": "@comment"}},
                {regex: /[^:]\/\/[^\n\r]*/, action: {"token": "comment"}},
            ],
            comment: [
                {regex: /[^\/\*]+/, action: {"token": "comment"}},
                {regex: /\*\//, action: {"token": "comment", "next": "@pop"}},
                {regex: /[\/\*]/, action: {"token": "comment"}},
            ],
        }
    });
}

/**
 * Initialize workspace
 * Creates models for every passed file
 * @param basepath Pathprefix
 * @param models Deserialized model entries
 */
function initializeWorkspace(basepath: string, models: [{ path: string, text: string }]): number {
    workspacePath = basepath;
    diagnosticStorage.clear();
    generatorStorage.clear();

    for (let i = 0; i < models.length; i++) {
        const model: { path: string, text: string } = models[i];
        const deserializedPath: string = model.path.replace("\\", "/");
        monaco.editor.createModel(model.text
            , "model-modeling-language", monaco.Uri.parse("file:///" + deserializedPath));
    }
    return models.length;
}

/**
 * Initialize workspace
 * Creates models for every passed file
 * @param basepath Pathprefix
 * @param models Serialized model entries
 */
export function initializeWorkspaceJson(basepath: string, models: string): number {
    console.log(models);
    return initializeWorkspace(basepath, JSON.parse(models));
}

/**
 * Update a previously initialized model
 * @param model Deserialized model entry
 */
function updateModel(model: { path: string, text: string }): boolean {
    if (editor == undefined) {
        return false;
    }
    const openedModel: monaco.editor.ITextModel | null = editor.getModel();
    const deserializedPath: string = model.path.replace("\\", "/");
    const targetUri: monaco.Uri = monaco.Uri.parse("file:///" + deserializedPath);
    //if (openedModel != null && openedModel.uri.path == targetUri.path) {
    //    return false;
    //}
    const targetModel: monaco.editor.ITextModel | null = monaco.editor.getModel(targetUri);
    if (targetModel == null) {
        return false;
    }
    targetModel.setValue(model.text);
    return true;
}

/**
 * Update a previously initialized model
 * @param model Serialized model entry
 */
export function updateModelJson(model: string) {
    console.log(model);
    return updateModel(JSON.parse(model));
}

/**
 * Opens the requested model as long as it was previously added during initialization.
 * @param modelPath Model URI
 */
export function openModel(modelPath: string): boolean {
    if (editor != undefined) {
        const modelUri = monaco.Uri.parse("file:///" + modelPath);
        const model: monaco.editor.ITextModel | null = monaco.editor.getModel(modelUri);
        if (model == null) {
            return false;
        }
        editor.setModel(model);
        return true;
    }
    return false;
}

interface GraphResult {
    generator: { uri: string, gen: string }[];
    diagnostic: { uri: string, err: number }[];
}

/**
 * Function packs all cache entries (diagnostics and generators)
 * into a common representation and returns it
 */
export function getCombinedGeneratorResult(): string {
    if (workspacePath == undefined) {
        return "{}";
    }

    console.log(generatorStorage.size);
    const generatorResult: { uri: string, gen: string }[] = [];
    const diagnosticResult: { uri: string, err: number }[] = [];
    generatorStorage.forEach((val, key) => generatorResult.push({uri: key, gen: val}));
    diagnosticStorage.forEach((val, key) => diagnosticResult.push({uri: key, err: val}));

    const graphResult: GraphResult = {generator: generatorResult, diagnostic: diagnosticResult};
    console.warn(JSON.stringify(graphResult));
    return JSON.stringify(graphResult);
}

/**
 * Function allows the export of all models. This is important in order to transfer
 * any changes made in the editor to the local file system.
 */
export function exportWorkspace() {
    const models: monaco.editor.ITextModel[] = monaco.editor.getModels();

    interface IModel {
        path: string,
        text: string
    }

    const preprocessedModels: IModel[] = models.map(model => <IModel>{
        path: model.uri.toString(),
        text: model.getValue(monaco.editor.EndOfLinePreference.TextDefined, true)
    });
    return JSON.stringify(preprocessedModels);
}

/**
 * Function is called by the ClipboardAdapter to insert the passed text in place of the current selection.
 * @param text Text to insert
 */
export function setPaste(text: string) {
    if (editor != undefined) {
        const selection = editor.getSelection();
        if (selection != null) {
            const id = {major: 1, minor: 1};
            const op = {identifier: id, range: selection, text: text, forceMoveMarkers: true};
            editor.executeEdits("clipboardConnector", [op]);
        }
    }
}

/**
 * Function is called by the clipboard adapter to return the contents of the current selection.
 */
export function getCopy() {
    const selection: Selection | null = window.getSelection();
    if (selection == null || !selection.rangeCount) {
        return "";
    }
    return selection.toString()
}

/**
 * To make functions available in the DOM, we need to export them additionally and
 * add them to the window object.
 */
declare global {
    interface Window {
        getCombinedGeneratorResult: any;
        initializeWorkspaceJson: any;
        openModel: any;
        updateModelJson: any;
        exportWorkspace: any;
        setPaste: any
        getCopy: any
    }
}

window.getCombinedGeneratorResult = getCombinedGeneratorResult;
window.initializeWorkspaceJson = initializeWorkspaceJson;
window.openModel = openModel;
window.updateModelJson = updateModelJson;
window.exportWorkspace = exportWorkspace;
window.setPaste = setPaste;
window.getCopy = getCopy;