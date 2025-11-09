import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('Ralph Extension is now active!');

    // Register a command
    let disposable = vscode.commands.registerCommand('ralph-extension.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from Ralph Extension!');
    });

    // Register command to open input box with predefined text
    let typeCommand = vscode.commands.registerCommand('ralph-extension.typeHelloWorld', async () => {
        // Open an input box with predefined text "ola como estas"
        const result = await vscode.window.showInputBox({
            prompt: 'Enter text',
            value: 'ola como estas',
            valueSelection: [0, 17] // Select all text so user can easily replace it
        });
        
        // Optional: do something with the result
        if (result) {
            console.log('User entered:', result);
        }
    });

    context.subscriptions.push(disposable, typeCommand);
}

export function deactivate() {}

