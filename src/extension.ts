import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('Ralph Extension is now active!');

    // Register a command
    let disposable = vscode.commands.registerCommand('ralph-extension.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from Ralph Extension!');
    });

    // Register command to execute sequence: focus IDE → Option+Cmd+B → Cmd+T → paste "123"
    let typeCommand = vscode.commands.registerCommand('ralph-extension.typeHelloWorld', async () => {
        const predefinedText = '123\n456\n789';

        // Step 1: Focus the entire IDE window/editor
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        await new Promise(resolve => setTimeout(resolve, 50));

        // Step 2: Copy the predefined text to clipboard
        await vscode.env.clipboard.writeText(predefinedText);
        await new Promise(resolve => setTimeout(resolve, 50));

        // Step 3: Execute Option + Command + B
        await vscode.commands.executeCommand('composerMode.agent');
        await new Promise(resolve => setTimeout(resolve, 100));

        /*
        // Step 4: Execute Command + T (Quick Open dialog)
        await vscode.commands.executeCommand('workbench.action.quickOpen');
        await new Promise(resolve => setTimeout(resolve, 150));
*/
        // Step 5: Paste the text using Command+V
        await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
    });

    context.subscriptions.push(disposable, typeCommand);
}

export function deactivate() { }

